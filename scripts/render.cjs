#!/usr/bin/env node
/* Usage:
   node render.cjs <project> keyframes            -> qa/keyframes/*.jpg + qa/keyframes.json (9 moments)
   node render.cjs <project> still <t> [out.jpg]  -> single frame
   node render.cjs <project> layout               -> qa/layout.json (text boxes, contrast, frame-0 stats)
   node render.cjs <project> full [--workers N]   -> build/frames/00000.jpg ...
   Env: CHROMIUM=/path/to/chrome (optional), CKV_ALLOW_FONT_FALLBACK=1 (not recommended) */
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('Install playwright: npm i playwright (or set NODE_PATH to a node_modules containing it)'); process.exit(2); }
const ENGINE = path.resolve(__dirname, '..', 'engine', 'index.html');
const [, , projArg, mode = 'keyframes', ...rest] = process.argv;
if (!projArg) { console.error('usage: render.cjs <project> <keyframes|still|layout|full>'); process.exit(2); }
const P = path.resolve(projArg);
let SB;
if (projArg === '--doctor') SB = { format: 'landscape', style: 'noir-gold', scenes: [{id:'doctor',bars:1,lines:[]}] };
else {
  const resolved = require('child_process').spawnSync(process.env.CKV_PYTHON || 'python3', ['-B', path.join(__dirname,'project.py'), P], {encoding:'utf8'});
  if (resolved.status !== 0) { console.error(resolved.stderr || resolved.error); process.exit(1); }
  SB = JSON.parse(resolved.stdout);
  fs.mkdirSync(path.join(P,'build'),{recursive:true});
  fs.writeFileSync(path.join(P,'build','storyboard.resolved.json'),JSON.stringify(SB,null,2));
}
const { pathToFileURL } = require('url');
const fail = message => { throw new Error('STORYBOARD: ' + message); };
const styles = ['noir-gold','ink-wash','tech-hud','archive-doc','swiss-minimal','cosmic-blue'];
if (!styles.includes(SB.style)) fail('unknown style ' + SB.style);
if (!['portrait','landscape'].includes(SB.format)) fail('format must be portrait or landscape');
if (!Array.isArray(SB.scenes) || !SB.scenes.length) fail('scenes must be nonempty');
if (SB.fps !== undefined && (!Number.isInteger(SB.fps) || SB.fps < 1 || SB.fps > 120)) fail('fps must be an integer from 1 to 120');
const bpm = SB.music?.bpm ?? 120, bpb = SB.music?.beatsPerBar ?? 4;
if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isInteger(bpb) || bpb < 1) fail('invalid music timing');
const components = ['none','rings','question','bignum','matrix','duo','timeline','bars','dots','network','split','quote','code','image','custom','shot'];
const ids = new Set(); let sceneStart = 0;
for (const sc of SB.scenes) {
  if (typeof sc.id !== 'string' || !sc.id || ids.has(sc.id)) fail('missing or duplicate scene id');
  ids.add(sc.id);
  const duration = sc.durationSec !== undefined ? sc.durationSec : sc.bars * 60 / bpm * bpb;
  if (!Number.isFinite(duration) || duration <= 0) fail(sc.id + ': invalid scene duration');
  if (sc.durationSec === undefined && (!Number.isInteger(sc.bars) || sc.bars < 1)) fail(sc.id + ': bars must be a positive integer');
  const eventIds = new Set();
  for (const e of sc.events || []) { const clip = e.anchor && SB.narration?.clips?.find(c => c.id === e.anchor.clip); const at = e.anchor ? (clip ? clip.at + (e.anchor.offset || 0) - sceneStart : NaN) : e.at; if (!e.id || eventIds.has(e.id) || !Number.isFinite(at) || at < 0 || at >= duration || !Number.isFinite(e.duration) || e.duration <= 0) fail(sc.id + ': invalid event'); eventIds.add(e.id); }
  if (!components.includes(sc.visual?.type || 'none')) fail(sc.id + ': unknown component');
  if (sc.visual?.type === 'custom' && (!sc.visual.name || !fs.existsSync(path.join(P,'custom.js')))) fail(sc.id + ': custom component missing');
  if (sc.visual?.type === 'image' && !SB.images?.[sc.visual.src]) fail(sc.id + ': missing image mapping');
  for (const l of sc.lines || []) {
    if (typeof l.text !== 'string' || !['kicker','title','quote','sub','caption','note'].includes(l.role || 'title')) fail(sc.id + ': invalid text line');
    const at = l.atSec ?? ((l.at ?? (sc === SB.scenes[0] ? 0 : .5)) * 60 / bpm), out = l.outSec ?? ((l.out ?? duration * bpm / 60) * 60 / bpm);
    if (!Number.isFinite(at) || !Number.isFinite(out) || at < 0 || out <= at || out > duration + 1e-6) fail(sc.id + ': invalid line timing');
  }
  sceneStart += duration;
}
const fps = SB.fps || 30, Q = SB.jpegQuality || 0.92;
const opt = n => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const crypto = require('crypto'), cp = require('child_process');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function recordManifest(browser, info) {
  if (projArg === '--doctor') return;
  const engineDir=path.dirname(ENGINE), rendererFiles=[];
  for (const name of fs.readdirSync(engineDir).sort()) {
    const f=path.join(engineDir,name); if(fs.statSync(f).isFile())rendererFiles.push([name,hash(fs.readFileSync(f))]);
  }
  for(const name of ['render.cjs','project.py','shots.py','audio.py','mux.sh','build.sh'])rendererFiles.push(['scripts/'+name,hash(fs.readFileSync(path.join(__dirname,name)))]);
  const assets=[...(SB.fontFiles||[]).map(f=>({kind:'font',file:f.path,family:f.family,weight:f.weight})),...(SB.narration?.clips||[]).map(f=>({kind:'voice',file:f.file})),...Object.values(SB.images||{}).map(file=>({kind:'image',file}))].map(f=>Object.assign({},f,{sha256:hash(fs.readFileSync(path.resolve(P,f.file)))}));
  const customFile=path.join(P,'custom.js');
  const fingerprint={rendererHash:hash(JSON.stringify(rendererFiles)),projectHash:hash(JSON.stringify(SB)),factsHash:fs.existsSync(path.join(P,'facts.md'))?hash(fs.readFileSync(path.join(P,'facts.md'))):null,platform:process.platform+'-'+process.arch,customHash:fs.existsSync(customFile)?hash(fs.readFileSync(customFile)):null,node:process.versions.node,browser:browser.version(),ffmpeg:cp.execFileSync('ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0],size:[info.W,info.H],fps,jpegQuality:Q,assets};
  const manifest={version:1,fingerprint,rendererFiles,node:process.versions.node,python:process.env.CKV_PYTHON||'python3'};
  const qa=path.join(P,'qa');fs.mkdirSync(qa,{recursive:true});fs.writeFileSync(path.join(qa,'render-manifest.json'),JSON.stringify(manifest,null,2));
  const lockPath=path.join(P,'render-lock.json');
  if(mode==='lock')fs.writeFileSync(lockPath,JSON.stringify(manifest,null,2));
  else if(fs.existsSync(lockPath)) {
    const locked=JSON.parse(fs.readFileSync(lockPath,'utf8'));
    if(locked.version!==1 || JSON.stringify(locked.fingerprint)!==JSON.stringify(fingerprint))throw new Error('RENDER LOCK MISMATCH: project, renderer, assets, browser or FFmpeg changed. Inspect qa/render-manifest.json; explicitly regenerate the lock after verifying the change.');
  }
}

async function launch() {
  const tries = [process.env.CHROMIUM && { executablePath: process.env.CHROMIUM }, {}, { executablePath: '/usr/local/bin/chromium' }, { executablePath: '/usr/bin/chromium' }, { channel: 'chrome' }].filter(Boolean);
  const errors = [];
  for (const t of tries) { try { return await chromium.launch(Object.assign({ args: ['--allow-file-access-from-files', '--font-render-hinting=none'] }, t)); } catch (e) { errors.push(e.message); } }
  console.error(errors.join('\n')); 
  throw new Error('Could not launch Chromium. Run `npx playwright install chromium` or set CHROMIUM=/path/to/chrome');
}
async function openPage(browser) {
  const isP = SB.format === 'portrait', W = isP ? 1080 : 1920, H = isP ? 1920 : 1080;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page._ckvErrors = [];
  page.on('pageerror', e => { page._ckvErrors.push(e.message); console.error('[page error]', e.message); });
  page.on('console', m => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(pathToFileURL(ENGINE).href);
  const custom = path.join(P, 'custom.js'); if (fs.existsSync(custom)) await page.addScriptTag({ content: fs.readFileSync(custom, 'utf8') });
  const images = {}; for (const [k, v] of Object.entries(SB.images || {})) images[k] = pathToFileURL(path.resolve(P, v)).href;
  const fonts = (SB.fontFiles || []).map(f => ({family:f.family,weight:String(f.weight || '400'),source:'url(data:font/otf;base64,' + fs.readFileSync(path.resolve(P,f.path)).toString('base64') + ')'}));
  const info = await page.evaluate(([sb, im, fonts]) => window.CKV_BOOT(sb, im, fonts).then(r => Object.assign(r, { fontOK: window.CKV.fontOK })), [SB, images, fonts]);
  if (!info.fontOK && !process.env.CKV_ALLOW_FONT_FALLBACK) throw new Error('FONT MISSING: use storyboard.fontFiles for local Noto fonts, or install the requested style font.');
  if (page._ckvErrors.length) throw new Error(page._ckvErrors.join('\n'));
  recordManifest(browser, info);
  return { page, info };
}
async function grab(page, t, file) {
  const data = await page.evaluate(([t, q]) => { window.draw(t); return document.getElementById('c').toDataURL('image/jpeg', q); }, [t, Q]);
  if (page._ckvErrors.length) throw new Error(page._ckvErrors.join('\n'));
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
}
function keyTimes(info) {
  const scenes = []; let t0 = 0; const bar = 60 / ((SB.music && SB.music.bpm) || 120) * ((SB.music && SB.music.beatsPerBar) || 4);
  for (const s of SB.scenes) { const d = s.durationSec !== undefined ? s.durationSec : s.bars * bar; scenes.push([t0, d, s.id]); t0 += d; }
  if (SB.keyframes) return SB.keyframes.map(t => [t, 'custom']);
  const cand = []; for (const [a, d, id] of scenes) { cand.push([a + d * 0.38, id], [a + d * 0.82, id]); }
  const out = [[0, scenes[0][2] + ' · 首帧']]; const need = 8;
  for (let i = 0; i < need; i++) out.push(cand.length < need ? [info.duration * (i + 1) / (need + 1), 'timeline'] : cand[Math.round(i * (cand.length - 1) / (need - 1))]);
  out[out.length - 1] = [Math.max(0, info.duration - (SB.fadeOut ?? 1) - .1), scenes[scenes.length - 1][2] + ' · 结尾'];
  return out;
}
(async () => {
  const browser = await launch();
  try {
    if (mode === 'doctor') {
      const styles = projArg === '--doctor' ? ['noir-gold','swiss-minimal'] : [SB.style];
      for (const style of styles) { SB.style = style; const { page, info } = await openPage(browser); console.log('browser + font: ' + style + ' OK (' + info.W + 'x' + info.H + ')'); await page.close(); }
    } else if (mode === 'full') {
      const nW = +(opt('--workers') || Math.max(1, Math.min(4, require('os').cpus().length))); const out = path.join(P, 'build', 'frames'); fs.mkdirSync(out, { recursive: true });
      for (const f of fs.readdirSync(out)) fs.unlinkSync(path.join(out, f));
      const first = await openPage(browser); const N = first.info.frames; const pages = [first.page]; for (let i = 1; i < nW; i++) pages.push((await openPage(browser)).page);
      let done = 0; const t0 = Date.now();
      await Promise.all(pages.map(async (pg, w) => { for (let f = w; f < N; f += nW) { await grab(pg, f / fps, path.join(out, String(f).padStart(5, '0') + '.jpg')); if (++done % 150 === 0) console.log(`frames ${done}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`); } }));
      console.log(`DONE ${N} frames -> ${out}`);
      for (const pg of pages) await pg.close();
    } else {
      const { page, info } = await openPage(browser);
      const qa = path.join(P, 'qa'); fs.mkdirSync(qa, { recursive: true });
      if (mode === 'lock') console.log('render-lock.json written; future renders verify renderer, project, assets and browser/FFmpeg');
      else if (mode === 'still') { const t = +rest[0]; const f = rest[1] || path.join(qa, `still_${t.toFixed(2)}.jpg`); await grab(page, t, f); console.log(f); }
      else if (mode === 'keyframes') {
        const dir = path.join(qa, 'keyframes'); fs.mkdirSync(dir, { recursive: true }); for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
        const kt = keyTimes(info); const list = [];
        for (let i = 0; i < kt.length; i++) { const f = path.join(dir, `k${i}_${kt[i][0].toFixed(2)}.jpg`); await grab(page, kt[i][0], f); list.push({ file: f, t: kt[i][0], label: kt[i][1] }); }
        fs.writeFileSync(path.join(qa, 'keyframes.json'), JSON.stringify(list, null, 1)); console.log(`keyframes: ${list.length} -> ${dir}`);
      } else if (mode === 'layout') {
        const step = +(opt('--step') || 0.1), samples = [];
        for (let t = 0; t < info.duration - 0.02; t += step) {
          const r = await page.evaluate((t) => {
            const log = window.layoutAt(t, { noText: true }); const visualLog = [...(window.CKV._infoLog || [])], shotLog = [...(window.CKV._shotLog || [])]; const cv = document.getElementById('c'), g = cv.getContext('2d');
            const lum = (r, gg, b) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
            for (const b of log) { if (!(b.alpha > 0.5) || !b.w || b.deco) continue; const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y)), w = Math.min(cv.width - x, Math.ceil(b.w)), h = Math.min(cv.height - y, Math.ceil(b.h)); if (w < 2 || h < 2) continue; const d = g.getImageData(x, y, w, h).data, L = []; for (let i = 0; i < d.length; i += 4 * 7) L.push(lum(d[i], d[i + 1], d[i + 2])); L.sort((a, c) => a - c); b.bgP10 = L[Math.floor(L.length * 0.1)]; b.bgP25 = L[Math.floor(L.length * 0.25)]; b.bgP75 = L[Math.floor(L.length * 0.75)]; b.bgP50 = L[Math.floor(L.length * 0.5)]; b.bgP90 = L[Math.floor(L.length * 0.9)]; }
            let mean = null; if (t === 0) { window.draw(0); const d = g.getImageData(0, 0, cv.width, cv.height).data; let s = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { s += lum(d[i], d[i + 1], d[i + 2]); n++; } mean = s / n; }
            return { t, log, mean, visuals: visualLog, shots: shotLog };
          }, +t.toFixed(3));
          samples.push(r);
        }
        const style = await page.evaluate(() => ({ c: window.CKV.S.c, titleFill: window.CKV.S.titleFill, bigFill: window.CKV.S.bigFill, dark: window.CKV.S.dark, F: window.CKV.F, W: window.CKV.W, H: window.CKV.H, duration: window.CKV.duration, beat: window.CKV.beat, bar: window.CKV.bar, scenes: window.CKV.scenes.map(s => ({ id: s.id, t0: s.t0, t1: s.t1, turn: s.turn, lines: s.lines.map(l => ({ role: l.role, text: l.text, atS: l.atS, outS: l.outS, src: l.src })) })) }));
        fs.writeFileSync(path.join(qa, 'layout.json'), JSON.stringify({ style, samples })); console.log(`layout samples: ${samples.length} -> qa/layout.json`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

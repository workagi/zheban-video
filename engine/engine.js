/* CKV engine: deterministic frame renderer. window.draw(t) paints frame at time t (seconds).
   No requestAnimationFrame / Date / Math.random: everything derives from t and seeded RNG. */
(function () {
  const E = (window.CKV = window.CKV || {});
  const TAU = Math.PI * 2;

  // ---------- math / rng ----------
  E.clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  E.lerp = (a, b, k) => a + (b - a) * k;
  E.ease = {
    lin: k => k,
    out: k => 1 - Math.pow(1 - k, 3),
    in: k => k * k * k,
    inOut: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    expo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    back: k => { const c = 1.4; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }
  };
  E.hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  E.rng = seed => { let a = (typeof seed === 'string' ? E.hash(seed) : seed) >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  E.noise1 = (seed) => { const r = E.rng(seed), v = Array.from({ length: 256 }, r); return x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return E.lerp(v[i & 255], v[(i + 1) & 255], u); }; };
  E.fbm1 = (seed, oct = 4) => { const ns = Array.from({ length: oct }, (_, i) => E.noise1(seed + i * 97)); return x => { let s = 0, a = 0.5, f = 1, n = 0; for (const fn of ns) { s += fn(x * f) * a; n += a; a *= 0.5; f *= 2.03; } return s / n; }; };
  E.hexA = (hex, a) => { if (hex.startsWith('rgba')) return hex; const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

  // ---------- formats ----------
  const FORMATS = {
    landscape: {
      W: 1920, H: 1080, safe: { l: 96, r: 96, t: 54, b: 54 }, hook: { y: 62, h: 60 }, content: { t: 150, b: 860 },
      caption: { y: 868, h: 118 }, note: { y: 988, h: 36 },
      size: { hook: 34, kicker: 32, title: 92, quote: 76, sub: 50, caption: 50, big: 240, label: 34, note: 24, code: 42 },
      min: { hook: 30, kicker: 30, title: 64, quote: 56, sub: 48, caption: 48, big: 120, label: 30, note: 22, code: 30 }
    },
    portrait: {
      W: 1080, H: 1920, safe: { l: 72, r: 120, t: 230, b: 384 }, hook: { y: 236, h: 70 }, content: { t: 336, b: 1300 },
      caption: { y: 1312, h: 172 }, note: { y: 1492, h: 42 },
      size: { hook: 40, kicker: 38, title: 104, quote: 84, sub: 56, caption: 56, big: 300, label: 38, note: 28, code: 44 },
      min: { hook: 36, kicker: 36, title: 72, quote: 64, sub: 56, caption: 56, big: 150, label: 36, note: 26, code: 34 }
    }
  };
  const MAXLINES = { hook: 1, kicker: 1, title: 2, quote: 3, sub: 2, caption: 2, big: 1, label: 2, note: 1, code: 1 };
  E.FORMATS = FORMATS;

  // ---------- state ----------
  let canvas, ctx, F, W, H, S, SB, scenes = [], dur = 0, beat = 0.5, bar = 2, collect = false, LOG = [], OPTS = {};
  const tex = {};
  E.state = () => ({ F, W, H, S, SB, scenes, dur, beat, bar });
  // A render-time declaration, not image recognition. Custom components call this only
  // while the explanatory visual is actually drawn; QA reports its limited scope.
  E.info = (id, kind, box) => {
    if (!collect || !id || !kind || !box) return;
    const visible = box.w > 0 && box.h > 0 && box.x + box.w > 0 && box.y + box.h > 0 && box.x < W && box.y < H;
    E._infoLog.push({ id, kind, box, visible });
  };

  // ---------- init ----------
  E.init = async function (storyboard, canvasEl) {
    SB = storyboard; canvas = canvasEl;
    const fmt = SB.format === 'portrait' ? 'portrait' : 'landscape';
    F = FORMATS[fmt]; W = F.W; H = F.H; canvas.width = W; canvas.height = H; ctx = SB.productionMode === 'stable' ? canvas.getContext('2d', {willReadFrequently:true}) : canvas.getContext('2d');
    S = JSON.parse(JSON.stringify(window.CKV_STYLES[SB.style] || window.CKV_STYLES['noir-gold']));
    if (SB.styleOverrides) deepMerge(S, SB.styleOverrides);
    E.S = S; E.F = F; E.W = W; E.H = H;
    const bpm = (SB.music && SB.music.bpm) || 120, bpb = (SB.music && SB.music.beatsPerBar) || 4;
    beat = 60 / bpm; bar = beat * bpb; E.beat = beat; E.bar = bar;
    let t0 = 0; scenes = SB.scenes.map((sc, i) => { const d = sc.durationSec !== undefined ? sc.durationSec : sc.bars * bar; const events = (sc.events || []).map(e => { if (!e.anchor) return Object.assign({},e); const clip = (SB.narration?.clips || []).find(c => c.id === e.anchor.clip); if (!clip) throw new Error('Unknown narration anchor: ' + e.anchor.clip); return Object.assign({},e,{at:clip.at + (e.anchor.offset || 0) - t0}); }); const o = Object.assign({}, sc, { i, t0, t1: t0 + d, dur: d, events, seed: E.hash((SB.seed || 'ckv') + ':' + (sc.id || i)) }); t0 += d; return o; });
    dur = t0; E.duration = dur; E.scenes = scenes;
    await loadFonts();
    buildTextures();
    if (SB.productionMode === "stable") E.CINEMATIC.init();
    if (scenes.some(sc => sc.visual?.type === 'shot')) E.initShots();
    if (window.CKV_CUSTOM_INIT) await window.CKV_CUSTOM_INIT(E);
    for (const sc of scenes) {
      const v=sc.visual || {type:'none'};
      if (v.type === 'custom' && typeof (window.CKV_CUSTOM || {})[v.name] !== 'function') throw new Error('CUSTOM IMPLEMENTATION MISSING: '+sc.id+'/'+v.name);
      if (v.type === 'shot' && typeof E.SHOTS[v.name] !== 'function') throw new Error('SHOT IMPLEMENTATION MISSING: '+sc.id+'/'+v.name);
      if (sc.bg && typeof BG[sc.bg] !== 'function') throw new Error('BACKGROUND MISSING: '+sc.bg);
      if (sc.fg && typeof FG[sc.fg] !== 'function') throw new Error('FOREGROUND MISSING: '+sc.fg);
      layoutScene(sc);
    }
    return { duration: dur, frames: Math.round(dur * (SB.fps || 30)), W, H };
  };
  function deepMerge(a, b) { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) { a[k] = a[k] || {}; deepMerge(a[k], b[k]); } else a[k] = b[k]; } }

  async function loadFonts() {
    const fams = [S.fonts.title, S.fonts.body, S.fonts.mono];
    const ws = [S.weight.title, S.weight.body, S.weight.hook, S.weight.big, 400, 700];
    const sample = '囚徒困境博弈论合作背叛理性聪明人一二三年轮０123456789';
    const jobs = [];
    for (const f of fams) for (const w of ws) jobs.push(document.fonts.load(`${w} 40px ${f}`, sample).catch(() => null));
    await Promise.all(jobs); await document.fonts.ready;
    const c = document.createElement('canvas').getContext('2d');
    const m = f => { c.font = f; return c.measureText('囚徒困境博弈Ag').width; };
    E.fontOK = S.fonts.title.split(',').some(f => Math.abs(m(`40px ${f}, monospace`) - m('40px monospace')) > 0.5);
  }

  // ---------- textures ----------
  function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function buildTextures() {
    const r = E.rng('grain');
    tex.grain = [];
    for (let k = 0; k < 8; k++) {
      const c = mkCanvas(320, 320), g = c.getContext('2d'), im = g.createImageData(320, 320);
      for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 150; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      g.putImageData(im, 0, 0); tex.grain.push(c);
    }
    // vignette
    tex.vig = mkCanvas(W, H); { const g = tex.vig.getContext('2d'); const gr = g.createRadialGradient(W / 2, H * 0.47, Math.min(W, H) * 0.28, W / 2, H / 2, Math.hypot(W, H) * 0.56); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.65, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    if (S.overlay.paper) tex.paper = paperTexture();
    if (S.bg === 'mountains') tex.mtn = [0, 1, 2].map(i => mountainLayer(i));
    if (S.fg === 'mist') tex.branch = branchTexture();
    if (S.bg === 'nebula') tex.neb = nebulaTexture();
    if (S.overlay.scan) { tex.scan = mkCanvas(4, 4); const g = tex.scan.getContext('2d'); g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(0, 0, 4, 1); }
  }
  function paperTexture() {
    const c = mkCanvas(W, H), g = c.getContext('2d'), r = E.rng('paper');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { const x = r() * W, y = r() * H, l = 6 + r() * 30, a = r() * TAU; g.strokeStyle = `rgba(90,70,40,${0.03 + r() * 0.06})`; g.lineWidth = 0.6 + r(); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let i = 0; i < 14; i++) { const x = r() * W, y = r() * H, rad = 60 + r() * 320; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(150,110,60,${0.05 + r() * 0.07})`); gr.addColorStop(1, 'rgba(150,110,60,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    return c;
  }
  function mountainLayer(i) {
    const w = Math.round(W * 1.8), h = Math.round(H * 0.55), c = mkCanvas(w, h), g = c.getContext('2d');
    const n = E.fbm1(7000 + i * 31, 5), amp = [0.55, 0.62, 0.7][i], freq = [2.2, 3.2, 4.6][i];
    g.filter = `blur(${[5, 3, 1.6][i]}px)`;
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) { const v = n((x / w) * freq * 4); const y = h * (1 - amp * Math.pow(v, 1.6) - 0.08); g.lineTo(x, y); }
    g.lineTo(w, h); g.closePath();
    const gr = g.createLinearGradient(0, h * 0.15, 0, h); gr.addColorStop(0, 'rgba(28,26,23,1)'); gr.addColorStop(0.35, 'rgba(28,26,23,0.55)'); gr.addColorStop(1, 'rgba(28,26,23,0)');
    g.fillStyle = gr; g.fill(); g.filter = 'none';
    return c;
  }
  function branchTexture() {
    const c = mkCanvas(900, 600), g = c.getContext('2d'), r = E.rng('branch');
    const seg = (x, y, a, l, w, d) => { if (d > 6 || l < 10) return; const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; g.strokeStyle = 'rgba(28,26,23,0.92)'; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x2) / 2 + (r() - 0.5) * l * 0.3, (y + y2) / 2 + (r() - 0.5) * l * 0.3, x2, y2); g.stroke(); if (d > 2 && r() < 0.55) { g.fillStyle = `rgba(184,50,42,${0.6 + r() * 0.3})`; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x2 + (r() - 0.5) * 16, y2 + (r() - 0.5) * 16, 4 + r() * 5, 0, TAU); g.fill(); } } seg(x2, y2, a + (r() - 0.5) * 0.9, l * (0.62 + r() * 0.2), w * 0.66, d + 1); if (r() < 0.7) seg(x2, y2, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), l * 0.55, w * 0.55, d + 2); };
    g.filter = 'blur(1.2px)'; seg(900, 40, Math.PI * 0.86, 210, 16, 0); g.filter = 'none';
    return c;
  }
  function nebulaTexture() {
    const w = Math.round(W * 1.5), h = Math.round(H * 1.5), c = mkCanvas(w, h), g = c.getContext('2d'), r = E.rng('neb');
    g.globalCompositeOperation = 'lighter';
    const cols = ['#3b2a8a', '#1b4a9a', '#6a2a7a', '#0f6a8a', '#2a1a5a'];
    for (let i = 0; i < 46; i++) { const x = w * (0.25 + r() * 0.5) + (r() - 0.5) * w * 0.3, y = h * (0.3 + r() * 0.4), rad = 80 + r() * 420; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, E.hexA(cols[i % cols.length], 0.08 + r() * 0.1)); gr.addColorStop(1, E.hexA(cols[i % cols.length], 0)); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    return c;
  }

  // ---------- text ----------
  const mcache = new Map();
  function mw(font, ch) { const k = font + '|' + ch; let v = mcache.get(k); if (v === undefined) { ctx.font = font; v = ctx.measureText(ch).width; mcache.set(k, v); } return v; }
  E.fontFor = (role, size, wOverride) => {
    const fam = role === 'code' ? S.fonts.mono : (role === 'title' || role === 'big' || role === 'quote') ? S.fonts.title : S.fonts.body;
    const w = wOverride || (role === 'title' || role === 'quote' ? S.weight.title : role === 'big' ? S.weight.big : role === 'hook' || role === 'kicker' ? S.weight.hook : S.weight.body);
    return `${w} ${Math.round(size)}px ${fam}`;
  };
  const CLOSE = '，。！？、；：”’）》」』】…—·,.!?;:)%';
  function tokens(str) {
    const out = []; const runs = []; let em = false;
    str.split(/(\[\[|\]\])/).forEach(p => { if (p === '[[') em = true; else if (p === ']]') em = false; else if (p) runs.push({ s: p, em }); });
    for (const r of runs) { const re = /([A-Za-z0-9][A-Za-z0-9.,%'’\-+/×:]*|\n|\s|.)/gu; let m; while ((m = re.exec(r.s))) out.push({ s: m[0], em: r.em }); }
    return out;
  }
  E.wrap = function (str, role, size, maxW, trs = 1, weight) {
    const font = E.fontFor(role, size, weight), tr = ((S.tracking && S.tracking[role]) || 0) * size * trs;
    const lines = [[]]; let lw = 0;
    const tw = tk => { let w = 0; for (const ch of tk.s) w += mw(font, ch) + tr; return w; };
    for (const tk of tokens(str)) {
      if (tk.s === '\n') { lines.push([]); lw = 0; continue; }
      const w = tw(tk), cur = lines[lines.length - 1];
      if (lw + w > maxW && cur.length) {
        const close = CLOSE.includes(tk.s);
        let bi = -1; for (let q = cur.length - 1; q > cur.length * 0.3; q--) if ('·，、；：—'.includes(cur[q].s)) { bi = q; break; }
        if (bi < 0) for (let q = cur.length - 1; q > cur.length * 0.4; q--) if (cur[q].s === ' ') { bi = q; break; }
        if (tk.s !== ' ' && bi > 0) { const moved = cur.splice(bi + 1); while (moved.length && moved[0].s === ' ') moved.shift(); lines.push(moved); lw = moved.reduce((a, b) => a + b.w, 0); }
        else if (close) { if (cur.length > 1) { const moved = cur.splice(cur.length - 1); lines.push(moved); lw = moved[0].w; } } // 避头：标点不独占行首，带上前一个字一起换行
        else { lines.push([]); lw = 0; if (tk.s === ' ') continue; }
      }
      lines[lines.length - 1].push(Object.assign({ w }, tk)); lw += w;
    }
    const L = lines.map(l => { while (l.length && l[l.length - 1].s === ' ') l.pop(); return { toks: l, w: l.reduce((a, b) => a + b.w, 0) - (l.length ? tr : 0) }; }).filter(l => l.toks.length);
    return { lines: L, font, tr, trs, size, maxLineW: Math.max(0, ...L.map(l => l.w)) };
  };
  E.fit = function (str, role, maxW, opts = {}) {
    const base = opts.size || F.size[role], min = opts.min || F.min[role], maxL = opts.maxLines || MAXLINES[role] || 2;
    let size = Math.max(min, base), lay;
    for (let i = 0; i < 40; i++) { lay = E.wrap(str, role, size, maxW, 1, opts.weight); if (lay.lines.length <= maxL && lay.maxLineW <= maxW + 1) break; const ns = size * 0.95; if (ns < min) { size = min; lay = E.wrap(str, role, size, maxW, 1, opts.weight); break; } size = ns; }
    if ((lay.lines.length > maxL || lay.maxLineW > maxW + 1) && S.tracking && S.tracking[role]) // 字距大的风格：先收紧字距，再判溢出
      for (const trs of [0.6, 0.3, 0]) { const b = E.wrap(str, role, size, maxW, trs, opts.weight); lay = b; if (b.lines.length <= maxL && b.maxLineW <= maxW + 1) break; }
    if (lay.lines.length > 1 && opts.balance !== false && !/\n/.test(str)) {
      const n0 = lay.lines.length; let lo = lay.maxLineW * 0.45, hi = maxW;
      for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (E.wrap(str, role, size, mid, lay.trs, opts.weight).lines.length > n0) lo = mid; else hi = mid; }
      const b = E.wrap(str, role, size, hi + 1, lay.trs, opts.weight); if (b.lines.length === n0) lay = b;
    }
    const lh = size * (role === 'title' || role === 'big' ? 1.2 : role === 'quote' ? 1.32 : 1.42);
    lay.lh = lh; lay.h = lh * lay.lines.length; lay.overflow = lay.lines.length > maxL || lay.maxLineW > maxW + 1; lay.role = role;
    return lay;
  };
  function gradFill(c, cols, y0, y1) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, cols[0]); g.addColorStop(0.55, cols[1]); g.addColorStop(1, cols[2]); return g; }

  /* Draw a fitted layout. anim: {kin 0..1, kout 0..1, type, tIn(sec since in)} */
  E.drawLayout = function (c, lay, x, y, w, align, o = {}) {
    const role = lay.role, kin = o.kin === undefined ? 1 : o.kin, kout = o.kout === undefined ? 1 : o.kout, A = (o.alpha === undefined ? 1 : o.alpha);
    const type = o.anim || S.textIn, total = lay.lines.reduce((a, l) => a + l.toks.reduce((q, t) => q + [...t.s].length, 0), 0);
    const base = o.color || (role === 'kicker' ? S.c.accent : role === 'note' || role === 'hook' ? S.c.dim : S.c.text);
    const fancy = role === 'title' || role === 'quote' || role === 'big';
    const fillCols = role === 'big' ? S.bigFill : S.titleFill;
    let idx = 0, drawnAlpha = 0;
    c.save(); c.font = lay.font; c.textBaseline = 'alphabetic';
    if (S.dark && role !== 'hook') { c.shadowColor = S.c.shadow; c.shadowBlur = lay.size * 0.35; c.shadowOffsetY = lay.size * 0.04; }
    const outA = E.ease.inOut(kout);
    lay.lines.forEach((ln, li) => {
      const ly = y + li * lay.lh + lay.size * 0.95 + (lay.lh - lay.size * 1.2) / 2;
      let lx = align === 'center' ? x + (w - ln.w) / 2 : align === 'right' ? x + w - ln.w : x;
      if (type === 'wipe' && kin < 1) { c.save(); c.beginPath(); const ww = (ln.w + 40) * E.ease.expo(E.clamp(kin * 1.15 - li * 0.12)); c.rect(lx - 20, ly - lay.size * 1.2, ww, lay.lh * 1.3); c.clip(); }
      if (type === 'bleed' && kin < 1) c.filter = `blur(${(1 - E.ease.out(kin)) * lay.size * 0.12}px)`;
      const fill = fancy ? gradFill(c, fillCols, ly - lay.size * 0.9, ly + lay.size * 0.15) : base;
      for (const tk of ln.toks) {
        for (const ch of tk.s) {
          const cw = mw(lay.font, ch);
          let a = 1, dy = 0, sc = 1;
          const gi = idx / Math.max(1, total);
          if (type === 'rise') { const k = E.clamp((kin - gi * 0.45) / 0.55); a = E.ease.out(k); dy = (1 - E.ease.out(k)) * lay.size * 0.32; }
          else if (type === 'bleed') { a = E.ease.out(E.clamp(kin * 1.2 - gi * 0.2)); sc = 1 + (1 - E.ease.out(kin)) * 0.06; }
          else if (type === 'type' || type === 'typewriter') { a = idx < Math.floor(kin * (total + 0.999)) ? 1 : 0; }
          else if (type === 'glow') { a = E.ease.out(E.clamp(kin * 1.3 - gi * 0.3)); }
          else if (type === 'settle') { a = 1; dy = (1 - E.ease.out(kin)) * lay.size * 0.08; }
          a *= outA * A;
          if (a > 0.003 && !OPTS.noText) {
            c.globalAlpha = a; c.fillStyle = tk.em ? S.c.accent : fill;
            if (type === 'glow' && kin < 1) { c.shadowColor = S.c.accent; c.shadowBlur = (1 - kin) * lay.size * 0.8; }
            if (sc !== 1) { c.save(); c.translate(lx + cw / 2, ly - lay.size * 0.35); c.scale(sc, sc); c.fillText(ch, -cw / 2, lay.size * 0.35 + dy); c.restore(); }
            else c.fillText(ch, lx, ly + dy);
            if (type === 'typewriter' && a > 0 && tk.em) { c.save(); c.globalAlpha = a * 0.85; c.strokeStyle = S.c.accent; c.lineWidth = Math.max(2, lay.size * 0.05); c.beginPath(); c.moveTo(lx, ly + lay.size * 0.14); c.lineTo(lx + cw + lay.tr, ly + lay.size * 0.12); c.stroke(); c.restore(); }
            drawnAlpha = Math.max(drawnAlpha, a);
          }
          lx += cw + lay.tr; idx++;
        }
      }
      if (!OPTS.noText && (type === 'type') && kin < 1 && kin > 0 && Math.floor(kin * (total + 0.999)) <= idx && Math.floor(kin * (total + 0.999)) > idx - ln.toks.reduce((a, t) => a + [...t.s].length, 0)) { c.globalAlpha = outA * A; c.fillStyle = S.c.accent; c.fillRect(lx + 4, ly - lay.size * 0.8, lay.size * 0.08, lay.size * 0.9); }
      c.filter = 'none';
      if (type === 'wipe' && kin < 1) c.restore();
    });
    c.restore();
    const vis = Math.min(kin < 1 ? (type === 'type' || type === 'typewriter' ? (kin > 0 ? 1 : 0) : kin) : 1, outA) * A;
    if (collect && o.log !== false) {
      // QA samples pixels in canvas space, including caller translations/scales/rotations.
      const bx = align === 'center' ? x + (w - lay.maxLineW) / 2 : align === 'right' ? x + w - lay.maxLineW : x;
      const m = c.getTransform(), pts = [[bx,y],[bx+lay.maxLineW,y],[bx,y+lay.h],[bx+lay.maxLineW,y+lay.h]].map(([a,b])=>({x:m.a*a+m.c*b+m.e,y:m.b*a+m.d*b+m.f}));
      const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys);
      LOG.push({ role, text: lay.lines.map(l => l.toks.map(t => t.s).join('')).join('\n'), x:left,y:top,w:Math.max(...xs)-left,h:Math.max(...ys)-top,size:Math.round(lay.size*Math.hypot(m.c,m.d)),alpha:+vis.toFixed(3),overflow:lay.overflow,scene:o.scene,color:base,deco:!!o.deco });
    }
    return { w: lay.maxLineW, h: lay.h };
  };
  /* Convenience: fit + draw a label inside a component. */
  E.label = function (c, str, x, y, o = {}) {
    const role = o.role || 'label', w = o.maxW || 600;
    const lay = E.fit(String(str), role, w, o);
    const align = o.align || 'center';
    const bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const by = o.valign === 'middle' ? y - lay.h / 2 : o.valign === 'bottom' ? y - lay.h : y;
    E.drawLayout(c, lay, bx, by, w, align, Object.assign({ scene: E._scene }, o, { kin: o.kin === undefined ? 1 : o.kin }));
    return lay;
  };

  // ---------- strokes & panels ----------
  E.polyLen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  function partial(pts, k) { if (k >= 1) return pts; const L = E.polyLen(pts) * E.clamp(k); const out = [pts[0]]; let acc = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc + d >= L) { const f = (L - acc) / (d || 1); out.push([E.lerp(pts[i - 1][0], pts[i][0], f), E.lerp(pts[i - 1][1], pts[i][1], f)]); return out; } acc += d; out.push(pts[i]); } return out; }
  function resample(pts, step) { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / step)); for (let j = 1; j <= n; j++) out.push([E.lerp(x0, x1, j / n), E.lerp(y0, y1, j / n)]); } return out; }
  function path(c, p) { c.beginPath(); c.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]); }
  E.stroke = function (c, pts, o = {}) {
    if (!pts || pts.length < 2) return; const k = o.k === undefined ? 1 : o.k; if (k <= 0) return;
    const p = partial(pts, k), col = o.color || S.c.line, w = (o.width || 1) * S.line.width, A = o.alpha === undefined ? 1 : o.alpha, mode = o.mode || S.line.mode;
    const seed = o.seed || 1; c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    if (mode === 'glow') { c.globalAlpha = A * 0.18; c.strokeStyle = col; c.lineWidth = w * 5; path(c, p); c.stroke(); c.globalAlpha = A * 0.35; c.lineWidth = w * 2.2; c.stroke(); c.globalAlpha = A; c.lineWidth = w; c.stroke(); }
    else if (mode === 'crisp') { c.globalAlpha = A * 0.25; c.strokeStyle = col; c.lineWidth = w * 3.5; path(c, p); c.stroke(); c.globalAlpha = A; c.lineWidth = w; c.stroke(); c.fillStyle = col; const e = p[p.length - 1]; c.fillRect(e[0] - w * 1.5, e[1] - w * 1.5, w * 3, w * 3); }
    else if (mode === 'flat') { c.globalAlpha = A; c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'butt'; path(c, p); c.stroke(); }
    else if (mode === 'brush' || mode === 'pencil') {
      const r = E.rng(seed), q = resample(p, mode === 'brush' ? 5 : 7), n = q.length, passes = mode === 'brush' ? 3 : 2;
      for (let ps = 0; ps < passes; ps++) {
        const jit = (mode === 'brush' ? 1.6 : 1.1) * (ps + 0.5), wa = mode === 'brush' ? [1, 0.45, 0.25][ps] : [0.75, 0.4][ps];
        c.strokeStyle = col; c.globalAlpha = A * (mode === 'brush' ? [0.88, 0.35, 0.22][ps] : [0.85, 0.4][ps]);
        for (let i = 1; i < n; i++) { const s = i / n, pr = mode === 'brush' ? (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, s * 1.15)) ) * (0.85 + r() * 0.3) : 1; c.lineWidth = Math.max(0.6, w * wa * pr); c.beginPath(); c.moveTo(q[i - 1][0] + (r() - 0.5) * jit, q[i - 1][1] + (r() - 0.5) * jit); c.lineTo(q[i][0] + (r() - 0.5) * jit, q[i][1] + (r() - 0.5) * jit); c.stroke(); }
      }
    }
    c.restore();
  };
  E.rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y - 0.01]];
  /* Style-aware panel. Returns the text color to use on top of it. */
  E.panel = function (c, x, y, w, h, o = {}) {
    const k = o.k === undefined ? 1 : o.k, hi = o.highlight ? E.clamp(o.highlight) : 0, A = (o.alpha === undefined ? 1 : o.alpha) * E.ease.out(k), mode = S.panel, col = o.color || S.c.accent;
    c.save(); c.globalAlpha = A; let textColor = S.c.text;
    if (mode === 'ornate' || mode === 'glass' || mode === 'hud') {
      c.fillStyle = S.c.panel; c.fillRect(x, y, w, h);
      if (hi) { const g = c.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) * 0.7); g.addColorStop(0, E.hexA(col, 0.32 * hi)); g.addColorStop(1, E.hexA(col, 0.04 * hi)); c.fillStyle = g; c.fillRect(x, y, w, h); }
      c.strokeStyle = E.hexA(hi ? col : S.c.line, 0.35 + 0.55 * hi); c.lineWidth = mode === 'hud' ? 1.5 : 1.2; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      const L = Math.min(w, h) * 0.16; c.strokeStyle = hi ? col : S.c.accent; c.lineWidth = mode === 'hud' ? 3 : 2; c.globalAlpha = A * (0.7 + 0.3 * hi);
      for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { c.beginPath(); c.moveTo(cx, cy + sy * L); c.lineTo(cx, cy); c.lineTo(cx + sx * L, cy); c.stroke(); }
      if (mode === 'ornate') { c.globalAlpha = A * 0.25; c.strokeStyle = S.c.line; c.lineWidth = 1; c.strokeRect(x + 7, y + 7, w - 14, h - 14); }
      if (hi) textColor = mode === 'ornate' ? S.c.accent2 : S.c.text;
    } else if (mode === 'brush') {
      if (hi) { c.globalAlpha = A * 0.16 * hi; c.fillStyle = col; c.fillRect(x + 4, y + 4, w - 8, h - 8); c.globalAlpha = A; }
      E.stroke(c, [[x, y], [x + w, y + 2]], { width: 0.7, seed: x * 7 + y, alpha: A }); E.stroke(c, [[x + w, y], [x + w - 2, y + h]], { width: 0.6, seed: x + 3, alpha: A });
      E.stroke(c, [[x + w, y + h], [x, y + h - 2]], { width: 0.75, seed: y + 5, alpha: A }); E.stroke(c, [[x, y + h], [x + 2, y]], { width: 0.6, seed: x + y, alpha: A });
      if (hi > 0.5) { c.globalAlpha = A * hi; c.fillStyle = S.c.accent; const s = Math.min(w, h) * 0.16; c.fillRect(x + w - s - 10, y + 10, s, s); }
      if (hi) textColor = S.c.accent;
    } else if (mode === 'card') {
      c.shadowColor = S.c.shadow; c.shadowBlur = 18; c.shadowOffsetY = 6; c.fillStyle = S.c.panel; c.fillRect(x, y, w, h); c.shadowColor = 'transparent';
      c.globalAlpha = A * 0.5; c.fillStyle = 'rgba(230,220,190,0.9)'; c.fillRect(x + w / 2 - 50, y - 12, 100, 26); c.globalAlpha = A;
      c.strokeStyle = E.hexA(S.c.line, 0.25); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (hi) { const r = E.rng(Math.round(x + y)); const pts = []; for (let i = 0; i <= 40; i++) { const a = -0.4 + (i / 40) * TAU * 1.08; pts.push([x + w / 2 + Math.cos(a) * w * (0.47 + r() * 0.02), y + h / 2 + Math.sin(a) * h * (0.5 + r() * 0.03)]); } E.stroke(c, pts, { color: S.c.accent, width: 1.3, mode: 'pencil', k: hi, seed: 11 }); textColor = S.c.accent; }
    } else if (mode === 'flat') {
      if (hi) { c.fillStyle = col; c.globalAlpha = A * hi; c.fillRect(x, y, w, h); c.globalAlpha = A; textColor = hi > 0.5 ? '#ffffff' : S.c.text; }
      else { c.fillStyle = S.c.panel; c.fillRect(x, y, w, h); }
      c.strokeStyle = S.c.line; c.lineWidth = 4; c.strokeRect(x + 2, y + 2, w - 4, h - 4);
    }
    c.restore(); return textColor;
  };
  E.glowDot = function (c, x, y, r, col, a = 1) { c.save(); const g = c.createRadialGradient(x, y, 0, x, y, r * 4); g.addColorStop(0, E.hexA(col, a)); g.addColorStop(0.25, E.hexA(col, a * 0.5)); g.addColorStop(1, E.hexA(col, 0)); c.fillStyle = g; c.fillRect(x - r * 4, y - r * 4, r * 8, r * 8); c.restore(); };

  // ---------- layout ----------
  function regions(layout) {
    const s = F.safe, x0 = s.l, x1 = W - s.r, t = F.content.t, b = F.content.b, cw = x1 - x0, ch = b - t;
    const P = W < H; let L = layout || 'center';
    if (P && L === 'left') L = 'top'; if (P && L === 'right') L = 'bottom';
    const R = (x, y, w, h) => ({ x, y, w, h });
    if (L === 'left') return { text: R(x0, t, cw * 0.45, ch), vis: R(x0 + cw * 0.5, t, cw * 0.5, ch), align: 'left' };
    if (L === 'right') return { text: R(x0 + cw * 0.55, t, cw * 0.45, ch), vis: R(x0, t, cw * 0.5, ch), align: 'left' };
    if (L === 'top') return { text: R(x0, t, cw, ch * (P ? 0.36 : 0.4)), vis: R(x0, t + ch * (P ? 0.39 : 0.43), cw, ch * (P ? 0.61 : 0.57)), align: 'center' };
    if (L === 'bottom') return { text: R(x0, t + ch * (P ? 0.64 : 0.6), cw, ch * (P ? 0.36 : 0.4)), vis: R(x0, t, cw, ch * (P ? 0.61 : 0.57)), align: 'center' };
    return { text: R(x0, t, cw, ch), vis: R(x0, t, cw, ch), align: 'center' };
  }
  E.regions = regions;
  E.eventProgress = (sc, id, t) => { const e = (sc.events || []).find(e => e.id === id); if (!e) throw new Error('Unknown event: ' + id); return E.clamp((t - e.at) / (e.duration || 0.5)); };
  const GROUP = ['kicker', 'title', 'quote', 'sub'];
  function layoutScene(sc) {
    const rg = regions(sc.layout); sc.rg = rg; const beats = sc.dur / beat;
    sc.lines = (sc.lines || []).map((l, j) => {
      const at = l.at !== undefined ? l.at : (sc.i === 0 ? 0 : 0.5);
      return Object.assign({}, l, { j, role: l.role || 'title', atS: l.atSec !== undefined ? l.atSec : at * beat, outS: Math.min(sc.dur, l.outSec !== undefined ? l.outSec : (l.out !== undefined ? l.out : beats) * beat) });
    });
    const tw = rg.text.w, fitted = {};
    for (const l of sc.lines) {
      const maxW = l.role === 'caption' || l.role === 'note' ? (W - F.safe.l - F.safe.r) * (l.role === 'caption' ? 0.86 : 1) : tw;
      l.lay = E.fit(l.text, l.role, maxW, { size: l.size ? l.size * (F.size[l.role] || 50) : undefined });
      fitted[l.role] = Math.max(fitted[l.role] || 0, l.lay.h);
    }
    const gap = { kicker: 0.55, title: 0.42, quote: 0.42, sub: 0.3 };
    const roles = GROUP.filter(r => fitted[r]); let tot = 0;
    const total = () => { tot = 0; roles.forEach((r, i) => { tot += fitted[r] + (i < roles.length - 1 ? (F.size[r] * gap[r]) : 0); }); return tot; };
    for (let f = 0.95; total() > rg.text.h && f > 0.6; f -= 0.05) {
      for (const r of roles) fitted[r] = 0;
      for (const l of sc.lines) if (GROUP.includes(l.role)) { l.lay = E.fit(l.text, l.role, tw, { size: (l.size || 1) * F.size[l.role] * f }); fitted[l.role] = Math.max(fitted[l.role], l.lay.h); }
    }
    total();
    if (tot > rg.text.h && rg.vis !== rg.text) { // still too tall at min sizes: borrow space from the visual region
      const extra = Math.min(tot - rg.text.h + 12, rg.vis.h * 0.45); rg.vis = Object.assign({}, rg.vis); rg.text = Object.assign({}, rg.text);
      if (rg.vis.y >= rg.text.y + rg.text.h - 1) { rg.text.h += extra; rg.vis.y += extra; rg.vis.h -= extra; }
      else if (rg.vis.y + rg.vis.h <= rg.text.y + 1) { rg.text.y -= extra; rg.text.h += extra; rg.vis.h -= extra; }
    }
    let y = rg.text.y + (rg.text.h - tot) * (sc.textV !== undefined ? sc.textV : 0.5); const slotY = {};
    roles.forEach(r => { slotY[r] = y; y += fitted[r] + F.size[r] * gap[r]; });
    for (const l of sc.lines) {
      if (GROUP.includes(l.role)) { l.x = rg.text.x; l.w = rg.text.w; l.y = slotY[l.role] + (fitted[l.role] - l.lay.h) / 2; l.align = l.align || rg.align; }
      else if (l.role === 'caption') { l.x = F.safe.l; l.w = W - F.safe.l - F.safe.r; l.y = F.caption.y + (F.caption.h - l.lay.h) / 2; l.align = 'center'; }
      else if (l.role === 'note') { l.x = F.safe.l; l.w = W - F.safe.l - F.safe.r; l.y = F.note.y + (F.note.h - l.lay.h) / 2; l.align = l.align || 'center'; }
    }
    sc.textBottom = roles.length ? y : rg.text.y;
    const gl = sc.lines.filter(l => GROUP.includes(l.role));
    if (gl.length) { const x0 = Math.min(...gl.map(l => l.align === 'center' ? l.x + (l.w - l.lay.maxLineW) / 2 : l.x)), x1 = Math.max(...gl.map(l => (l.align === 'center' ? l.x + (l.w - l.lay.maxLineW) / 2 : l.x) + l.lay.maxLineW)), y0 = Math.min(...gl.map(l => l.y)), y1 = Math.max(...gl.map(l => l.y + l.lay.h)); sc.textRect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
  }

  // ---------- backgrounds ----------
  const BG = {}, FG = {}, PARTICLES = {}; E.BG = BG; E.FG = FG; E.PARTICLES = PARTICLES;
  BG.bokeh = (c, sc, tl, cam) => {
    const g = c.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62); g.addColorStop(0, S.c.bg0); g.addColorStop(1, S.c.bg1); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const r = E.rng(sc.seed); c.save(); c.globalCompositeOperation = 'lighter';
    const sx = W * (0.15 + r() * 0.7); const beam = c.createLinearGradient(sx, 0, sx + W * 0.25, H); beam.addColorStop(0, E.hexA(S.c.accent, 0.07)); beam.addColorStop(1, E.hexA(S.c.accent, 0)); c.fillStyle = beam; c.beginPath(); c.moveTo(sx - W * 0.05, 0); c.lineTo(sx + W * 0.08, 0); c.lineTo(sx + W * 0.4, H); c.lineTo(sx + W * 0.1, H); c.fill();
    for (let i = 0; i < 9; i++) { const rad = Math.min(W, H) * (0.08 + r() * 0.22), x = r() * W + Math.sin(tl * 0.25 + i) * 30 + cam.x * 0.3, y = r() * H + Math.cos(tl * 0.2 + i * 2) * 20, a = 0.035 + r() * 0.07; E.glowDot(c, x, y, rad / 4, S.c.accent, a); }
    c.restore();
  };
  BG.mountains = (c, sc, tl, cam) => {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, S.c.bg0); g.addColorStop(1, S.c.bg1); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const r = E.rng(sc.seed);
    if (r() < 0.6) { const x = W * (0.2 + r() * 0.6), y = H * (W > H ? 0.32 : 0.3), rad = Math.min(W, H) * 0.11; c.save(); c.globalAlpha = 0.55; const sg = c.createRadialGradient(x, y, rad * 0.6, x, y, rad * 1.05); sg.addColorStop(0, E.hexA(S.c.accent, 0.75)); sg.addColorStop(1, E.hexA(S.c.accent, 0)); c.fillStyle = sg; c.fillRect(x - rad * 1.2, y - rad * 1.2, rad * 2.4, rad * 2.4); c.restore(); }
    const base = r() * 0.4;
    tex.mtn.forEach((m, i) => { const depth = [0.25, 0.55, 1][i], a = [0.2, 0.3, 0.42][i]; const yy = H * ([0.42, 0.52, 0.64][i] + (W < H ? 0.06 : 0)); const ox = -((base + i * 0.13 + tl * 0.006 * depth) % 0.44) * m.width - cam.x * depth; c.globalAlpha = a; c.drawImage(m, ox, yy, m.width, m.height * (W < H ? 0.9 : 1)); });
    c.globalAlpha = 1;
    for (let i = 0; i < 3; i++) { const y = H * (0.6 + i * 0.13), mg = c.createLinearGradient(0, y - H * 0.08, 0, y + H * 0.1); mg.addColorStop(0, E.hexA(S.c.bg0, 0)); mg.addColorStop(0.5, E.hexA(S.c.bg0, 0.75)); mg.addColorStop(1, E.hexA(S.c.bg0, 0)); c.fillStyle = mg; c.fillRect(0, y - H * 0.08, W, H * 0.18); }
    const fade = c.createLinearGradient(0, H * 0.78, 0, H); fade.addColorStop(0, E.hexA(S.c.bg0, 0)); fade.addColorStop(1, E.hexA(S.c.bg0, 0.95)); c.fillStyle = fade; c.fillRect(0, H * 0.78, W, H * 0.22);
  };
  BG.grid = (c, sc, tl, cam) => {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, S.c.bg1); g.addColorStop(0.6, S.c.bg0); g.addColorStop(1, S.c.bg1); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const hz = H * 0.64, vx = W / 2 + cam.x * 0.5; c.save(); c.strokeStyle = S.c.accent; c.lineWidth = 1;
    for (let i = -24; i <= 24; i++) { c.globalAlpha = 0.11; c.beginPath(); c.moveTo(vx + i * 14, hz); c.lineTo(vx + i * W * 0.11, H); c.stroke(); }
    for (let k = 0; k < 14; k++) { const z = ((k + (tl * 0.9) % 1) / 14), y = hz + (H - hz) * Math.pow(z, 2.2); c.globalAlpha = 0.03 + 0.14 * z; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    const hg = c.createLinearGradient(0, hz - 60, 0, hz + 40); hg.addColorStop(0, E.hexA(S.c.accent, 0)); hg.addColorStop(0.6, E.hexA(S.c.accent, 0.16)); hg.addColorStop(1, E.hexA(S.c.accent, 0)); c.globalAlpha = 1; c.fillStyle = hg; c.fillRect(0, hz - 60, W, 100);
    c.globalAlpha = 0.07; c.fillStyle = S.c.accent; for (let y = 40; y < hz - 60; y += 36) for (let x = 20 + (y % 72 ? 18 : 0); x < W; x += 36) c.fillRect(x, y, 2, 2);
    const cx = W * 0.5, cy = H * 0.44, R = Math.min(W, H) * 0.42; c.globalAlpha = 0.09; c.lineWidth = 1.2; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke(); c.beginPath(); c.arc(cx, cy, R * 0.72, tl * 0.3, tl * 0.3 + Math.PI * 1.2); c.stroke();
    for (let i = 0; i < 72; i++) { const a = i / 72 * TAU + tl * 0.05, l = i % 6 ? 8 : 20; c.beginPath(); c.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.lineTo(cx + Math.cos(a) * (R + l), cy + Math.sin(a) * (R + l)); c.stroke(); }
    c.restore();
  };
  BG.archive = (c, sc, tl, cam) => {
    const g = c.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H / 2, Math.hypot(W, H) * 0.6); g.addColorStop(0, S.c.bg0); g.addColorStop(1, S.c.bg1); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const r = E.rng(sc.seed); c.save(); c.translate(-cam.x * 0.3, 0);
    c.globalAlpha = 0.07; c.strokeStyle = S.c.line; c.lineWidth = 1; for (let y = 120; y < H; y += 46) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.globalAlpha = 0.055; c.fillStyle = S.c.line; const bx = W * (r() < 0.5 ? 0.05 : 0.6), by = H * (0.15 + r() * 0.3);
    for (let i = 0; i < 12; i++) c.fillRect(bx, by + i * 30, W * (0.18 + r() * 0.18), 12);
    c.globalAlpha = 0.13; c.strokeStyle = S.c.accent; c.lineWidth = 5; const sx = W * (0.15 + r() * 0.7), sy = H * (0.2 + r() * 0.6), sr = Math.min(W, H) * 0.13; c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.stroke(); c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, sr * 0.82, 0, TAU); c.stroke();
    c.restore();
  };
  BG.blocks = (c, sc, tl, cam) => {
    c.fillStyle = S.c.bg0; c.fillRect(0, 0, W, H); const r = E.rng(sc.seed);
    c.save(); c.strokeStyle = 'rgba(0,0,0,0.06)'; c.lineWidth = 1; const cols = 12, gx = (W - F.safe.l - F.safe.r) / cols; for (let i = 0; i <= cols; i++) { c.beginPath(); c.moveTo(F.safe.l + i * gx, 0); c.lineTo(F.safe.l + i * gx, H); c.stroke(); }
    const num = String(sc.i + 1).padStart(2, '0'); c.font = `900 ${Math.round(H * 0.62)}px ${S.fonts.title}`; c.textBaseline = 'alphabetic'; c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.07)'; c.strokeText(num, W * 0.52 - cam.x * 0.4, H * 0.98);
    c.fillStyle = S.c.accent; const k = E.ease.expo(E.clamp(tl / 0.6)); c.fillRect(F.safe.l, F.content.t - 34, 90 * k, 12);
    c.restore();
  };
  BG.nebula = (c, sc, tl, cam) => {
    const g = c.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.6); g.addColorStop(0, S.c.bg0); g.addColorStop(1, S.c.bg1); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const r = E.rng(sc.seed); const n = tex.neb; c.save(); c.translate(W / 2, H / 2); c.rotate(r() * TAU + tl * 0.004); c.globalAlpha = 0.9; c.drawImage(n, -n.width / 2 - cam.x * 0.2, -n.height / 2); c.restore();
    const sr = E.rng('stars'); for (let i = 0; i < 260; i++) { const d = 0.2 + sr() * 0.8, x = (sr() * W * 1.2 - cam.x * d * 0.6 - tl * 3 * d) % (W * 1.2), y = sr() * H, tw = 0.5 + 0.5 * Math.sin(tl * (1 + sr() * 3) + i); c.globalAlpha = (0.25 + 0.6 * d) * tw; c.fillStyle = '#fff'; const s = 0.8 + d * 1.8; c.fillRect((x + W * 1.2) % (W * 1.2) - W * 0.1, y, s, s); }
    if (r() < 0.5) { const R = Math.max(W, H) * 1.1, cx = W * 0.5, cy = H + R * 0.82; c.globalAlpha = 1; const pg = c.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.04); pg.addColorStop(0, 'rgba(10,14,40,1)'); pg.addColorStop(0.5, E.hexA(S.c.accent, 0.35)); pg.addColorStop(1, E.hexA(S.c.accent, 0)); c.fillStyle = pg; c.beginPath(); c.arc(cx, cy, R * 1.04, 0, TAU); c.fill(); c.fillStyle = '#03040c'; c.beginPath(); c.arc(cx, cy, R * 0.985, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  };
  // ---------- foreground motifs (near-camera layer) ----------
  FG.orbs = (c, sc, tl) => { const r = E.rng(sc.seed + 5); for (let i = 0; i < 2; i++) { const left = r() < 0.5, x = (left ? -0.05 : 1.05) * W + (left ? 1 : -1) * tl * 18, y = H * (0.15 + r() * 0.7), rad = Math.min(W, H) * (0.18 + r() * 0.14); E.glowDot(c, x, y, rad / 4, S.c.accent2, 0.1 + r() * 0.06); } };
  FG.mist = (c, sc, tl) => { const b = tex.branch, P = W < H, s = P ? 0.42 : 0.62, r = E.rng(sc.seed); if (r() < 0.75) { c.save(); c.globalAlpha = 0.85; const flip = r() < 0.5; c.translate(flip ? 0 : W, -8 + Math.sin(tl * 0.5) * 4); c.scale(flip ? -s : s, s); c.drawImage(b, -b.width, 0); c.restore(); } const mg = c.createLinearGradient(0, H * 0.82, 0, H); mg.addColorStop(0, E.hexA(S.c.bg0, 0)); mg.addColorStop(1, E.hexA(S.c.bg0, 0.5)); c.fillStyle = mg; c.fillRect(0, H * 0.82, W, H * 0.18); };
  FG.glyphs = (c, sc, tl) => { const r = E.rng(sc.seed + 9); c.save(); c.strokeStyle = S.c.accent; for (let i = 0; i < 2; i++) { const x = (r() < 0.5 ? 0.04 : 0.96) * W + Math.sin(tl * 0.3 + i) * 20, y = H * (0.2 + r() * 0.6), R = Math.min(W, H) * (0.16 + r() * 0.1); c.globalAlpha = 0.07; c.lineWidth = 14; c.beginPath(); c.arc(x, y, R, tl * 0.2, tl * 0.2 + 4); c.stroke(); c.lineWidth = 4; c.beginPath(); c.arc(x, y, R * 0.7, -tl * 0.3, -tl * 0.3 + 2.4); c.stroke(); } for (let i = 0; i < 4; i++) { const y = H * r(), x = ((r() * W + tl * (300 + r() * 500)) % (W * 1.6)) - W * 0.3; const g = c.createLinearGradient(x, 0, x + 240, 0); g.addColorStop(0, E.hexA(S.c.accent, 0)); g.addColorStop(0.5, E.hexA(S.c.accent, 0.22)); g.addColorStop(1, E.hexA(S.c.accent, 0)); c.globalAlpha = 1; c.fillStyle = g; c.fillRect(x, y, 240, 1.5); } c.restore(); };
  FG.paperclip = (c, sc, tl) => { const r = E.rng(sc.seed + 3); c.save(); c.translate(W + 30 - tl * 3, -20 + r() * 10); c.rotate(2.95 + r() * 0.12); c.shadowColor = 'rgba(50,30,10,0.35)'; c.shadowBlur = 26; c.fillStyle = 'rgba(246,238,220,0.96)'; c.fillRect(0, -H * 0.1, W * 0.22, H * 0.1); c.shadowColor = 'transparent'; c.strokeStyle = 'rgba(120,120,130,0.8)'; c.lineWidth = 3; c.beginPath(); c.roundRect ? c.roundRect(W * 0.04, -H * 0.12, 26, 70, 13) : c.rect(W * 0.04, -H * 0.12, 26, 70); c.stroke(); c.restore(); };
  FG.shapes = (c, sc, tl) => { const r = E.rng(sc.seed + 1); c.save(); c.strokeStyle = 'rgba(0,0,0,0.08)'; c.lineWidth = 2; const R = Math.max(W, H) * (0.35 + r() * 0.2); c.beginPath(); c.arc(W * (r() < 0.5 ? -0.1 : 1.1) + tl * 6, H * (0.2 + r() * 0.6), R, 0, TAU); c.stroke(); c.restore(); };
  FG.flares = (c, sc, tl) => { const r = E.rng(sc.seed + 2); c.save(); c.globalCompositeOperation = 'lighter'; const x = W * (r() < 0.5 ? 0.08 : 0.92) + Math.sin(tl * 0.2) * 30, y = H * (0.12 + r() * 0.2); E.glowDot(c, x, y, 22, S.c.accent, 0.35); const g = c.createLinearGradient(x - W * 0.35, y, x + W * 0.35, y); g.addColorStop(0, E.hexA(S.c.accent, 0)); g.addColorStop(0.5, E.hexA('#ffffff', 0.35)); g.addColorStop(1, E.hexA(S.c.accent, 0)); c.fillStyle = g; c.fillRect(x - W * 0.35, y - 1, W * 0.7, 2); for (let i = 0; i < 3; i++) E.glowDot(c, W - x + (i - 1) * 90, H - y - i * 40, 10 + i * 8, S.c.accent2, 0.08); c.restore(); };
  // ---------- particles (global, continuous) ----------
  const PRT = {};
  function ptsFor(kind, n) { if (PRT[kind]) return PRT[kind]; const r = E.rng('p' + kind); PRT[kind] = Array.from({ length: n }, () => ({ x: r(), y: r(), z: 0.2 + r() * 0.8, p: r() * TAU, s: r() })); return PRT[kind]; }
  PARTICLES.dust = (c, t) => { const P = ptsFor('dust', S.particles.count); c.save(); c.globalCompositeOperation = 'lighter'; for (const p of P) { const x = ((p.x + Math.sin(t * 0.15 + p.p) * 0.02 + t * 0.004 * p.z) % 1) * W, y = (((p.y - t * 0.012 * p.z) % 1 + 1) % 1) * H, a = (0.25 + 0.5 * p.z) * (0.55 + 0.45 * Math.sin(t * 1.3 + p.p * 3)); const rad = 0.8 + p.z * p.z * 3.2; if (p.z > 0.85) E.glowDot(c, x, y, rad * 1.6, S.particles.color, a * 0.5); else { c.globalAlpha = a; c.fillStyle = S.particles.color; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill(); } } c.restore(); };
  PARTICLES.ink = (c, t) => { const P = ptsFor('ink', S.particles.count); c.save(); for (const p of P) { const x = ((p.x + Math.sin(t * 0.3 + p.p) * 0.01) % 1) * W, y = (((p.y + t * 0.01 * p.z) % 1) + 1) % 1 * H; c.globalAlpha = 0.12 + 0.25 * p.z; c.fillStyle = S.particles.color; c.beginPath(); c.arc(x, y, 1 + p.z * 3.5, 0, TAU); c.fill(); } c.restore(); };
  PARTICLES.data = (c, t) => { const P = ptsFor('data', S.particles.count); c.save(); c.fillStyle = S.particles.color; for (const p of P) { const x = p.x * W, y = (((p.y - t * 0.03 * p.z) % 1) + 1) % 1 * H, a = (0.15 + 0.5 * p.z) * (Math.sin(t * 3 + p.p * 5) > -0.3 ? 1 : 0.2); c.globalAlpha = a; const s = 1.5 + p.z * 3; c.fillRect(x, y, s, s); if (p.s > 0.8) c.fillRect(x + s * 2, y, s * 4, 1); } c.restore(); };
  PARTICLES.motes = (c, t) => { const P = ptsFor('motes', S.particles.count); c.save(); c.fillStyle = S.particles.color; for (const p of P) { const x = ((p.x + t * 0.003 * p.z + Math.sin(t * 0.2 + p.p) * 0.01) % 1) * W, y = ((p.y + Math.sin(t * 0.17 + p.p) * 0.02) % 1) * H; c.globalAlpha = 0.15 + 0.3 * p.z; c.beginPath(); c.arc(x, y, 0.8 + p.z * 2, 0, TAU); c.fill(); } c.restore(); };
  PARTICLES.stars = (c, t) => { const P = ptsFor('stars', S.particles.count); c.save(); c.globalCompositeOperation = 'lighter'; for (const p of P) { const x = (((p.x - t * 0.006 * p.z) % 1) + 1) % 1 * W, y = p.y * H, a = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(t * (0.8 + p.s * 2) + p.p), 3); if (p.z > 0.8) { E.glowDot(c, x, y, 2.4, S.particles.color, a * 0.6); c.globalAlpha = a * 0.5; c.fillStyle = '#fff'; c.fillRect(x - 10, y - 0.5, 20, 1); c.fillRect(x - 0.5, y - 10, 1, 20); } else { c.globalAlpha = a * 0.6; c.fillStyle = '#fff'; c.fillRect(x, y, 1.6, 1.6); } } c.restore(); };
  PARTICLES.none = () => {};

  // ---------- hook bar ----------
  function drawHook(c, t) {
    if (!SB.hook) return; const hb = F.hook, x0 = F.safe.l, w = W - F.safe.l - F.safe.r;
    const k = E.clamp(t / 0.4) || 1; const lay = E.fit(SB.hook, 'hook', w * 0.78);
    const y = hb.y + (hb.h - lay.h) / 2; const tx = x0 + (w - lay.maxLineW) / 2, ty = y + lay.h / 2;
    c.save(); const d = S.hookDeco;
    if (d === 'rules') { for (const s of [-1, 1]) { const ax = s < 0 ? tx - 28 : tx + lay.maxLineW + 28, bx = ax + s * 150; const g = c.createLinearGradient(ax, 0, bx, 0); g.addColorStop(0, E.hexA(S.c.accent, 0.8)); g.addColorStop(1, E.hexA(S.c.accent, 0)); c.strokeStyle = g; c.lineWidth = 1.2; c.beginPath(); c.moveTo(ax, ty); c.lineTo(bx, ty); c.stroke(); c.fillStyle = S.c.accent; c.save(); c.translate(ax, ty); c.rotate(Math.PI / 4); c.fillRect(-3, -3, 6, 6); c.restore(); } }
    else if (d === 'seal') { const s = lay.size * 1.25, sx = tx - s - 22, sy = ty - s / 2; c.fillStyle = S.c.accent; c.globalAlpha = 0.9; c.fillRect(sx, sy, s, s); c.globalAlpha = 1; c.fillStyle = S.c.bg0; c.font = `900 ${Math.round(s * 0.62)}px ${S.fonts.title}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(SB.seal || '思', sx + s / 2, sy + s / 2 + 2); }
    else if (d === 'rec') { c.globalAlpha = Math.sin(t * 4) > -0.2 ? 1 : 0.25; c.fillStyle = S.c.bad; c.beginPath(); c.arc(tx - 30, ty, 7, 0, TAU); c.fill(); c.globalAlpha = 0.8; c.strokeStyle = S.c.accent; c.lineWidth = 2; const bx = tx - 52, bw = lay.maxLineW + 80, bh = lay.h + 18, by = ty - bh / 2; for (const [cx, sx] of [[bx, 1], [bx + bw, -1]]) { c.beginPath(); c.moveTo(cx + sx * 12, by); c.lineTo(cx, by); c.lineTo(cx, by + bh); c.lineTo(cx + sx * 12, by + bh); c.stroke(); } }
    else if (d === 'tag') { c.strokeStyle = S.c.line; c.globalAlpha = 0.75; c.lineWidth = 2; c.strokeRect(tx - 26, ty - lay.h / 2 - 9, lay.maxLineW + 52, lay.h + 18); c.fillStyle = S.c.accent; c.fillRect(tx - 26, ty - lay.h / 2 - 9, 8, lay.h + 18); }
    else if (d === 'bar') { c.fillStyle = S.c.accent; c.fillRect(tx - 30, ty - 9, 18, 18); c.fillStyle = S.c.text; c.fillRect(tx, ty + lay.h / 2 + 8, lay.maxLineW, 4); }
    else if (d === 'thin') { c.strokeStyle = E.hexA(S.c.accent, 0.5); c.lineWidth = 1; c.beginPath(); c.moveTo(tx + lay.maxLineW * 0.3, ty + lay.h / 2 + 10); c.lineTo(tx + lay.maxLineW * 0.7, ty + lay.h / 2 + 10); c.stroke(); }
    c.restore();
    E.drawLayout(c, lay, x0, y, w, 'center', { kin: 1, color: S.dark ? E.hexA(S.c.accent2, 0.92) : S.c.text, scene: 'hook', anim: 'settle' });
    if (SB.progress !== false) { const py = hb.y + hb.h + 10; c.save(); c.globalAlpha = 0.18; c.fillStyle = S.c.dim; c.fillRect(x0, py, w, 2); c.globalAlpha = 0.75; c.fillStyle = S.c.accent; c.fillRect(x0, py, w * E.clamp(t / dur), 2); c.restore(); }
  }

  // ---------- scene rendering ----------
  const buf = []; function getBuf(i) { if (!buf[i]) { buf[i] = mkCanvas(W, H); } return buf[i]; }
  function camFor(sc, tl) { const k = E.clamp(tl / sc.dur), m = sc.camera || 'push'; const e = E.ease.inOut(k); return { zoom: m === 'push' ? 1 + 0.035 * e : m === 'pull' ? 1.035 - 0.035 * e : 1, x: sc.visual?.type === 'shot' && m === 'still' ? 0 : m === 'pan' ? (e - 0.5) * 60 : (e - 0.5) * 16 }; }
  function drawScene(c, sc, tl) {
    E._scene = sc.id || sc.i; const cam = camFor(sc, tl);
    c.save(); (BG[sc.bg || S.bg] || BG.bokeh)(c, sc, tl, cam); c.restore();
    const v = sc.visual || { type: 'none' }, comp = (window.CKV_COMPONENTS || {})[v.type] || (window.CKV_CUSTOM || {})[v.name] || null;
    if (!comp && v.type !== 'none') throw new Error('VISUAL IMPLEMENTATION MISSING: '+sc.id+'/'+v.type);
    if (comp) { c.save(); c.translate(W / 2, H / 2); c.scale(cam.zoom, cam.zoom); c.translate(-W / 2 + cam.x * 0.4, -H / 2); const pre = sc.i === 0 ? (v.preroll === undefined ? 2 : v.preroll) * beat : 0; comp(c, sc.rg.vis, { avoid: (sc.layout || 'center') === 'center' ? sc.textRect : null, t: tl + pre, k: E.clamp((tl + pre) / sc.dur), dur: sc.dur, beat, bar, b: (tl + pre) / beat, sc, v }, E); c.restore();
      if (['matrix','duo','timeline','bars','dots','split','code','image'].includes(v.type)) {
        for (const plan of sc.explanations || []) if (!plan.exemptReason && tl >= (plan.atSec || 0) && tl < (plan.outSec ?? sc.dur)) E.info(plan.id, plan.kind || v.type, sc.rg.vis);
      }
    }
    if (SB.productionMode !== 'stable') { c.save(); (FG[sc.fg || S.fg] || (() => {}))(c, sc, tl); c.restore(); }
    if (SB.productionMode !== 'stable') drawSceneText(c,sc,tl);
  }
  function drawSceneText(c,sc,tl) {
    const v=sc.visual || {type:'none'};
    const bed = sc.textBed !== undefined ? sc.textBed : (sc.layout || 'center') === 'center' && v.type !== 'none';
    if (bed && sc.textRect) { const tr = sc.textRect, cx = tr.x + tr.w / 2, cy = tr.y + tr.h / 2, rx = tr.w * 0.62 + 80, ry = tr.h * 0.62 + 60; c.save(); c.translate(cx, cy); c.scale(1, ry / rx); const g = c.createRadialGradient(0, 0, 0, 0, 0, rx); const bc = S.dark ? '#000000' : S.c.bg0; g.addColorStop(0, E.hexA(bc, S.dark ? 0.72 : 0.85)); g.addColorStop(0.6, E.hexA(bc, S.dark ? 0.5 : 0.6)); g.addColorStop(1, E.hexA(bc, 0)); c.fillStyle = g; c.fillRect(-rx, -rx, rx * 2, rx * 2); c.restore(); }
    for (const l of sc.lines) {
      if (tl < l.atS - 0.001) continue;
      const tIn = tl - l.atS, inDur = (S.textIn === 'type' || S.textIn === 'typewriter') && !l.anim ? Math.min(1.4, 0.05 * l.text.length + 0.2) : 0.7;
      const first = sc.i === 0 && l.atS === 0;
      const kin = first ? 1 : E.clamp(tIn / inDur), kout = l.outS >= sc.dur - 0.01 ? 1 : E.clamp((l.outS - tl) / 0.35);
      if (kout <= 0) { if (collect) LOG.push({ role: l.role, text: l.text, alpha: 0, scene: sc.id }); continue; }
      if (l.role === 'caption' && S.captionBox && kin > 0) { c.save(); c.globalAlpha = 0.6 * E.ease.inOut(kout) * Math.min(1, kin * 2); c.fillStyle = S.c.panel; const pad = 28; c.fillRect(l.x + (l.w - l.lay.maxLineW) / 2 - pad, l.y - 10, l.lay.maxLineW + pad * 2, l.lay.h + 20); c.fillStyle = S.c.accent; c.fillRect(l.x + (l.w - l.lay.maxLineW) / 2 - pad, l.y - 10, 4, l.lay.h + 20); c.restore(); }
      E.drawLayout(c, l.lay, l.x, l.y, l.w, l.align, { kin, kout, anim: first ? 'settle' : l.anim, scene: sc.id, color: l.color && (S.c[l.color] || l.color) });
    }
  }

  const TRANS = {};
  TRANS.cut = (c, A, B, k) => c.drawImage(k < .5 ? A : B, 0, 0);
  TRANS.fade = (c, A, B, k) => { c.drawImage(A, 0, 0); c.globalAlpha = E.ease.inOut(k); c.drawImage(B, 0, 0); c.globalAlpha = 1; };
  TRANS.flash = (c, A, B, k) => { TRANS.fade(c, A, B, k); const f = Math.sin(Math.PI * k); c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) * 0.6); g.addColorStop(0, E.hexA(S.c.accent2, 0.28 * f)); g.addColorStop(1, E.hexA(S.c.accent, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore(); };
  TRANS.ink = (c, A, B, k, seed) => { c.drawImage(A, 0, 0); const r = E.rng(seed), e = E.ease.inOut(k); c.save(); c.beginPath(); const R = Math.hypot(W, H) * 0.62 * e; for (let i = 0; i < 5; i++) { const cx = W * (0.3 + r() * 0.4), cy = H * (0.3 + r() * 0.4); for (let a = 0; a <= 40; a++) { const ang = a / 40 * TAU, rr = R * (0.75 + 0.25 * Math.sin(ang * 5 + i * 3 + r() * 2)); a ? c.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr) : c.moveTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr); } c.closePath(); } c.clip(); c.drawImage(B, 0, 0); c.restore(); c.globalAlpha = E.clamp((k - 0.6) / 0.4); c.drawImage(B, 0, 0); c.globalAlpha = 1; };
  TRANS.glitch = (c, A, B, k, seed) => { const r = E.rng(seed + Math.floor(k * 12)); const n = 18, h = H / n; for (let i = 0; i < n; i++) { const useB = r() < E.ease.inOut(k) * 1.1; const off = (r() - 0.5) * 80 * Math.sin(Math.PI * k); c.drawImage(useB ? B : A, 0, i * h, W, h, off, i * h, W, h); } c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.25 * Math.sin(Math.PI * k); c.fillStyle = S.c.accent; c.fillRect(0, H * r(), W, 3); c.restore(); };
  TRANS.slide = (c, A, B, k) => { const e = E.ease.inOut(k); c.drawImage(A, -W * 0.08 * e, 0); c.save(); c.shadowColor = 'rgba(40,25,10,0.5)'; c.shadowBlur = 40; c.drawImage(B, W * (1 - e), 0); c.restore(); };
  TRANS.block = (c, A, B, k) => { const e1 = E.ease.inOut(E.clamp(k * 2)), e2 = E.ease.inOut(E.clamp(k * 2 - 1)); c.drawImage(k < 0.5 ? A : B, 0, 0); c.fillStyle = S.c.accent; if (k < 0.5) c.fillRect(0, 0, W * e1, H); else c.fillRect(W * e2, 0, W * (1 - e2), H); };
  TRANS.warp = (c, A, B, k) => { const e = E.ease.inOut(k); c.save(); c.translate(W / 2, H / 2); c.scale(1 + 0.25 * e, 1 + 0.25 * e); c.globalAlpha = 1 - e; c.drawImage(A, -W / 2, -H / 2); c.restore(); c.save(); c.translate(W / 2, H / 2); const s = 0.92 + 0.08 * e; c.scale(s, s); c.globalAlpha = e; c.drawImage(B, -W / 2, -H / 2); c.restore(); };
  E.TRANS = TRANS;

  function frame(t, o) {
    OPTS = o || {}; collect = !!OPTS.collect; LOG = []; E._infoLog = []; E._shotLog = [];
    t = E.clamp(t, 0, dur - 1e-6);
    let i = scenes.findIndex(s => t < s.t1); if (i < 0) i = scenes.length - 1;
    const sc = scenes[i], td = Math.min(0.6, beat * 1.2);
    let A = null, B = null, k = 0;
    if (i > 0 && t - sc.t0 < td / 2) { A = scenes[i - 1]; B = sc; k = 0.5 + (t - sc.t0) / td; }
    else if (i < scenes.length - 1 && sc.t1 - t < td / 2) { A = sc; B = scenes[i + 1]; k = 0.5 - (sc.t1 - t) / td; }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = S.c.bg1; ctx.fillRect(0, 0, W, H);
    if (A) {
      const ba = getBuf(0), bb = getBuf(1), ca = ba.getContext('2d', {willReadFrequently:SB.productionMode==='stable'}), cb = bb.getContext('2d', {willReadFrequently:SB.productionMode==='stable'});
      const keep = collect; collect = keep && k < 0.5; drawScene(ca, A, t - A.t0); collect = keep && k >= 0.5; drawScene(cb, B, t - B.t0); collect = keep;
      const tr = TRANS[B.transition || S.transition] || TRANS.fade; tr(ctx, ba, bb, E.clamp(k), B.seed);
    } else drawScene(ctx, sc, t - sc.t0);
    if (!OPTS.hideOverlay) {
      if (SB.productionMode === 'stable') {
        E.CINEMATIC.finish(ctx,t,sc);
        drawHook(ctx,t);
        drawSceneText(ctx,sc,t-sc.t0);
        E.CINEMATIC.grain(ctx,t);
      } else {
      (PARTICLES[S.particles.kind] || PARTICLES.none)(ctx, t);
      if (tex.paper) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.55; ctx.drawImage(tex.paper, 0, 0); ctx.restore(); }
      ctx.save(); ctx.globalAlpha = S.overlay.vignette; if (!S.dark) ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(tex.vig, 0, 0); ctx.restore();
      if (S.overlay.scan) { ctx.save(); ctx.globalAlpha = S.overlay.scan; ctx.fillStyle = ctx.createPattern(tex.scan, 'repeat'); ctx.fillRect(0, 0, W, H); const sy = ((t * 0.25) % 1) * H * 1.3 - H * 0.15; const g = ctx.createLinearGradient(0, sy - 80, 0, sy + 80); g.addColorStop(0, 'rgba(120,230,255,0)'); g.addColorStop(0.5, 'rgba(120,230,255,0.05)'); g.addColorStop(1, 'rgba(120,230,255,0)'); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, sy - 80, W, 160); ctx.restore(); }
      drawHook(ctx, t);
      const fi = Math.round(t * (SB.fps || 30)); ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = S.overlay.grain * 2.2; const gt = tex.grain[fi % 8]; ctx.fillStyle = ctx.createPattern(gt, 'repeat'); ctx.translate((fi * 37) % 320, (fi * 91) % 320); ctx.fillRect(-320, -320, W + 640, H + 640); ctx.restore();
      }
      const fo = SB.fadeOut === undefined ? 1.0 : SB.fadeOut; if (dur - t < fo) { ctx.save(); ctx.globalAlpha = E.ease.inOut(1 - (dur - t) / fo); ctx.fillStyle = S.dark ? '#000' : S.c.bg0; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    }
    ctx.restore();
    // The global ending fade also fades text. Keep QA alpha consistent with pixels.
    if (collect && !OPTS.hideOverlay) {
      const fo = SB.fadeOut === undefined ? 1 : SB.fadeOut;
      const alpha = fo > 0 && dur - t < fo ? 1 - E.ease.inOut(1 - (dur - t) / fo) : 1;
      for (const box of LOG) box.alpha *= alpha;
    }
    return LOG;
  }
  window.draw = (t, o) => { frame(t, o); return true; };
  window.layoutAt = (t, o) => frame(t, Object.assign({}, o, { collect: true }));
})();

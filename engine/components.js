/* Visual component library (the mid layer). Signature: (ctx, rect, p, E)
   rect = region reserved for the visual (never overlaps the text group).
   p = { t: local sec, k: 0..1 scene progress, b: local beats, dur, beat, sc, v: visual params } */
(function () {
  const TAU = Math.PI * 2;
  const C = (window.CKV_COMPONENTS = {});
  const ap = (p, at = 0, len = 1) => p.E.ease.out(p.E.clamp((p.b - at) / Math.max(0.01, len)));
  const wrap = fn => (c, r, p, E) => { p.E = E; fn(c, r, p, E, E.S); };
  const stateAt = (list, b, def) => { let s = def; for (const it of list || []) if (b >= it.at) s = it; return s; };

  C.none = () => {};

  C.rings = wrap((c, r, p, E, S) => {
    const av = p.avoid, cx = av ? av.x + av.w / 2 : r.x + r.w / 2, cy = av ? av.y + av.h / 2 : r.y + r.h / 2, R = Math.max(Math.min(r.w, r.h) * (p.v.scale || 0.44), av ? av.w * 0.62 + 40 : 0), n = p.v.count || 3;
    for (let i = 0; i < n; i++) {
      const tilt = 0.28 + i * 0.22, rot = p.t * (0.12 + i * 0.05) * (i % 2 ? -1 : 1) + i, rr = R * (1 - i * 0.18), pts = [];
      for (let a = 0; a <= 64; a++) { const t = a / 64 * TAU; const x = Math.cos(t) * rr, y = Math.sin(t) * rr * tilt; pts.push([cx + x * Math.cos(rot * 0.2) - y * Math.sin(rot * 0.2), cy + x * Math.sin(rot * 0.2) + y * Math.cos(rot * 0.2)]); }
      E.stroke(c, pts, { k: ap(p, i * 0.5, 3), alpha: 0.55 - i * 0.1, width: 0.8, seed: i + 3 });
      const t = rot * 2, x = Math.cos(t) * rr, y = Math.sin(t) * rr * tilt;
      E.glowDot(c, cx + x * Math.cos(rot * 0.2) - y * Math.sin(rot * 0.2), cy + x * Math.sin(rot * 0.2) + y * Math.cos(rot * 0.2), 5, i ? S.c.accent : S.c.accent2, 0.9 * ap(p, 1, 2));
    }
  });

  C.question = wrap((c, r, p, E, S) => {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, s = Math.min(r.w, r.h) * 0.8, k = ap(p, p.v.at || 0, 1.5);
    for (let i = 0; i < 3; i++) { const ph = ((p.t * 0.6 + i / 3) % 1); c.save(); c.globalAlpha = (1 - ph) * 0.35 * k; c.strokeStyle = S.c.accent; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, s * (0.3 + ph * 0.5), 0, TAU); c.stroke(); c.restore(); }
    const lay = E.fit(p.v.glyph || '？', 'big', r.w, { size: s, min: 10, maxLines: 1 });
    E.drawLayout(c, lay, r.x, cy - lay.h / 2, r.w, 'center', { kin: k, anim: 'rise', deco: true, scene: E._scene, alpha: 0.95 });
  });

  C.bignum = wrap((c, r, p, E, S) => {
    const v = p.v, k = E.ease.out(E.clamp((p.b - (v.at || 0)) / (v.len || 6)));
    const val = E.lerp(v.from || 0, v.to, k), str = (v.prefix || '') + val.toFixed(v.decimals || 0) + (v.suffix || '');
    const sz = Math.min(r.h * 0.62, r.w / Math.max(2, str.length) * 1.6);
    const lay = E.fit(str, 'big', r.w, { size: sz, min: Math.min(sz, E.F.min.big), maxLines: 1 });
    const total = lay.h + (v.label ? E.F.size.label * 2 : 0), y = r.y + (r.h - total) / 2;
    if (k > 0 || v.from !== undefined) E.drawLayout(c, lay, r.x, y, r.w, 'center', { kin: ap(p, v.at || 0, 0.8), anim: 'rise', scene: E._scene });
    const lw = lay.maxLineW * 0.6 * ap(p, (v.at || 0) + 1, 3), ly = y + lay.h + 12;
    E.stroke(c, [[r.x + r.w / 2 - lw / 2, ly], [r.x + r.w / 2 + lw / 2, ly]], { width: 0.8, seed: 9, color: S.c.accent });
    if (v.label) E.label(c, v.label, r.x + r.w / 2, ly + 24, { maxW: r.w, kin: ap(p, v.labelAt || (v.at || 0) + 2, 1), color: S.c.dim, size: E.F.size.label * 1.15 });
  });

  C.matrix = wrap((c, r, p, E, S) => {
    const v = p.v, R = v.rows.length, K = v.cols.length, lab = Math.min(r.w * 0.2, 220), hdr = Math.min(r.h * 0.17, 90);
    const gw = Math.min(r.w - lab - 20, (r.h - hdr) * 2.7 * K / R), gh = Math.min(r.h - hdr, gw * R / K / 2.3), x0 = r.x + (r.w - lab - gw) / 2 + lab, y0 = r.y + (r.h - hdr - gh) / 2 + hdr, cw = gw / K, ch = gh / R, pad = 10;
    const st = v.at || 0;
    if (v.colTitle) E.label(c, v.colTitle, x0 + gw / 2, y0 - hdr - 4, { maxW: gw, color: S.c.dim, kin: ap(p, st, 1), size: E.F.size.label * 0.9 });
    v.cols.forEach((s, j) => E.label(c, s, x0 + cw * (j + 0.5), y0 - hdr * 0.55, { maxW: cw - 10, kin: ap(p, st, 1), color: S.c.accent }));
    v.rows.forEach((s, i) => E.label(c, s, x0 - 22, y0 + ch * (i + 0.5), { maxW: lab - 10, align: 'right', valign: 'middle', kin: ap(p, st, 1), color: S.c.accent }));
    const hl = v.highlight ? (Array.isArray(v.highlight[0]) || typeof v.highlight[0] === 'object' ? v.highlight : [v.highlight]) : [];
    for (let i = 0; i < R; i++) for (let j = 0; j < K; j++) {
      const d = st + 0.5 + (v.stagger === undefined ? 0.6 : v.stagger) * (i * K + j), kk = ap(p, d, 1);
      let h = 0, dim = 0; for (const hh of hl) { const cell = hh.cell || hh, at = hh.at === undefined ? st + 4 : hh.at; const e = ap(p, at, 1); if (cell[0] === i && cell[1] === j) h = Math.max(h, e); else dim = Math.max(dim, e); }
      const x = x0 + j * cw + pad / 2, y = y0 + i * ch + pad / 2;
      const tc = E.panel(c, x, y, cw - pad, ch - pad, { k: kk, highlight: h, alpha: 1 - dim * 0.45 });
      E.label(c, v.cells[i][j], x + (cw - pad) / 2, y + (ch - pad) / 2, { maxW: cw - pad - 24, valign: 'middle', kin: kk, color: tc, alpha: 1 - dim * 0.45, size: E.F.size.label * (v.cellScale || 1.15), maxLines: 2 });
    }
  });

  function figure(c, x, y, s, E, S, o) {
    const head = s * 0.17, A = o.alpha;
    c.save(); c.globalAlpha = A;
    const body = new Path2D(); body.arc(x, y - s * 0.62, head, 0, TAU);
    body.moveTo(x - s * 0.34, y); body.bezierCurveTo(x - s * 0.34, y - s * 0.3, x - s * 0.2, y - s * 0.4, x, y - s * 0.4); body.bezierCurveTo(x + s * 0.2, y - s * 0.4, x + s * 0.34, y - s * 0.3, x + s * 0.34, y); body.closePath();
    if (S.dark) { const g = c.createLinearGradient(0, y - s, 0, y); g.addColorStop(0, E.hexA(o.color, 0.35)); g.addColorStop(1, 'rgba(0,0,0,0.2)'); c.fillStyle = g; c.fill(body); c.strokeStyle = o.color; c.lineWidth = 2; c.shadowColor = o.color; c.shadowBlur = 14; c.stroke(body); }
    else { c.fillStyle = E.hexA(o.color, 0.88); c.fill(body); }
    c.restore();
  }
  C.duo = wrap((c, r, p, E, S) => {
    const v = p.v, st = stateAt(v.states, p.b, { state: v.state || 'wall', at: 0 }), e = ap(p, st.at, 1.2), s = Math.min(r.h * 0.62, r.w * 0.26);
    const cy = r.y + r.h * 0.5 + s * 0.42, xl = r.x + r.w * 0.27, xr = r.x + r.w * 0.73, enter = ap(p, 0, 1.5);
    const col = side => { const bad = st.state === 'betray-both' || st.state === 'betray-' + side; return bad ? S.c.bad : S.c.good; };
    const dimOf = side => (st.state === 'betray-left' && side === 'right') || (st.state === 'betray-right' && side === 'left') ? 0.45 : 1;
    if (S.dark) for (const x of [xl, xr]) { c.save(); const g = c.createLinearGradient(0, r.y, 0, cy); g.addColorStop(0, E.hexA(S.c.accent2, 0.16 * enter)); g.addColorStop(1, E.hexA(S.c.accent2, 0)); c.fillStyle = g; c.beginPath(); c.moveTo(x - 14, r.y); c.lineTo(x + 14, r.y); c.lineTo(x + s * 0.7, cy); c.lineTo(x - s * 0.7, cy); c.fill(); c.restore(); }
    const wallA = st.state === 'cooperate' ? 1 - e : 1;
    E.stroke(c, [[r.x + r.w / 2, r.y + r.h * 0.08], [r.x + r.w / 2, cy]], { k: enter, alpha: 0.8 * wallA, width: 1.2, seed: 4 });
    figure(c, xl, cy, s, E, S, { color: col('left'), alpha: enter * dimOf('left') });
    figure(c, xr, cy, s, E, S, { color: col('right'), alpha: enter * dimOf('right') });
    if (st.state === 'cooperate') { const pts = []; for (let i = 0; i <= 30; i++) { const f = i / 30; pts.push([E.lerp(xl + s * 0.3, xr - s * 0.3, f), cy - s * 0.45 - Math.sin(f * Math.PI) * s * 0.25]); } E.stroke(c, pts, { k: e, color: S.c.accent, width: 1.3, seed: 8 }); E.glowDot(c, r.x + r.w / 2, cy - s * 0.7, 10, S.c.accent, e); }
    if (v.labels) v.labels.forEach((l, i) => E.label(c, l, i ? xr : xl, cy + 16, { maxW: r.w * 0.4, kin: enter, color: S.c.dim }));
  });

  C.timeline = wrap((c, r, p, E, S) => {
    const v = p.v, n = v.items.length, y = r.y + r.h * 0.55, x0 = r.x + r.w * 0.06, x1 = r.x + r.w * 0.94, st = v.at || 0;
    E.stroke(c, [[x0, y], [x1, y]], { k: ap(p, st, 2), width: 0.9, seed: 2, alpha: 0.8 });
    v.items.forEach((it, i) => {
      const x = n === 1 ? (x0 + x1) / 2 : E.lerp(x0 + 60, x1 - 60, i / (n - 1)), kk = ap(p, st + 1 + i * (v.stagger || 1), 1), f = v.focus === i;
      E.glowDot(c, x, y, f ? 9 : 5, f ? S.c.accent : S.c.line, kk);
      E.label(c, it.year, x, y - 30, { valign: 'bottom', maxW: 260, kin: kk, color: f ? S.c.accent : S.c.text, size: E.F.size.label * 1.4, role: 'label' });
      if (it.label) E.label(c, it.label, x, y + 26, { maxW: Math.min(320, (x1 - x0) / n), kin: kk, color: S.c.dim });
    });
  });

  C.bars = wrap((c, r, p, E, S) => {
    const v = p.v, n = v.items.length, max = v.max || Math.max(...v.items.map(i => i.value)), gap = r.w / n, bw = Math.min(gap * 0.5, 140), base = r.y + r.h - E.F.size.label * 2.2, top = r.y + E.F.size.label * 2;
    E.stroke(c, [[r.x, base], [r.x + r.w, base]], { width: 0.6, alpha: 0.6, seed: 1 });
    v.items.forEach((it, i) => {
      const kk = ap(p, (v.at || 0) + i * (v.stagger || 0.5), 3), h = (base - top) * it.value / max * kk, x = r.x + gap * (i + 0.5) - bw / 2, col = it.highlight ? S.c.accent : S.c.dim;
      c.save(); c.globalAlpha = 0.9; if (S.panel === 'brush') { E.stroke(c, [[x + bw / 2, base], [x + bw / 2, base - h]], { width: bw / S.line.width / 1.2, color: it.highlight ? S.c.accent : S.c.text, seed: i }); } else { const g = c.createLinearGradient(0, base - h, 0, base); g.addColorStop(0, col); g.addColorStop(1, E.hexA(col, S.dark ? 0.15 : 0.7)); c.fillStyle = g; c.fillRect(x, base - h, bw, h); } c.restore();
      E.label(c, (it.display || it.value) + (v.unit || ''), x + bw / 2, base - h - 10, { valign: 'bottom', maxW: gap, kin: kk, color: it.highlight ? S.c.accent : S.c.text });
      E.label(c, it.label, x + bw / 2, base + 14, { maxW: gap - 8, kin: ap(p, v.at || 0, 1), color: S.c.dim });
    });
  });

  C.dots = wrap((c, r, p, E, S) => {
    const v = p.v, n = v.n || 100, cols = v.cols || Math.ceil(Math.sqrt(n * r.w / r.h)), rows = Math.ceil(n / cols), cell = Math.min(r.w / cols, r.h / rows) * (v.scale || 0.86), x0 = r.x + (r.w - cell * cols) / 2, y0 = r.y + (r.h - cell * rows) / 2;
    let frac = v.frac || 0; for (const ev of v.evolve || []) { const e = ap(p, ev.at, ev.len || 3); frac = E.lerp(frac, ev.frac, e); }
    const rng = E.rng(p.sc.seed + 77), order = Array.from({ length: n }, (_, i) => [rng(), i]).sort((a, b) => a[0] - b[0]).map(a => a[1]), rank = []; order.forEach((id, i) => (rank[id] = i));
    for (let i = 0; i < n; i++) { const x = x0 + (i % cols + 0.5) * cell, y = y0 + (Math.floor(i / cols) + 0.5) * cell, kk = ap(p, (v.at || 0) + rank[i] / n * 2, 0.6), good = rank[i] < frac * n, col = good ? S.c.good : S.c.bad; c.save(); c.globalAlpha = kk * (good ? 1 : 0.75); c.fillStyle = col; c.beginPath(); c.arc(x, y, cell * 0.3 * (0.6 + 0.4 * kk), 0, TAU); c.fill(); if (S.dark && good) { c.globalAlpha = kk * 0.25; c.beginPath(); c.arc(x, y, cell * 0.45, 0, TAU); c.fill(); } c.restore(); }
  });

  C.network = wrap((c, r, p, E, S) => {
    const v = p.v, n = v.n || 18, rng = E.rng(p.sc.seed + 31), av = p.avoid, nodes = [];
    for (let tries = 0; nodes.length < n && tries < n * 60; tries++) { const x = r.x + r.w * (0.04 + rng() * 0.92), y = r.y + r.h * (0.06 + rng() * 0.88), z = rng(); if (av && x > av.x - 90 && x < av.x + av.w + 90 && y > av.y - 70 && y < av.y + av.h + 70) continue; nodes.push([x, y, z]); }
    const links = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]); if (d < Math.min(r.w, r.h) * 0.42) { if (av) { const mx = (nodes[i][0] + nodes[j][0]) / 2, my = (nodes[i][1] + nodes[j][1]) / 2; if (mx > av.x - 40 && mx < av.x + av.w + 40 && my > av.y - 30 && my < av.y + av.h + 30) continue; } links.push([i, j, rng()]); } }
    const k = ap(p, v.at || 0, v.len || 8);
    for (const [i, j, o] of links) { const kk = E.clamp((k - o * 0.7) / 0.3); if (kk <= 0) continue; const a = nodes[i], b = nodes[j]; E.stroke(c, [[a[0], a[1]], [b[0], b[1]]], { k: kk, width: 0.5, alpha: 0.5, seed: i * 31 + j, color: S.c.accent }); }
    nodes.forEach((nd, i) => E.glowDot(c, nd[0] + Math.sin(p.t + i) * 3, nd[1] + Math.cos(p.t * 0.8 + i) * 3, 3 + nd[2] * 4, i % 4 ? S.c.line : S.c.accent2, ap(p, nd[2] * 2, 1)));
  });

  C.split = wrap((c, r, p, E, S) => {
    const v = p.v, P = E.H > E.W, gap = 40, sides = [v.left, v.right], win = v.winner === 'left' ? 0 : v.winner === 'right' ? 1 : -1, we = ap(p, v.winAt === undefined ? 4 : v.winAt, 1);
    sides.forEach((sd, i) => {
      const w = P ? r.w : (r.w - gap) / 2, h = P ? (r.h - gap) / 2 : r.h * 0.8, x = P ? r.x : r.x + i * (w + gap), y = P ? r.y + i * (h + gap) : r.y + r.h * 0.1, kk = ap(p, (v.at || 0) + i * 1, 1.2);
      const tc = E.panel(c, x, y, w, h, { k: kk, highlight: i === win ? we : 0, alpha: win >= 0 && i !== win ? 1 - we * 0.3 : 1, color: sd.color ? S.c[sd.color] : undefined });
      const ts = Math.max(E.F.min.label, Math.min(E.F.size.sub * 1.15, h * 0.24)), ty = sd.sub ? (P ? 0.32 : 0.4) : 0.5;
      E.label(c, sd.title, x + w / 2, y + h * ty, { maxW: w - 40, valign: 'middle', kin: kk, color: tc, size: ts, role: 'label', maxLines: P ? 1 : 2 });
      if (sd.sub) E.label(c, sd.sub, x + w / 2, y + h * (P ? 0.72 : 0.68), { maxW: w - 40, valign: 'middle', kin: kk, color: i === win && we > 0.5 ? tc : S.c.dim, size: Math.max(E.F.min.label, Math.min(E.F.size.label || 40, h * 0.16)), maxLines: P ? 1 : 2 });
    });
    if (!P) E.label(c, v.vs || 'VS', r.x + r.w / 2, r.y + r.h / 2, { valign: 'middle', maxW: gap + 60, kin: ap(p, 1, 1), color: S.c.dim, role: 'label', deco: true });
  });

  C.quote = wrap((c, r, p, E, S) => {
    const k = ap(p, 0, 2), s = Math.min(r.w, r.h) * 0.42;
    c.save(); c.globalAlpha = 0.14 * k; c.fillStyle = S.c.accent; c.font = `${S.weight.title} ${Math.round(s)}px ${S.fonts.title}`; c.textBaseline = 'top'; c.fillText('“', r.x + r.w * 0.06, r.y - s * 0.1); c.textAlign = 'right'; c.fillText('”', r.x + r.w * 0.94, r.y + r.h - s * 0.75); c.restore();
    if (p.v.by) E.label(c, '—— ' + p.v.by, r.x + r.w / 2, r.y + r.h * 0.86, { maxW: r.w * 0.8, kin: ap(p, p.v.byAt || 4, 1), color: S.c.dim });
  });

  C.code = wrap((c, r, p, E, S) => {
    const v = p.v, lines = v.lines, sz = E.F.size.code, lh = sz * 1.6, w = Math.min(r.w, 980), h = lh * lines.length + sz * 2.6, x = r.x + (r.w - w) / 2, y = r.y + (r.h - h) / 2;
    E.panel(c, x, y, w, h, { k: ap(p, 0, 1) });
    const st = v.at || 1, per = v.per || 1.2; let shown = 0;
    lines.forEach((ln, i) => { const kk = E.clamp((p.b - st - i * per) / per); if (kk <= 0) return; shown = i; const hl = v.highlight === i ? ap(p, v.highlightAt || st + lines.length * per, 1) : 0; if (hl) { c.save(); c.globalAlpha = 0.18 * hl; c.fillStyle = S.c.accent; c.fillRect(x + 12, y + sz * 1.3 + i * lh - 4, w - 24, lh); c.restore(); }
      E.label(c, String(i + 1).padStart(2, ' '), x + sz * 2.2, y + sz * 1.3 + i * lh + (lh - sz * 1.42) / 2, { align: 'right', maxW: sz * 2, role: 'code', color: S.c.dim, kin: 1, alpha: 0.6, log: false });
      E.label(c, ln, x + sz * 3, y + sz * 1.3 + i * lh + (lh - sz * 1.42) / 2, { align: 'left', maxW: w - sz * 4, role: 'code', kin: kk, anim: 'type', color: S.c.text }); if (hl) { c.save(); c.globalAlpha = hl; c.fillStyle = S.c.accent; c.fillRect(x + 12, y + sz * 1.3 + i * lh - 4, 6, lh); c.restore(); } });
  });

  C.image = wrap((c, r, p, E, S) => {
    const img = (E.images || {})[p.v.src]; if (!img) return; const k = p.k, z = 1.04 + 0.06 * k, iw = img.width, ih = img.height, sc = Math.max(r.w / iw, r.h / ih) * z;
    c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip(); c.globalAlpha = ap(p, 0, 1.5) * (p.v.alpha || 1); if (p.v.filter) c.filter = p.v.filter; c.drawImage(img, r.x + (r.w - iw * sc) / 2 + (k - 0.5) * 30, r.y + (r.h - ih * sc) / 2, iw * sc, ih * sc); c.restore();
    if (S.panel !== 'flat') E.panel(c, r.x, r.y, r.w, r.h, { k: 1, alpha: 0.6 });
  });
})();

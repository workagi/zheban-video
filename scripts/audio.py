#!/usr/bin/env python3
"""Audio for CKV (numpy only; ffmpeg for decode/loudness).
  audio.py beats <music-file> [--bars N]  -> JSON: bpm, firstDownbeat, barEnergy, suggested startBar
  audio.py build <project>                -> build/music.wav, build/sfx.wav, build/mix.wav (+ build/audio.json)
Music modes (storyboard.music.mode): "synth" (compose from storyboard energy) | "file" (user track, bar-aligned cut)."""
import json, os, subprocess, sys, wave
import numpy as np

SR = 48000
TAU = 2 * np.pi
NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
SCALES = {"minor": [0, 2, 3, 5, 7, 8, 10], "major": [0, 2, 4, 5, 7, 9, 11], "lydian": [0, 2, 4, 6, 7, 9, 11], "dorian": [0, 2, 3, 5, 7, 9, 10], "pentatonic": [0, 2, 3, 5, 7, 8, 10]}
PENTA = {"minor": [0, 3, 5, 7, 10], "pentatonic": [0, 3, 5, 7, 10], "dorian": [0, 3, 5, 7, 10], "major": [0, 2, 4, 7, 9], "lydian": [0, 2, 4, 7, 9]}
ROMAN = {"i": 0, "ii": 1, "iii": 2, "iv": 3, "v": 4, "vi": 5, "vii": 6}
STYLE_MUSIC = {  # mirrors engine/styles.js music blocks; storyboard.music can override
    "noir-gold": ("cinematic", "D", "minor", ["i", "VI", "III", "VII"]), "ink-wash": ("guqin", "D", "pentatonic", ["i", "iv", "v", "i"]),
    "tech-hud": ("synth", "A", "minor", ["i", "VI", "VII", "v"]), "archive-doc": ("piano", "C", "minor", ["i", "VI", "iv", "V"]),
    "swiss-minimal": ("marimba", "F", "major", ["I", "V", "vi", "IV"]), "cosmic-blue": ("ambient", "E", "lydian", ["I", "II", "vi", "IV"])}

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def rng(seed): return np.random.default_rng(seed)

def decode(path, sr=SR, ch=2):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(ch), "-ar", str(sr), "-"])
    a = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return a.reshape(-1, ch) if ch > 1 else a

def write_wav(path, x):
    x = np.clip(x, -1, 1); x = (x * 32767).astype(np.int16)
    with wave.open(path, "wb") as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(x.tobytes())

def onepole_lp(x, cut):  # cut: scalar or array (Hz); simple loop, fine for short sfx
    cut = np.broadcast_to(np.asarray(cut, dtype=float), x.shape); a = np.exp(-TAU * cut / SR); y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s = (1 - a[i]) * x[i] + a[i] * s; y[i] = s
    return y

def fft_conv(x, ir):
    n = len(x) + len(ir) - 1; N = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[:len(x)]

def reverb(st, secs=2.2, mix=0.25, seed=3):
    r = rng(seed); n = int(secs * SR); t = np.arange(n) / SR; out = np.zeros_like(st)
    for c in range(2):
        ir = r.standard_normal(n) * np.exp(-t * 6.9 / secs); ir[: int(0.012 * SR)] = 0; ir /= np.sqrt(np.sum(ir ** 2))
        out[:, c] = fft_conv(st[:, c], ir)
    return st * (1 - mix) + out * mix * 0.6

# ------------------------------------------------------------------ beat analysis
def analyze(path, need_bars=None):
    sr = 22050; x = decode(path, sr, 1); n = 1024; hop = 256
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * np.hanning(n)
    S = np.abs(np.fft.rfft(frames, axis=1)); L = np.log1p(S * 10)
    flux = np.maximum(0, np.diff(L, axis=0)).sum(1); flux = np.concatenate([[0], flux])
    k = 16; flux = flux - np.convolve(flux, np.ones(k) / k, "same"); flux = np.maximum(flux, 0); flux /= flux.max() + 1e-9
    fr = sr / hop; ac = np.correlate(flux, flux, "full")[len(flux) - 1:]
    best, bpm = -1, 120
    for b in np.arange(70, 180, 0.25):
        lag = fr * 60 / b; i = int(lag); f = lag - i
        if i + 1 >= len(ac): continue
        v = (ac[i] * (1 - f) + ac[i + 1] * f) * np.exp(-0.5 * (np.log2(b / 118) / 0.6) ** 2)
        if v > best: best, bpm = v, b
    def comb(b):  # long-range grid alignment: best phase score for tempo b
        per = fr * 60 / b; grid = np.arange(0, len(flux) - per - 1, per); best = (-1, 0)
        for p in np.linspace(0, per, 48, endpoint=False):
            pos = grid + p; i = pos.astype(int); f = pos - i; v = float(np.sum(flux[i] * (1 - f) + flux[i + 1] * f))
            if v > best[0]: best = (v, p)
        return best
    bpm = max(np.arange(bpm - 3, bpm + 3, 0.02), key=lambda b: comb(b)[0])
    period = fr * 60 / bpm; idx = np.arange(0, len(flux) - 1, period)
    phases = np.linspace(0, period, 64, endpoint=False); sc = [flux[np.clip((idx + p).astype(int), 0, len(flux) - 1)].sum() for p in phases]
    ph = phases[int(np.argmax(sc))]; beats = (np.arange(0, len(flux) - ph, period) + ph) / fr
    low = L[:, : int(150 / (sr / n))].sum(1); lowd = np.maximum(0, np.diff(low, prepend=low[0]))
    acc = [sum(lowd[min(len(lowd) - 1, int(b * fr))] for b in beats[m::4]) for m in range(4)]
    m = int(np.argmax(acc)); down = beats[m]; bar = 4 * 60 / bpm; dur = len(x) / sr
    while down - bar >= -0.03: down -= bar
    down = max(0.0, down)
    nb = int((dur - down) // bar); rms = []
    for i in range(nb):
        seg = x[int((down + i * bar) * sr): int((down + (i + 1) * bar) * sr)]; rms.append(float(np.sqrt(np.mean(seg ** 2)) if len(seg) else 0))
    mx = max(rms) or 1; rms = [round(r / mx, 3) for r in rms]
    start = 0
    if need_bars and nb > need_bars:  # prefer phrase starts (multiples of 4) with enough room; pick the one with most energetic body
        cands = [s for s in range(0, nb - need_bars + 1, 4)] or [0]
        start = max(cands, key=lambda s: np.mean(rms[s:s + need_bars]) - 0.15 * (s > 0))
    conf = float(best / (ac[0] + 1e-9))
    return {"bpm": round(float(bpm), 2), "firstDownbeat": round(float(down), 3), "beatsPerBar": 4, "barSeconds": round(bar, 4), "barsAvailable": nb,
            "barEnergy": rms, "suggestedStartBar": start, "confidence": round(conf, 3), "alternatives": [round(float(bpm) / 2, 2), round(float(bpm) * 2, 2)], "duration": round(dur, 2),
            "note": "确认 bpm 是否为半/倍速；firstDownbeat 可人工微调。scenes.bars 之和 × barSeconds = 成片时长"}

# ------------------------------------------------------------------ instruments
def env_adsr(n, a, r, sustain=1.0):
    e = np.ones(n) * sustain; na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:na] = np.linspace(0, sustain, na); e[-nr:] *= np.linspace(1, 0, nr); return e

def tone(freq, dur, harm, decay=None, detune=0.0, seed=0, inharm=0.0, bend=0.0):
    n = int(dur * SR); t = np.arange(n) / SR; y = np.zeros(n); r = rng(seed)
    f = freq * 2 ** (detune / 1200) * (1 + bend * np.exp(-t * 18))
    ph = TAU * np.cumsum(f) / SR
    for h, a in enumerate(harm, 1):
        if a == 0 or freq * h > 16000: continue
        hh = h * (1 + inharm * h * h)
        d = np.exp(-t * decay * (1 + 0.35 * (h - 1))) if decay else 1
        y += a * np.sin(ph * hh + r.uniform(0, TAU)) * d
    return y

def instrument(kind, freq, dur, vel=1.0, seed=0):
    if kind == "guqin": y = tone(freq, dur, [1, .6, .35, .2, .12, .06], decay=2.2, bend=0.012, seed=seed, inharm=0.0004)
    elif kind == "piano": y = tone(freq, dur, [1, .5, .28, .16, .09, .05, .03], decay=1.6, seed=seed, inharm=0.0003)
    elif kind == "marimba": y = tone(freq, dur, [1, 0, 0, .35, 0, 0, 0, 0, 0, .12], decay=5.5, seed=seed)
    elif kind == "synth": y = tone(freq, dur, [1, .5, .33, .25, .2, .16, .14, .12], decay=5.0, seed=seed)
    elif kind == "ambient": y = tone(freq, dur, [1, 0, .3, 0, .12], decay=0.9, seed=seed, inharm=0.002)
    else: y = tone(freq, dur, [1, .25, .3, 0, .12, 0, .05], decay=1.3, seed=seed, inharm=0.001)  # cinematic celesta-ish
    n = len(y); a = int(0.004 * SR); y[:a] *= np.linspace(0, 1, a); y[-int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR))
    return y * vel

def pad_note(freq, dur, bright, seed, palette):
    nh = 8; cut = 1.2 + 4 * bright
    harm = [(1 / h) * np.exp(-(h - 1) / cut) for h in range(1, nh + 1)]
    if palette in ("guqin", "piano"): harm = [a * (1 if h % 2 else 0.5) for h, a in enumerate(harm, 1)]
    y = tone(freq, dur, harm, detune=-5, seed=seed) + tone(freq, dur, harm, detune=6, seed=seed + 1)
    t = np.arange(len(y)) / SR; y *= 1 + 0.12 * np.sin(TAU * 0.25 * t + seed)
    return y * env_adsr(len(y), min(0.6, dur * 0.3), min(0.9, dur * 0.4)) * 0.18

def kick(flavor="clean"):
    n = int(0.5 * SR); t = np.arange(n) / SR; f = 45 + 90 * np.exp(-t * 30); y = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t * 7)
    if flavor == "taiko": y = y * 1.2 + rng(5).standard_normal(n) * np.exp(-t * 40) * 0.15
    return y

def hat(r):
    n = int(0.08 * SR); t = np.arange(n) / SR; x = r.standard_normal(n); x = np.diff(x, prepend=0); return x * np.exp(-t * 60) * 0.15

def chord_notes(root, mode, numeral):
    sc = SCALES.get(mode, SCALES["minor"]); rn = numeral.lower().rstrip("°+"); deg = ROMAN.get(rn, 0)
    base = 48 + NOTE[root] + sc[deg] + 12 * (0)
    third = 4 if numeral[0].isupper() else 3
    if base > 55: base -= 12
    return [base, base + third, base + 7, base + 12]

def compose(sb, seconds, bpm, bpb):
    style = sb.get("style", "noir-gold"); pal, root, mode, prog = STYLE_MUSIC.get(style, STYLE_MUSIC["noir-gold"])
    m = sb.get("music", {}); pal = m.get("palette", pal); root = m.get("root", root); mode = m.get("scale", mode); prog = m.get("prog", prog)
    beat = 60 / bpm; bar = beat * bpb; nbars = int(np.ceil(seconds / bar)); N = int(seconds * SR) + SR * 3
    pad = np.zeros((N, 2)); lead = np.zeros((N, 2)); drums = np.zeros((N, 2)); bass = np.zeros(N)
    # Sample the scene energy on the music grid; picture cuts can be at any second.
    timeline, turns, ending_bar, cursor = [], set(), None, 0.0
    for scene in sb["scenes"]:
        d = scene.get("durationSec", scene.get("bars", 0) * bar)
        if scene.get("turn") and cursor: turns.add(cursor / bar)
        if scene.get("ending"): ending_bar = cursor / bar
        timeline.append((cursor, cursor+d, float(scene.get("energy",.5))))
        cursor += d
    E = [next((energy for a,b,energy in timeline if a <= i*bar < b), timeline[-1][2]) for i in range(nbars)]
    cpb = 2 if bpm >= 100 else 1; r = rng(11); penta = PENTA.get(mode, PENTA["minor"])
    def add(buf, y, at, pan=0.0, g=1.0):
        i = int(at * SR); y = y[: max(0, N - i)]
        if buf.ndim == 1: buf[i:i + len(y)] += y * g; return
        buf[i:i + len(y), 0] += y * g * np.sqrt(0.5 * (1 - pan)); buf[i:i + len(y), 1] += y * g * np.sqrt(0.5 * (1 + pan))
    for b0 in range(0, nbars, cpb):
        ci = (b0 // cpb) % len(prog); numeral = prog[ci]
        if ending_bar is not None and b0 >= nbars - 2 * cpb: numeral = prog[0]
        notes = chord_notes(root, mode, numeral); e = np.mean(E[b0:b0 + cpb]); d = min(cpb, nbars - b0) * bar
        for j, nn in enumerate(notes): add(pad, pad_note(mtof(nn), d + 0.8, e, 100 + b0 * 7 + j, pal), b0 * bar, pan=(j - 1.5) * 0.35, g=0.55 + 0.45 * e)
        for bb in range(b0, min(nbars, b0 + cpb)):
            eb = E[bb]; t0 = bb * bar
            if eb >= 0.3:
                bf = mtof(notes[0] - 12)
                for k in ([0, 2] if eb < 0.65 else [0, 1.5, 2, 3]):
                    y = tone(bf, beat * 1.4, [1, .35, .1], decay=2.5, seed=bb) * 0.34; add(bass, y, t0 + k * beat)
            if eb >= 0.5:
                step = beat / (2 if eb >= 0.7 else 1); cnt = int(bar / step)
                for k in range(cnt):
                    deg = [0, 2, 4, 2, 1, 3, 4, 2][k % 8] if pal not in ("guqin",) else k * 2 % 5
                    if pal == "guqin" or mode == "pentatonic": mn = 60 + NOTE[root] + penta[deg % 5] + 12 * (deg // 5)
                    else: mn = notes[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]] + 12
                    if r.random() < (0.15 if eb < 0.7 else 0.05): continue
                    vel = (0.22 if k % 2 == 0 else 0.15) * (0.7 + 0.5 * eb)
                    add(lead, instrument(pal, mtof(mn), 1.4 if pal != "ambient" else 3.0, vel, seed=bb * 31 + k), t0 + k * step, pan=0.4 * np.sin(k), g=1.0)
            if eb >= 0.6 and pal not in ("ambient", "guqin"):
                fl = "taiko" if pal in ("cinematic", "piano") else "clean"
                hits = [0, 2] if eb < 0.75 or pal == "cinematic" else [0, 1, 2, 3]
                for k in hits: add(drums, kick(fl) * (0.55 if k else 0.7), t0 + k * beat)
                if eb >= 0.75 and pal in ("synth", "marimba"):
                    for k in range(bpb * 2): add(drums, hat(r), t0 + k * beat / 2, pan=0.3, g=0.8 if k % 2 else 0.5)
            if pal == "guqin" and eb >= 0.5:  # wood block on 1
                n = int(0.12 * SR); t = np.arange(n) / SR; add(drums, np.sin(TAU * 820 * t) * np.exp(-t * 45) * 0.25, t0)
    mix = reverb(pad + lead, 2.6 if pal in ("ambient", "cinematic", "guqin") else 1.6, 0.35) + drums
    mix[:, 0] += bass; mix[:, 1] += bass
    # breath before turns: dip the last beat before a turn scene
    g = np.ones(N)
    for tb in turns:
        a, b = int((tb * bar - beat) * SR), int(tb * bar * SR)
        if a > 0: g[a:b] = np.minimum(g[a:b], np.linspace(1, 0.25, b - a))
    mix *= g[:, None]
    return mix[: int(seconds * SR)]

def music_from_file(sb, P, seconds, bpm, bpb):
    m = sb["music"]; x = decode(os.path.join(P, m["file"]))
    bar = 60 / bpm * bpb; down = float(m.get("offset", m.get("firstDownbeat", 0))); sb_ = int(m.get("startBar", 0))
    start = down + sb_ * bar; need = int(seconds * SR); seg = x[int(start * SR):]
    loop_bars = int(m.get("loopBars", 8))
    while len(seg) < need:  # extend by repeating whole phrases from startBar, 40ms crossfade at a bar line
        ph = x[int(start * SR): int((start + loop_bars * bar) * SR)]
        cut = (len(seg) // int(bar * SR)) * int(bar * SR) or len(seg); seg = seg[:cut]; xf = int(0.04 * SR)
        if len(ph) <= xf: break
        tail = seg[-xf:] * np.linspace(1, 0, xf)[:, None] + ph[:xf] * np.linspace(0, 1, xf)[:, None]
        seg = np.concatenate([seg[:-xf], tail, ph[xf:]])
    return seg[:need] * float(m.get("gain", 1.0))

# ------------------------------------------------------------------ sfx
def sfx(kind, flavor, r):
    def T(d): return np.arange(int(d * SR)) / SR
    if kind == "impact":
        t = T(2.0); f = 32 + 70 * np.exp(-t * 14); y = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t * 2.6) * 0.9
        y += onepole_lp(r.standard_normal(len(t)), 900) * np.exp(-t * 18) * 1.6
        if flavor in ("tech",): y += np.sign(np.sin(TAU * 55 * t)) * np.exp(-t * 9) * 0.08
        if flavor == "ink": y = y * 0.6 + tone(98, 2.0, [1, 0, .5, 0, .3, .2], decay=1.1, inharm=0.01) * 0.35
        if flavor == "archive": t2 = T(0.5); y = np.sin(TAU * 70 * t2) * np.exp(-t2 * 16) + onepole_lp(r.standard_normal(len(t2)), 2500) * np.exp(-t2 * 35) * 0.7
        return y
    if kind == "whoosh":
        t = T(0.9); x = r.standard_normal(len(t)); env = np.sin(np.pi * np.clip(t / 0.9, 0, 1)) ** 2
        cut = 300 + 3200 * np.sin(np.pi * t / 0.9) ** 2 if flavor != "archive" else 900 + 2500 * np.sin(np.pi * t / 0.9)
        y = onepole_lp(x, cut); y = y - onepole_lp(y, 120); return y * env * (0.9 if flavor != "ink" else 0.55)
    if kind == "riser":
        t = T(2.0); x = onepole_lp(r.standard_normal(len(t)), 600 + 5000 * (t / 2) ** 2); y = x * (t / 2) ** 2.2 * 0.8
        y += np.sin(TAU * np.cumsum(200 + 500 * (t / 2) ** 2) / SR) * (t / 2) ** 3 * 0.12; return y
    if kind == "swell":
        t = T(2.4); x = onepole_lp(r.standard_normal(len(t)), 2500); e = (t / 2.4) ** 2.5; e[-int(0.08 * SR):] *= np.linspace(1, 0, int(0.08 * SR)); return x * e * 0.7
    if kind == "ding":
        if flavor == "tech": t = T(0.35); return (np.sin(TAU * 1760 * t) * (t < 0.12) + np.sin(TAU * 2637 * t) * (t >= 0.12)) * np.exp(-t * 12) * 0.25
        if flavor == "swiss": return instrument("marimba", 880, 1.0, 0.5)
        return tone(1318 if flavor != "ink" else 988, 2.2, [1, 0, .5, 0, 0, .25], decay=1.5, inharm=0.03) * 0.3
    if kind == "tick":
        t = T(0.05); return np.sin(TAU * 2200 * t) * np.exp(-t * 120) * 0.35
    if kind == "type":
        out = np.zeros(int(1.8 * SR))
        for k in range(14):
            i = int((k * 0.12 + r.uniform(0, 0.03)) * SR); t = T(0.03); c = onepole_lp(r.standard_normal(len(t)), 4000) * np.exp(-t * 200) * 0.5
            out[i:i + len(c)] += c[: len(out) - i]
        return out
    if kind == "gong": return tone(82, 4.0, [1, .6, 0, .4, .3, .2], decay=0.7, inharm=0.008) * 0.4
    if kind == "glitch":
        t = T(0.3); y = np.sign(np.sin(TAU * 180 * t * (1 + 3 * (r.random(len(t)) > 0.97)))) * 0.12; return np.round(y * 6) / 6 * np.exp(-t * 8)
    if kind == "pluck": return instrument("guqin", 293.7, 1.5, 0.5)
    if kind == "heartbeat":
        out = np.zeros(int(1.0 * SR)); k = kick("clean") * 0.6
        for at in (0, 0.28): i = int(at * SR); out[i:i + len(k)] += k[: len(out) - i]
        return out
    raise ValueError("unknown sfx " + kind)

FLAVOR = {"noir-gold": "gold", "ink-wash": "ink", "tech-hud": "tech", "archive-doc": "archive", "swiss-minimal": "swiss", "cosmic-blue": "cosmic"}

def build(P):
    from project import load_project
    sb = load_project(P); m = sb.get("music", {}); bpm = float(m.get("bpm", 120)); bpb = int(m.get("beatsPerBar", 4))
    beat = 60 / bpm; bar = beat * bpb; seconds = sum(s.get("durationSec", s.get("bars", 0) * bar) for s in sb["scenes"]); N = int(seconds * SR)
    os.makedirs(os.path.join(P, "build"), exist_ok=True)
    mode = m.get("mode", "synth")
    if mode == "none": mus = np.zeros((N, 2))
    elif mode == "file": mus = music_from_file(sb, P, seconds, bpm, bpb)
    else: mus = compose(sb, seconds, bpm, bpb)
    mus = mus / (np.max(np.abs(mus)) + 1e-9) * 0.7
    fo = float(m.get("fadeOut", max(bar, 2.0))); nf = min(N, max(0, int(fo * SR)))
    if nf: mus[-nf:] *= np.linspace(1, 0, nf)[:, None] ** 1.5
    fi = int(0.03 * SR); mus[:fi] *= np.linspace(0, 1, fi)[:, None]
    # sfx cues
    fl = FLAVOR.get(sb.get("style"), "gold"); r = rng(7); fx = np.zeros((N + SR * 5, 2)); cues = []; t0 = 0.0
    for i, s in enumerate(sb["scenes"]):
        cs = [dict(c) for c in s.get("sfx", [])]
        if sb.get("autoSfx", True) and sb.get("productionMode") == "stable":
            visual=s["visual"]
            if s.get("staging") == "reveal" and not any(c["type"] == "impact" for c in cs):
                cs.append({"atSec":visual["computed"]["complete"],"type":"impact","gain":.4,"auto":True})
            if visual["name"] == "lag-copy":
                for step in range(len(visual["params"]["opponent"])):
                    cs.append({"atSec":visual["computed"]["at"]+.25+step*visual["params"]["stepSeconds"],"type":"tick","gain":.12,"auto":True})
        elif sb.get("autoSfx", True):
            if i > 0 and not any(c.get("at", 0) <= 0.6 and c["type"] in ("whoosh", "impact", "swell", "riser_end") for c in cs): cs.append({"at": 0, "type": "whoosh", "gain": 0.5, "auto": True})
            if s.get("turn") and i > 0 and not any(c["type"] == "impact" and c.get("at", 0) <= 0.6 for c in cs): cs.append({"at": 0, "type": "impact", "gain": 0.8, "auto": True})
        for c in cs:
            typ = c["type"]; at = t0 + float(c.get("atSec", float(c.get("at", 0)) * beat)); g = float(c.get("gain", 1.0))
            if typ == "riser_end": typ = "riser"; at -= 2.0
            y = sfx(typ, fl, r) * g
            if typ == "whoosh": at -= 0.45
            if typ == "swell": at -= 2.4
            at = max(0.0, at); idx = int(at * SR); pan = float(c.get("pan", 0)); L = len(y)
            fx[idx:idx + L, 0] += y * np.sqrt(0.5 * (1 - pan)); fx[idx:idx + L, 1] += y * np.sqrt(0.5 * (1 + pan))
            cues.append({"t": round(at, 3), "type": typ, "auto": c.get("auto", False)})
        t0 += s.get("durationSec", s.get("bars", 0) * bar)
    fx = reverb(fx[:N], 1.4, 0.18, seed=9) * float(sb.get("sfxGain", 0.55))
    # duck music under impacts
    duck = np.ones(N)
    for c in cues:
        if c["type"] in ("impact", "gong"):
            i = int(c["t"] * SR); n = int(0.6 * SR); d = 1 - 0.4 * np.exp(-np.arange(n) / SR * 5); duck[i:i + n] = np.minimum(duck[i:i + n], d[: max(0, min(n, N - i))])
    narration = np.zeros((N, 2)); speech_duck = np.ones(N); voice_cues = []
    nm = sb.get("narration", {})
    for clip in nm.get("clips", []):
        start = float(clip["at"]); y = decode(os.path.join(P, clip["file"]))
        if start < 0 or start >= seconds: raise ValueError("Narration cue outside timeline")
        idx = int(start * SR); y = y[:N-idx].copy()
        if not len(y): raise ValueError("Empty narration clip")
        fade = min(int(.025 * SR), len(y)//2)
        if fade: y[:fade] *= np.linspace(0,1,fade)[:,None]; y[-fade:] *= np.linspace(1,0,fade)[:,None]
        narration[idx:idx+len(y)] += y * float(clip.get("gain",1.0))
        a=max(0,idx-int(.06*SR)); b=min(N,idx+len(y)+int(.18*SR))
        d=np.ones(b-a)*float(nm.get("musicDuck",.23)); attack=min(int(.06*SR),len(d)); release=min(int(.18*SR),len(d))
        if attack: d[:attack]=np.linspace(1,d[attack-1],attack)
        if release: d[-release:]=np.linspace(d[-release],1,release)
        speech_duck[a:b]=np.minimum(speech_duck[a:b],d)
        voice_cues.append({"id":clip.get("id"),"at":start,"end":start+len(y)/SR,"file":clip["file"]})
    mix = mus * duck[:, None] * speech_duck[:,None] * float(m.get("gain", 1.0)) + fx + narration * float(nm.get("gain",1.0))
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.84  # -1.5 dBFS sample peak; final loudness via ffmpeg loudnorm
    fo2 = int(0.4 * SR); mix[-fo2:] *= np.linspace(1, 0, fo2)[:, None]
    write_wav(os.path.join(P, "build", "music.wav"), mus); write_wav(os.path.join(P, "build", "sfx.wav"), fx / (np.max(np.abs(fx)) + 1e-9) * 0.8)
    write_wav(os.path.join(P, "build", "narration.wav"), narration)
    write_wav(os.path.join(P, "build", "mix.wav"), mix)
    json.dump({"seconds": seconds, "bpm": bpm, "bar": bar, "mode": mode, "cues": cues, "narration": voice_cues}, open(os.path.join(P, "build", "audio.json"), "w"), ensure_ascii=False, indent=1)
    print(f"audio: {seconds:.2f}s, {len(cues)} sfx cues, mode={mode} -> build/mix.wav")

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "beats":
        nb = int(sys.argv[sys.argv.index("--bars") + 1]) if "--bars" in sys.argv else None
        print(json.dumps(analyze(sys.argv[2], nb), ensure_ascii=False, indent=1))
    elif cmd == "build": build(sys.argv[2])

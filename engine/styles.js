/* Style presets. Every visual decision that should stay identical across models lives here.
   Edit tokens, not engine code, when tuning a look. */
(function () {
  const SERIF = "'Noto Serif CJK SC','Noto Serif SC','Source Han Serif SC'";
  const SANS = "'Noto Sans SC','Noto Sans CJK SC','Source Han Sans SC'";
  const MONO = "'Liberation Mono','Courier New','Menlo',monospace";
  const TYPE = "'Courier New','Liberation Mono',monospace";

  window.CKV_STYLES = {
    'noir-gold': {
      name: '暗金电影', fonts: { title: SERIF, body: SERIF, mono: MONO, check: 'Noto Serif CJK SC' },
      weight: { title: 600, body: 400, hook: 500, big: 700 }, tracking: { hook: 0.32, kicker: 0.28 },
      c: { bg0: '#17120b', bg1: '#030303', text: '#efe6d2', dim: '#9c907a', accent: '#d8b45c', accent2: '#f6e7b0',
           line: '#c9a14a', good: '#e2c06a', bad: '#9a4a32', panel: 'rgba(20,16,10,0.55)', shadow: 'rgba(0,0,0,0.85)' },
      titleFill: ['#fbf0c8', '#e0bd6a', '#a77b2e'], bigFill: ['#fff4cf', '#d8b45c', '#8a6424'],
      bg: 'bokeh', fg: 'orbs', particles: { kind: 'dust', count: 90, color: '#f1d68b' },
      overlay: { grain: 0.075, vignette: 0.78, scan: 0, paper: 0, glow: 0.35 },
      line: { mode: 'glow', width: 2.2 }, panel: 'ornate', textIn: 'rise', transition: 'flash',
      hookDeco: 'rules', captionBox: false, dark: true,
      music: { palette: 'cinematic', root: 'D', mode: 'minor', prog: ['i', 'VI', 'III', 'VII'] }
    },
    'ink-wash': {
      name: '水墨东方', fonts: { title: SERIF, body: SERIF, mono: SERIF, check: 'Noto Serif CJK SC' },
      weight: { title: 900, body: 500, hook: 600, big: 900 }, tracking: { hook: 0.4, kicker: 0.35 },
      c: { bg0: '#f1eadb', bg1: '#d9cfba', text: '#1c1a17', dim: '#6d655a', accent: '#b8322a', accent2: '#2b2824',
           line: '#24211d', good: '#2b2824', bad: '#b8322a', panel: 'rgba(241,234,219,0.6)', shadow: 'rgba(0,0,0,0)' },
      titleFill: ['#2a2622', '#141210', '#2a2622'], bigFill: ['#2a2622', '#0e0d0c', '#2a2622'],
      bg: 'mountains', fg: 'mist', particles: { kind: 'ink', count: 26, color: '#2a2622' },
      overlay: { grain: 0.05, vignette: 0.32, scan: 0, paper: 1, glow: 0 },
      line: { mode: 'brush', width: 5 }, panel: 'brush', textIn: 'bleed', transition: 'ink',
      hookDeco: 'seal', captionBox: false, dark: false,
      music: { palette: 'guqin', root: 'D', mode: 'pentatonic', prog: ['i', 'iv', 'v', 'i'] }
    },
    'tech-hud': {
      name: '科技数据', fonts: { title: SANS, body: SANS, mono: MONO, check: 'Noto Sans SC' },
      weight: { title: 700, body: 400, hook: 500, big: 700 }, tracking: { hook: 0.18, kicker: 0.2 },
      c: { bg0: '#06162a', bg1: '#01050c', text: '#e6f6ff', dim: '#6f8ea6', accent: '#38e1ff', accent2: '#7b8cff',
           line: '#38e1ff', good: '#38e1ff', bad: '#ff3d71', panel: 'rgba(8,30,52,0.55)', shadow: 'rgba(0,10,20,0.9)' },
      titleFill: ['#ffffff', '#c9f4ff', '#7fdcff'], bigFill: ['#ffffff', '#7ff0ff', '#2fa8ff'],
      bg: 'grid', fg: 'glyphs', particles: { kind: 'data', count: 70, color: '#38e1ff' },
      overlay: { grain: 0.045, vignette: 0.6, scan: 0.07, paper: 0, glow: 0.45 },
      line: { mode: 'crisp', width: 2 }, panel: 'hud', textIn: 'type', transition: 'glitch',
      hookDeco: 'rec', captionBox: true, dark: true,
      music: { palette: 'synth', root: 'A', mode: 'minor', prog: ['i', 'VI', 'VII', 'v'] }
    },
    'archive-doc': {
      name: '档案纪实', fonts: { title: SERIF, body: SERIF, mono: TYPE, check: 'Noto Serif CJK SC' },
      weight: { title: 700, body: 400, hook: 600, big: 700 }, tracking: { hook: 0.2, kicker: 0.18 },
      c: { bg0: '#e8dcc2', bg1: '#c9b48e', text: '#231b12', dim: '#6e5b43', accent: '#962015', accent2: '#3b2c1c',
           line: '#2c2116', good: '#2c2116', bad: '#b02a1e', panel: 'rgba(246,238,220,0.92)', shadow: 'rgba(60,40,20,0.35)' },
      titleFill: ['#2c2116', '#1c140c', '#2c2116'], bigFill: ['#3a2a1a', '#1c140c', '#3a2a1a'],
      bg: 'archive', fg: 'paperclip', particles: { kind: 'motes', count: 40, color: '#7a5d3a' },
      overlay: { grain: 0.09, vignette: 0.55, scan: 0, paper: 1, glow: 0 },
      line: { mode: 'pencil', width: 2.6 }, panel: 'card', textIn: 'typewriter', transition: 'slide',
      hookDeco: 'tag', captionBox: false, dark: false,
      music: { palette: 'piano', root: 'C', mode: 'minor', prog: ['i', 'VI', 'iv', 'V'] }
    },
    'swiss-minimal': {
      name: '极简瑞士', fonts: { title: SANS, body: SANS, mono: MONO, check: 'Noto Sans SC' },
      weight: { title: 900, body: 500, hook: 700, big: 900 }, tracking: { hook: 0.12, kicker: 0.14 },
      c: { bg0: '#f3f1ec', bg1: '#e6e3dc', text: '#111111', dim: '#77736b', accent: '#e63322', accent2: '#111111',
           line: '#111111', good: '#111111', bad: '#e63322', panel: 'rgba(255,255,255,0.9)', shadow: 'rgba(0,0,0,0)' },
      titleFill: ['#111111', '#111111', '#111111'], bigFill: ['#111111', '#111111', '#111111'],
      bg: 'blocks', fg: 'shapes', particles: { kind: 'none', count: 0, color: '#111' },
      overlay: { grain: 0.03, vignette: 0.12, scan: 0, paper: 0, glow: 0 },
      line: { mode: 'flat', width: 5 }, panel: 'flat', textIn: 'wipe', transition: 'block',
      hookDeco: 'bar', captionBox: false, dark: false,
      music: { palette: 'marimba', root: 'F', mode: 'major', prog: ['I', 'V', 'vi', 'IV'] }
    },
    'cosmic-blue': {
      name: '星空宇宙', fonts: { title: SANS, body: SANS, mono: MONO, check: 'Noto Sans SC' },
      weight: { title: 300, body: 300, hook: 400, big: 200 }, tracking: { hook: 0.4, kicker: 0.36 },
      c: { bg0: '#0b1030', bg1: '#02030a', text: '#eef3ff', dim: '#8a94b8', accent: '#8fb8ff', accent2: '#c7a6ff',
           line: '#9cc4ff', good: '#8fd3ff', bad: '#ff7a9a', panel: 'rgba(14,20,52,0.45)', shadow: 'rgba(0,0,10,0.9)' },
      titleFill: ['#ffffff', '#dfe8ff', '#a9c2ff'], bigFill: ['#ffffff', '#cfe0ff', '#8fb0ff'],
      bg: 'nebula', fg: 'flares', particles: { kind: 'stars', count: 60, color: '#dfe8ff' },
      overlay: { grain: 0.05, vignette: 0.7, scan: 0, paper: 0, glow: 0.5 },
      line: { mode: 'glow', width: 1.6 }, panel: 'glass', textIn: 'glow', transition: 'warp',
      hookDeco: 'thin', captionBox: false, dark: true,
      music: { palette: 'ambient', root: 'E', mode: 'lydian', prog: ['I', 'II', 'vi', 'IV'] }
    }
  };
})();

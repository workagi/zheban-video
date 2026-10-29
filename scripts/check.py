#!/usr/bin/env python3
"""Automated QA gate. Reads <project>/storyboard.json + qa/layout.json (from `render.cjs layout`).
Writes qa/report.md. Exit 1 if any FAIL. Thresholds are the skill's quality bar; do not loosen them to pass."""
import json, os, re, sys
from project import load_project

P = sys.argv[1]
SB = load_project(P)
L = json.load(open(os.path.join(P, "qa", "layout.json")))
st, samples = L["style"], L["samples"]
F, W, H = st["F"], st["W"], st["H"]
fails, warns, oks = [], [], []
MAIN = {"title", "quote", "sub", "caption", "big"}
CPS_FAIL, CPS_WARN, MIN_VIS = 5.0, 4.5, 1.0

def lum_hex(h):
    h = h.lstrip("#")
    if h.startswith(("rgba", "rgb")):
        parts = re.findall(r"[\d.]+",h)
        h = "".join(f"{round(float(v)):02x}" for v in parts[:3])
    if len(h)==3: h="".join(c*2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
def ratio(a, b): a, b = max(a, b), min(a, b); return (a + 0.05) / (b + 0.05)
def nchars(s): return len(re.sub(r"[\s，。！？、；：“”‘’（）《》—…·,.!?;:()\[\]\-]", "", s))

# 1 duration
target = SB.get("duration")
if target and abs(st["duration"] - target) > 0.05: fails.append(f"时长 {st['duration']:.2f}s ≠ 目标 {target}s（调整各场景 bars；1 小节 = {st['bar']:.2f}s）")
else: oks.append(f"时长 {st['duration']:.2f}s，{len(st['scenes'])} 个场景，切点按项目时码（音乐网格 {st['bar']:.2f}s）")
# 2 first frame
s0 = samples[0]
big0 = [b for b in s0["log"] if b.get("role") in ("title", "big", "quote") and b.get("alpha", 0) >= 0.9 and not b.get("deco")]
if not big0: fails.append("首帧没有完全可见的大字（title/big/quote）。第一场景第一行应 at=0")
elif s0.get("mean") is not None and s0["mean"] < 0.005: fails.append(f"首帧过暗（平均亮度 {s0['mean']:.3f}），不能像黑屏")
else: oks.append(f"首帧有大字「{big0[0]['text'][:16]}」，画面平均亮度 {s0.get('mean', 0):.3f}")
# 3 hook
hk = SB.get("hook", "")
if not hk: fails.append("缺少顶部常驻钩子标题 storyboard.hook")
elif nchars(hk) > 18: warns.append(f"钩子标题 {nchars(hk)} 字，建议 ≤ 16 字")
else: oks.append(f"顶部常驻钩子：「{hk}」")
# 4-7 per-sample layout checks
seen = set(); ov_cnt = 0; contrast_min = {}
_td = min(0.6, st.get("beat", 0.5) * 1.2) / 2 + 0.05  # 转场窗口内不测对比度（两场景叠化，属瞬时）
_bounds = [sc["t0"] for sc in st.get("scenes", [])[1:]]
in_trans = lambda t: any(abs(t - b0) < _td for b0 in _bounds)
sx0, sx1, sy0, sy1 = F["safe"]["l"], W - F["safe"]["r"], F["safe"]["t"], H - F["safe"]["b"]
for s in samples:
    vis = [b for b in s["log"] if b.get("alpha", 0) >= 0.5 and b.get("w")]
    for b in vis:
        key = (b["role"], b["text"])
        if b.get("overflow") and ("ov",) + key not in seen: seen.add(("ov",) + key); fails.append(f"文字放不下（已缩到最小字号仍溢出）：{b['role']}「{b['text'][:20]}」→ 缩短文案")
        if not b.get("deco") and (b["x"] < sx0 - 2 or b["x"] + b["w"] > sx1 + 2 or b["y"] < sy0 - 2 or b["y"] + b["h"] > sy1 + 2) and ("safe",) + key not in seen:
            seen.add(("safe",) + key); fails.append(f"超出安全区 @{s['t']:.1f}s：{b['role']}「{b['text'][:16]}」 box=({b['x']:.0f},{b['y']:.0f},{b['w']:.0f}×{b['h']:.0f})")
        mn = F["min"].get(b["role"], 0)
        if not b.get("deco") and b["size"] < mn - 0.5 and ("min",) + key not in seen: seen.add(("min",) + key); fails.append(f"字号 {b['size']}px < 最小 {mn}px：{b['role']}「{b['text'][:16]}」")
        if "bgP50" in b and not b.get("deco") and not in_trans(s["t"]):
            tl = lum_hex(b["color"]) if b["role"] not in ("title", "quote", "big") else lum_hex((st["bigFill"] if b["role"] == "big" else st["titleFill"])[1])
            worst = b.get("bgP75", b["bgP90"]) if tl > b["bgP50"] else b.get("bgP25", b["bgP10"])  # 25/75 分位：忽略穿过文字框的细线
            cr = ratio(tl, worst); k = (b["role"], b["text"])
            contrast_min.setdefault(k, []).append((s["t"], cr))
    for i in range(len(vis)):
        for j in range(i + 1, len(vis)):
            a, c = vis[i], vis[j]
            if a.get("deco") or c.get("deco"): continue
            ix = max(0, min(a["x"] + a["w"], c["x"] + c["w"]) - max(a["x"], c["x"])); iy = max(0, min(a["y"] + a["h"], c["y"] + c["h"]) - max(a["y"], c["y"]))
            if ix * iy > 0.04 * min(a["w"] * a["h"], c["w"] * c["h"]):
                k = ("olap", a["text"], c["text"])
                if k not in seen: seen.add(k); ov_cnt += 1; fails.append(f"文字互相遮挡 @{s['t']:.1f}s：「{a['text'][:12]}」×「{c['text'][:12]}」")
def _sustained(lst):  # 持续 ≥2 个采样（≥0.2s）的最低对比度；单帧动画过渡瞬间不算
    lst.sort(); best = (99, lst[0][0])
    for (t1, a), (t2, b) in zip(lst, lst[1:]):
        if t2 - t1 < 0.25 and max(a, b) < best[0]: best = (max(a, b), t1)
    return best if len(lst) > 1 else (lst[0][1], lst[0][0])
contrast_min = {k: _sustained(v) for k, v in contrast_min.items()}
for (role, text), (cr, t) in contrast_min.items():
    need = 3.0 if role in ("title", "quote", "big", "kicker", "hook", "note", "label") else 4.5
    if cr < need: (fails if cr < need * 0.8 else warns).append(f"对比度 {cr:.2f} < {need}（{role}「{text[:14]}」@{t:.1f}s）→ 加暗/亮底、换色或移位")
if not any("对比度" in f for f in fails): oks.append(f"对比度：{len(contrast_min)} 段文字全部检查，最低 {min([v[0] for v in contrast_min.values()] or [99]):.2f}")
if not ov_cnt: oks.append("无文字互相遮挡；全部文字在安全区内" if not any("安全区" in f for f in fails) else "无文字互相遮挡")
# 8 reading speed
for sc in st["scenes"]:
    for l in sc["lines"]:
        if l["role"] in ("note", "kicker"): continue
        visd = l["outS"] - l["atS"]; n = nchars(l["text"]); cps = n / max(visd, 0.01)
        if visd < MIN_VIS: fails.append(f"停留 {visd:.1f}s < {MIN_VIS}s：「{l['text'][:14]}」")
        elif cps > CPS_FAIL: fails.append(f"读速 {cps:.1f} 字/秒 > {CPS_FAIL}：「{l['text'][:14]}」({n} 字 / {visd:.1f}s)")
        elif cps > CPS_WARN: warns.append(f"读速偏快 {cps:.1f} 字/秒：「{l['text'][:14]}」")
oks.append("读速检查完成（上限 5 字/秒，最短停留 1 秒）")
# 9 turns
tm = SB.get("turnMax", 15); turns = [sc["t0"] for sc in st["scenes"] if sc.get("turn")]
pts = sorted(set([0.0] + turns)) + [st["duration"]]
gaps = [(pts[i + 1] - pts[i], pts[i]) for i in range(len(pts) - 1)]
bad = [g for g in gaps if g[0] > tm + 0.01]
if bad: fails.append("注意力回拉间隔过长：" + "，".join(f"{a:.0f}s 起 {g:.1f}s 无转折" for g, a in bad) + f"（上限 {tm}s；给场景加 turn）")
else: oks.append("转折点：" + " / ".join(f"{t:.0f}s" for t in turns) + f"，最大间隔 {max(g for g, _ in gaps):.1f}s")
# 10 ending
last = SB["scenes"][-1]
end_titles = [l["text"] for l in last.get("lines", []) if l.get("role") in ("quote", "title")]
if last.get("visual", {}).get("type") == "shot":
    headline = last["visual"]["params"]["headline"]
    end_titles.append("".join(headline) if isinstance(headline, list) else headline)
if not end_titles and last.get("visual", {}).get("type") == "custom":
    # Custom components draw through E.label; inspect their actual closing title too.
    closing_t = st["duration"] - SB.get("fadeOut", 1) - .1
    closing = min(samples, key=lambda sample: abs(sample["t"] - closing_t))
    end_titles = [b["text"] for b in closing["log"] if b.get("scene") == last["id"] and b.get("role") in ("title", "quote") and b.get("alpha", 0) >= .9]
if not end_titles: fails.append("最后一个场景缺少落点句（quote/title 或注册镜头 headline）")
else: oks.append("结尾落点：「" + end_titles[-1].replace("[[", "").replace("]]", "").replace("\n", "") + "」")
for sc in SB["scenes"]:
    v = sc.get("visual", {})
    if v.get("type") != "shot": continue
    params = v["params"]
    headline = params["headline"]
    texts = (headline if isinstance(headline, list) else [headline]) + [params.get("subline", ""), params.get("note", "")]
    duration = sc.get("durationSec", sc.get("bars", 0) * st["bar"])
    if sc is SB["scenes"][-1]: duration -= SB.get("fadeOut", 1)
    for value in texts:
        if value and nchars(value) / max(duration, .01) > CPS_FAIL:
            fails.append(f"镜头文字读速 > {CPS_FAIL} 字/秒：「{value[:20]}」；缩短或延长场景")
# 11 facts
fp = os.path.join(P, "facts.md")
if not os.path.exists(fp): fails.append("缺少 facts.md（逐条事实 + 出处）")
else:
    ft = open(fp, encoding="utf-8").read(); urls = set(re.findall(r"https?://\S+", ft))
    if len(urls) < 2: fails.append("facts.md 少于 2 个可点击来源")
    else: oks.append(f"来源记录：{len(urls)} 个不同链接（仅检查记录，不验证事实）")
    for sc in SB["scenes"]:
        vt = [x for x in re.findall(r'"([^"]*)"', json.dumps(sc.get("visual", {}), ensure_ascii=False)) if re.search(r"[\u4e00-\u9fff]", x)]
        for l in sc.get("lines", []) + [{"text": " ".join(vt)}]:
            if re.search(r"\d{2,}", l["text"]) and l.get("role") not in ("note",) and "src" not in l and sc.get("id") not in ft:
                warns.append(f"含数字但未标注出处（src 或在 facts.md 中写场景 id）：{sc.get('id')}「{l['text'][:18]}」"); break

out = ["# QA 报告", "", f"项目：{SB.get('title', '')}  |  {SB.get('format')} {W}×{H}  |  风格 {SB.get('style')}", "",
       f"**结论：{'❌ 未通过' if fails else '✅ 通过'}**（FAIL {len(fails)} · WARN {len(warns)}）", ""]
if fails: out += ["## FAIL（必须修）"] + [f"- {x}" for x in fails] + [""]
if warns: out += ["## WARN（建议修）"] + [f"- {x}" for x in warns] + [""]
out += ["## 通过项"] + [f"- {x}" for x in oks] + ["", "## 人工目检（看 qa/keyframes_sheet.jpg）", "- 每帧有前/中/背景三层且主体清楚", "- 视觉元素没有压到文字；留白均衡", "- 曝光：暗部有层次、亮部不过曝", "- 同一时刻最多一个主动画；字最多两行"]
open(os.path.join(P, "qa", "report.md"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out[:6] + (["FAIL:"] + fails if fails else []) + (["WARN:"] + warns if warns else [])))
sys.exit(1 if fails else 0)

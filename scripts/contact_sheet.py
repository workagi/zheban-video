#!/usr/bin/env python3
"""Tile frames into one review image.
  contact_sheet.py keyframes <project>            -> qa/keyframes_sheet.jpg (from qa/keyframes.json)
  contact_sheet.py video <file.mp4> <out.jpg> [n] -> n evenly spaced frames from the final video"""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

def font(sz):
    for f in ["/usr/share/fonts/google-noto-cjk/NotoSansSC-Medium.otf", "/System/Library/Fonts/PingFang.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()

def sheet(items, out, cols=3, tw=640):
    ims = [Image.open(p).convert("RGB") for p, _ in items]
    w, h = ims[0].size; th = round(tw * h / w); pad = 12; lab = 34
    rows = (len(ims) + cols - 1) // cols
    S = Image.new("RGB", (cols * tw + (cols + 1) * pad, rows * (th + lab) + (rows + 1) * pad), (24, 24, 24))
    d = ImageDraw.Draw(S); f = font(20)
    for i, (im, (_, label)) in enumerate(zip(ims, items)):
        x = pad + (i % cols) * (tw + pad); y = pad + (i // cols) * (th + lab + pad)
        S.paste(im.resize((tw, th), Image.LANCZOS), (x, y + lab)); d.text((x + 4, y + 6), label, fill=(230, 230, 230), font=f)
    S.save(out, quality=90); print(out)

if __name__ == "__main__":
    m = sys.argv[1]
    if m == "keyframes":
        P = sys.argv[2]; ks = json.load(open(os.path.join(P, "qa", "keyframes.json")))
        portrait = Image.open(ks[0]["file"]).size[1] > Image.open(ks[0]["file"]).size[0]
        sheet([(k["file"], f'{k["t"]:.2f}s  {k["label"]}') for k in ks], os.path.join(P, "qa", "keyframes_sheet.jpg"), cols=5 if portrait else 3, tw=380 if portrait else 640)
    elif m == "video":
        src, out = sys.argv[2], sys.argv[3]; n = int(sys.argv[4]) if len(sys.argv) > 4 else 16
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src]).decode().strip())
        tmp = tempfile.mkdtemp(); items = []
        for i in range(n):
            t = 0 if i == 0 else min(dur - 0.05, dur * i / (n - 1) - (0.3 if i == n - 1 else 0))
            p = os.path.join(tmp, f"{i:02d}.jpg"); subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", src, "-frames:v", "1", "-q:v", "3", p], check=True)
            items.append((p, f"{t:.1f}s"))
        portrait = Image.open(items[0][0]).size[1] > Image.open(items[0][0]).size[0]
        sheet(items, out, cols=8 if portrait else 4, tw=300 if portrait else 480)

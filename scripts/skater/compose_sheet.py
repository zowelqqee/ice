"""Lays out the renders from render_sheet.py as one reference sheet (system Python + Pillow).

    python3 scripts/skater/compose_sheet.py [out-dir]
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SKATER_OUT", os.path.expanduser("~/ice/skater-build/out"))
P = lambda n: os.path.join(OUT, n)  # noqa: E731
S = float(open(P("sheet_scale.txt")).read())

W, H, col = int(1536 * S), int(2304 * S), int(516 * S)
sheet = Image.new("RGB", (W, H), (8, 9, 12))
sheet.paste(Image.open(P("sheet_main.png")).convert("RGB"), (0, 0))
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", max(10, int(15 * S)))
except OSError:
    font = ImageFont.load_default()
d = ImageDraw.Draw(sheet)
x0, y = W - col, 0
grey, rule = (170, 176, 188), (40, 42, 48)


def label(text, y):
    d.text((x0 + col - int(14 * S), y + int(12 * S)), text, fill=grey, font=font, anchor="ra")
    d.line([(x0, y), (x0 + col, y)], fill=rule, width=1)


for key, text in (("front", "FRONT"), ("side", "SIDE"), ("back", "BACK")):
    sheet.paste(Image.open(P(f"sheet_{key}.png")).convert("RGB"), (x0, y))
    label(text, y)
    y += int(578 * S)
sheet.paste(Image.open(P("sheet_detail_front.png")).convert("RGB"), (x0, y))
sheet.paste(Image.open(P("sheet_detail_back.png")).convert("RGB"), (x0 + col // 2, y))
label("DETAILS", y)
y += int(285 * S)
for i in range(3):
    w = Image.open(P(f"sheet_wire_{i}.png")).convert("RGB").resize((int(172 * S), int(285 * S)), Image.LANCZOS)
    sheet.paste(w, (x0 + i * int(172 * S), y))
label("WIREFRAME", y)
d.line([(x0, 0), (x0, H)], fill=rule, width=2)
sheet.save(P("skater_sheet.jpg"), quality=92)
print("sheet", P("skater_sheet.jpg"))

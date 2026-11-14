#!/usr/bin/env python3
"""Draws the frames of animations side by side at 3x, on a dark swamp color, for a check by eye.

Usage: python3 strip.py <out.png> <sprite-anim> [...]
"""
import pathlib, sys
from PIL import Image

HERE = pathlib.Path(__file__).parent
rows = []
for key in sys.argv[2:]:
    frames = [Image.open(f) for f in sorted((HERE / "anims").glob(f"{key}-*.png"))]
    rows.append(frames)
side = max(f.width for row in rows for f in row) * 3
sheet = Image.new("RGBA", (side * max(len(r) for r in rows), side * len(rows)), (28, 40, 58, 255))
for y, row in enumerate(rows):
    for x, frame in enumerate(row):
        sheet.alpha_composite(frame.resize((frame.width * 3, frame.height * 3), Image.NEAREST), (x * side, y * side))
sheet.save(sys.argv[1])
print(sheet.size, [len(r) for r in rows])

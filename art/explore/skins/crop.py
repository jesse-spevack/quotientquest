#!/usr/bin/env python3
"""Cuts each lineup in raw/ into one card image per kid, in cards/K01.jpg to cards/K24.jpg.

The x ranges come from a check by eye of each lineup. Ranges can overlap where a wing or a weapon reaches
into the next column. It also writes cards/sheet.png, a contact sheet for a check by eye.
"""
import json, pathlib
from PIL import Image

HERE = pathlib.Path(__file__).parent
SPEC = json.loads((HERE / "spec.json").read_text())
TOP, BOTTOM = 280, 608
RANGES = {
    "common": [(60, 290), (318, 505), (522, 712), (725, 938), (938, 1125), (1138, 1308)],
    "rare": [(75, 288), (315, 495), (505, 668), (685, 848), (845, 1132), (1060, 1290)],
    "epic": [(40, 292), (268, 492), (505, 720), (735, 905), (930, 1110), (1130, 1295)],
    "legendary": [(85, 262), (288, 470), (485, 670), (722, 895), (900, 1115), (1115, 1310)],
}

out = HERE / "cards"
out.mkdir(exist_ok=True)
crops = []
for rarity in SPEC["rarities"]:
    image = Image.open(HERE / "raw" / f"{rarity['id']}.png").convert("RGB")
    for x0, x1 in RANGES[rarity["id"]]:
        crops.append(image.crop((x0, TOP, x1, BOTTOM)))
for number, crop in enumerate(crops, 1):
    crop.save(out / f"K{number:02}.jpg", quality=88)
sheet = Image.new("RGB", (6 * 300, 4 * (BOTTOM - TOP)), (40, 0, 40))
for number, crop in enumerate(crops):
    sheet.paste(crop, ((number % 6) * 300, (number // 6) * (BOTTOM - TOP)))
sheet.save(out / "sheet.png")
print(f"{len(crops)} cards")

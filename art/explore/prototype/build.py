#!/usr/bin/env python3
"""Builds the files of the demo page from the art: sprite sheets, faces, and layers in web/.

Usage: python3 build.py
Each sheet is one row of 160x160 frames: idle, attack, hurt, defeat. sheets.json gives the first frame
and the count of each animation. The idle frames lose any pixel outside the outline of frame 0
(grown by 4 pixels): the model drew sparkles there that the game does not want.
A hurt frame with a magic swirl (much more cyan than frame 0) is left out.
"""
import json, pathlib, shutil
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = pathlib.Path(__file__).parent
WEB = HERE / "web"
ORDER = ["idle", "attack", "hurt", "defeat"]
FRAME = 160
FACES = {"ranger": (11, 1), "bigfoot": (33, 9)}  # the top left of a 36x36 head square in each sprite


def frames(name, anim):
    return [Image.open(f).convert("RGBA") for f in sorted((HERE / "anims").glob(f"{name}-{anim}-*.png"))]


def keep_inside(images, grow=9):
    mask = images[0].getchannel("A").point(lambda a: 255 if a else 0).filter(ImageFilter.MaxFilter(grow))
    out = []
    for image in images:
        clean = Image.new("RGBA", image.size)
        clean.paste(image, (0, 0), mask)
        out.append(drop_specks(clean))
    return out


def drop_specks(image, smallest=12):
    """Clears each group of solid pixels smaller than `smallest`: a loose spark, not part of the body."""
    pixels = np.array(image)
    groups, count = ndimage.label(pixels[..., 3] > 0, structure=np.ones((3, 3)))
    sizes = ndimage.sum(np.ones_like(groups), groups, range(1, count + 1))
    for number, size in enumerate(sizes, 1):
        if size < smallest:
            pixels[groups == number] = 0
    return Image.fromarray(pixels)


def cyan(image):
    """The count of bright cyan pixels: the glow color of the bow and the runes, and of the effects."""
    return sum(1 for r, g, b, a in image.getdata() if a and g > 150 and b > 150 and r < 130)


def drop_effects(images, limit=1.6):
    """Drops each frame with much more cyan than frame 0: the model drew a magic swirl in it."""
    base = max(cyan(images[0]), 20)
    return [image for image in images if cyan(image) <= base * limit]


def main():
    WEB.mkdir(exist_ok=True)
    layout = {}
    for name in ("ranger", "bigfoot"):
        row, layout[name] = [], {}
        for anim in ORDER:
            images = frames(name, anim)
            if not images:
                continue
            if anim == "idle":
                images = keep_inside(images)
            if anim == "hurt":
                images = drop_effects(images)
            images = [drop_specks(image) for image in images]
            layout[name][anim] = [len(row), len(images)]
            row += images
        sheet = Image.new("RGBA", (FRAME * len(row), FRAME))
        for number, image in enumerate(row):
            sheet.alpha_composite(image, (number * FRAME, 0))
        sheet.save(WEB / f"{name}.png", optimize=True)
        sprite = Image.open(HERE / "sprites" / f"{name}.png")
        box = sprite.getbbox()
        left, top = FACES[name]
        sprite.crop((box[0] + left, box[1] + top, box[0] + left + 36, box[1] + top + 36)).save(WEB / f"{name}-face.png")
        print(name, {k: v for k, v in layout[name].items()}, sheet.size)
    (WEB / "sheets.json").write_text(json.dumps(layout) + "\n")
    for layer in ("far", "mid", "near"):
        shutil.copy(HERE / "layers" / f"{layer}.webp", WEB / f"{layer}.webp")


if __name__ == "__main__":
    main()

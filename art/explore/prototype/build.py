#!/usr/bin/env python3
"""Builds the files of the demo page from the art: sprite sheets, faces, and layers in web/.

Usage: python3 build.py
It also writes web/index.html from page-head.html and game.js.
Each sheet is a grid of 160x160 frames, 10 in a row, in the ORDER below. sheets.json gives the first frame
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
ORDER = ["idle", "attack", "hurt", "defeat", "skyshot", "pound", "leap", "throw"]
KEEP = {("bigfoot", "idle"): [0, 1]}  # the later Bigfoot idle frames lose the club runes, so only the calm start stays
STRIP_GLOW = {"bigfoot"}  # sprites whose swirls float off the club: cyan must touch the body or the club
FRAME = 160
COLUMNS = 10
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


def strip_glow(image, reach=2):
    """Clears cyan pixels more than `reach` pixels from any pixel that is not cyan: swirls, not runes."""
    pixels = np.array(image)
    r, g, b, a = (pixels[..., i].astype(int) for i in range(4))
    cyan = (a > 0) & (g > 120) & (b > 140) & (r < 140)
    body = (a > 0) & ~cyan
    near = ndimage.binary_dilation(body, structure=np.ones((3, 3)), iterations=reach)
    pixels[cyan & ~near] = 0
    # A glow halo hugs the club edge. Runes sit inside the club, so peel cyan that touches clear pixels.
    for _ in range(2):
        a = pixels[..., 3]
        r, g, b = (pixels[..., i].astype(int) for i in range(3))
        cyan = (a > 0) & (g > 120) & (b > 140) & (r < 140)
        edge = ndimage.binary_dilation(a == 0, structure=np.ones((3, 3)))
        pixels[cyan & edge] = 0
    return drop_specks(Image.fromarray(pixels))


def main():
    WEB.mkdir(exist_ok=True)
    layout = {}
    for name in ("ranger", "bigfoot"):
        row, layout[name] = [], {}
        for anim in ORDER:
            images = frames(name, anim)
            if not images:
                continue
            if (name, anim) in KEEP:
                images = [images[i] for i in KEEP[(name, anim)]]
            if anim == "idle":
                images = keep_inside(images)
            if name in STRIP_GLOW:
                images = [strip_glow(image) for image in images]
            if anim == "hurt":
                images = drop_effects(images)
            images = [drop_specks(image) for image in images]
            layout[name][anim] = [len(row), len(images)]
            row += images
        # A grid of 10 columns keeps the sheet under 4096 pixels: the texture limit of many phones and tablets.
        rows = (len(row) + COLUMNS - 1) // COLUMNS
        sheet = Image.new("RGBA", (FRAME * COLUMNS, FRAME * rows))
        for number, image in enumerate(row):
            sheet.alpha_composite(image, (number % COLUMNS * FRAME, number // COLUMNS * FRAME))
        sheet.save(WEB / f"{name}.png", optimize=True)
        sprite = Image.open(HERE / "sprites" / f"{name}.png")
        box = sprite.getbbox()
        left, top = FACES[name]
        sprite.crop((box[0] + left, box[1] + top, box[0] + left + 36, box[1] + top + 36)).save(WEB / f"{name}-face.png")
        print(name, {k: v for k, v in layout[name].items()}, sheet.size)
    (WEB / "sheets.json").write_text(json.dumps(layout) + "\n")
    for layer in ("far", "mid", "near"):
        shutil.copy(HERE / "layers" / f"{layer}.webp", WEB / f"{layer}.webp")
    # The page: the head part, then game.js inline (the artifact page cannot load a script file of its own).
    page = (HERE / "page-head.html").read_text() + "<script>\n" + (HERE / "game.js").read_text() + "</script>\n"
    (WEB / "index.html").write_text(page)


if __name__ == "__main__":
    main()

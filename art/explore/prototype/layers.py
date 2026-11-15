#!/usr/bin/env python3
"""Makes the three parallax layers of the swamp demo from the Gemini images in raw/.

Usage: python3 layers.py
far: the full sky and water, scaled to the game size, as JPEG.
mid and near: the magenta key becomes clear. Edge pixels lose the magenta that the painter mixed in.
"""
import pathlib
import numpy as np
from PIL import Image, ImageFilter

HERE = pathlib.Path(__file__).parent
SIZE = (1920, 1080)
KEY = np.array([252.0, 1.0, 252.0])


def keyed(name, solid=170.0, clear=80.0):
    image = np.asarray(Image.open(HERE / "raw" / f"{name}.png").convert("RGB").resize(SIZE, Image.LANCZOS), float)
    distance = np.linalg.norm(image - KEY, axis=2)
    alpha = np.clip((distance - clear) / (solid - clear), 0, 1)
    # A painted edge pixel is a mix of the art and the key: take the key out again.
    safe = np.maximum(alpha, 1e-3)[..., None]
    color = np.clip((image - (1 - alpha[..., None]) * KEY) / safe, 0, 255)
    # Spill: the swamp has no magenta, so red and blue both above green is key color that stayed.
    r, g, b = image[..., 0], image[..., 1], image[..., 2]
    spill = np.minimum(r, b) - g
    purple = spill / np.maximum(image.max(axis=2), 1)
    alpha *= 1 - np.clip((spill - 30) / 90, 0, 1)
    alpha *= 1 - np.clip((purple - 0.08) / 0.12, 0, 1) * (spill > 6)
    excess = np.clip(np.minimum(color[..., 0], color[..., 2]) - color[..., 1], 0, None)
    color[..., 0] -= excess * 0.85
    color[..., 2] -= excess * 0.6
    # Where blue is above green, red above green is violet from the key: make it night blue.
    violet = (color[..., 2] > color[..., 1]) & (color[..., 0] > color[..., 1])
    color[..., 0] = np.where(violet, color[..., 1], color[..., 0])
    # Pull the edge in by one pixel, so no thin key line stays around the art.
    solid_mask = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))
    alpha = np.minimum(alpha, np.asarray(solid_mask, float) / 255 + 0.35)
    alpha[alpha < 0.1] = 0
    # In the band 3 pixels in from the edge, blue night pixels with extra red read as lavender: cut the red.
    inner = np.asarray(Image.fromarray(((alpha > 0.99) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(7)), float) > 0
    band = (alpha > 0) & ~inner & (color[..., 2] > color[..., 1])
    color[..., 0] = np.where(band, np.minimum(color[..., 0], color[..., 1] * 0.62), color[..., 0])
    # Clear pixels take the color of the art near them, so smooth scaling shows no key color at the edges.
    weight = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(9))
    weight = np.asarray(weight, float)[..., None] / 255
    spread = np.dstack([np.asarray(Image.fromarray(np.clip(color[..., i] * alpha, 0, 255).astype(np.uint8))
                                   .filter(ImageFilter.BoxBlur(9)), float) for i in range(3)]) / 255
    fill = np.where(weight > 0.01, spread * 255 / np.maximum(weight, 0.01), [20, 34, 52])
    color = np.where(alpha[..., None] > 0, color, fill)
    out = np.dstack([np.clip(color, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(out)


def main():
    out = HERE / "layers"
    out.mkdir(exist_ok=True)
    Image.open(HERE / "raw" / "far.png").convert("RGB").resize(SIZE, Image.LANCZOS).save(out / "far.webp", quality=86, method=6)
    for name in ("mid", "near"):
        image = keyed(name)
        image = image.crop((0, image.getbbox()[1], SIZE[0], SIZE[1])) if name == "near" else image
        image.save(out / f"{name}.webp", quality=88, method=6, exact=True)
        print(name, image.size, (out / f"{name}.webp").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()

"""Frame cleanup for PixelLab output: magenta key, loose specks, and magic effects that the game draws in code."""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage


def key_background(image, tolerance=10):
    """Makes the flat background clear and every other pixel fully solid, then trims.

    PixelLab gives the background as flat magenta or as flat black. Magenta is cleared everywhere, also in holes
    such as a veil. Black is cleared only where it touches the border, so dark outlines stay.
    """
    pixels = np.array(image.convert("RGBA")).astype(int)
    r, g, b, a = (pixels[..., i] for i in range(4))
    border = np.concatenate([pixels[0, :, :3], pixels[-1, :, :3], pixels[:, 0, :3], pixels[:, -1, :3]])
    colors, counts = np.unique(border, axis=0, return_counts=True)
    bg = colors[counts.argmax()]
    magenta = (r > 150) & (b > 150) & (g < 110) & (abs(r - b) < 90)
    if bg[0] > 150 and bg[2] > 150 and bg[1] < 110:
        key = (a < 128) | magenta
    else:
        near = (a < 128) | (np.abs(pixels[..., :3] - bg).max(-1) <= tolerance)
        groups, _ = ndimage.label(near)
        edge = set(np.unique(np.concatenate([groups[0], groups[-1], groups[:, 0], groups[:, -1]]))) - {0}
        key = np.isin(groups, list(edge))
    pixels[..., 3] = 255
    pixels[key] = 0
    # A converted edge pixel can blend the body color with the key color. Peel such pixels from the outside in.
    for _ in range(2):
        r, g, b = (pixels[..., i] for i in range(3))
        tinted = (pixels[..., 3] > 0) & (r - g > 45) & (b - g > 45) & (abs(r - b) < 110)
        edge = ndimage.binary_dilation(pixels[..., 3] == 0, structure=np.ones((3, 3)))
        pixels[tinted & edge] = 0
    out = drop_specks(Image.fromarray(pixels.astype("uint8")))
    return out.crop(out.getbbox())


def outline(image, color=(22, 18, 30, 255)):
    """Adds a one-pixel dark outline around the silhouette, as on the ranger and the Bigfoot."""
    pixels = np.array(image.convert("RGBA"))
    pad = np.zeros((pixels.shape[0] + 2, pixels.shape[1] + 2, 4), dtype=pixels.dtype)
    pad[1:-1, 1:-1] = pixels
    solid = pad[..., 3] > 0
    ring = ndimage.binary_dilation(solid, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])) & ~solid
    pad[ring] = color
    return Image.fromarray(pad)


def drop_specks(image, smallest=12):
    """Clears each group of solid pixels smaller than `smallest`: a loose spark, not part of the body."""
    pixels = np.array(image)
    groups, count = ndimage.label(pixels[..., 3] > 0, structure=np.ones((3, 3)))
    if count:
        sizes = ndimage.sum(np.ones_like(groups), groups, range(1, count + 1))
        for number, size in enumerate(sizes, 1):
            if size < smallest:
                pixels[groups == number] = 0
    return Image.fromarray(pixels)


def keep_inside(images, grow=9):
    """Clears each pixel outside the outline of frame 0, grown by `grow`: sparkles around an idle body."""
    mask = images[0].getchannel("A").point(lambda a: 255 if a else 0).filter(ImageFilter.MaxFilter(grow))
    out = []
    for image in images:
        clean = Image.new("RGBA", image.size)
        clean.paste(image, (0, 0), mask)
        out.append(drop_specks(clean))
    return out


def palette(image, reach=2):
    """A color table of a still sprite: True for each color near a color of the sprite (32 levels per channel)."""
    pixels = np.array(image.convert("RGBA"))
    rgb = pixels[pixels[..., 3] > 0][:, :3] >> 3
    table = np.zeros((32, 32, 32), bool)
    table[rgb[:, 0], rgb[:, 1], rgb[:, 2]] = True
    return ndimage.binary_dilation(table, iterations=reach)


def new_colors(pixels, table):
    """A mask of the solid pixels whose color is not in the color table."""
    rgb = pixels[..., :3] >> 3
    return (pixels[..., 3] > 0) & ~table[rgb[..., 0], rgb[..., 1], rgb[..., 2]]


def novel(image, table):
    """The share of solid pixels with a color that the still sprite does not have: effect colors."""
    pixels = np.array(image.convert("RGBA"))
    solid = (pixels[..., 3] > 0).sum()
    return float(new_colors(pixels, table).sum() / solid) if solid else 0.0


def drop_effects(images, base, share=0.08):
    """Drops each frame where many pixels have colors that the still sprite does not have: a magic swirl."""
    kept = [image for image in images if novel(image, base) <= share]
    return kept or images[:1]


def strip_novel(image, table):
    """Clears pixels with a new color that sit at the outer edge: a halo or a trail around the body."""
    pixels = np.array(image.convert("RGBA"))
    new = new_colors(pixels, table)
    for _ in range(3):
        edge = ndimage.binary_dilation(pixels[..., 3] == 0, structure=np.ones((3, 3)))
        peel = new & edge
        if not peel.any():
            break
        pixels[peel] = 0
        new &= ~peel
    return drop_specks(Image.fromarray(pixels))


def color_shift(image, base):
    """How far the mean color of a frame moves from the still sprite: a flash or a wash over the whole body."""
    def mean(picture):
        pixels = np.array(picture.convert("RGBA")).astype(float)
        solid = pixels[..., 3] > 0
        return pixels[solid][:, :3].mean(0) if solid.any() else np.zeros(3)
    return float(np.abs(mean(image) - mean(base)).sum())


def drop_washed(images, base, limit):
    """Drops each frame whose colors moved far from the still sprite. Frame 0 always stays."""
    return images[:1] + [image for image in images[1:] if color_shift(image, base) <= limit]

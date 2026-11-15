#!/usr/bin/env python3
"""Makes the animated skin sprites of Quotient Quest from skins.json.

Usage, from the repo root:
  GEMINI_API_KEY=... python3 art/tools/skins.py ref [id ...]      a side-view reference sprite on magenta (Gemini)
  PIXEL_LAB_KEY=...  python3 art/tools/skins.py pixel [id ...]    true pixel art from the reference (PixelLab, 6 generations)
  PIXEL_LAB_KEY=...  python3 art/tools/skins.py animate [id ...]  the animations of the class (PixelLab, about 4 to 8 each)
  python3 art/tools/skins.py build [id ...]                       cleans the frames, writes the sheets and manifest.json
  python3 art/tools/skins.py strip <id> <out.png>                 a contact sheet of all frames for a check by eye
  PIXEL_LAB_KEY=...  python3 art/tools/skins.py balance
With no ids, a step runs for each skin. Each paid result is a file, so a second run skips work that exists.
Work files go to art/sprites/skins/<id>/src/. The game uses art/sprites/skins/<id>/sheet.png and manifest.json.
"""
import json, pathlib, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import cleanup  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT / "art/tools/skins.json").read_text())
SKINS = {s["id"]: s for s in SPEC["skins"]}
OUT = ROOT / "art/sprites/skins"
ORDER = ["idle", "attackA", "attackB", "hurt", "defeat"]
FRAME, COLUMNS = SPEC["canvas"], 10
FOOT = FRAME - 4  # the ground line inside each frame: the feet of the still sprite touch it
PROTOTYPE = ROOT / "art/explore/prototype/web"
PROTO_ANIMS = {"ranger": {"idle": "idle", "attackA": "attack", "attackB": "skyshot", "hurt": "hurt", "defeat": "defeat"},
               "bigfoot": {"idle": "idle", "attackA": "attack", "attackB": "pound", "hurt": "hurt", "defeat": "defeat"}}


def src(skin):
    folder = OUT / skin["id"] / "src"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def source_image(skin):
    """The crop of the approved art that shows this skin, with pieces of other skins painted out."""
    source = skin["source"]
    image = Image.open(ROOT / source["image"]).convert("RGB")
    if "box" not in source:
        return image
    x0, y0, x1, y1 = source["box"]
    for mx0, my0, mx1, my1 in source.get("mask", []):
        image.paste((22, 30, 44), (mx0, my0, mx1, my1))
    return image.crop((x0, y0, x1, y1))


def pose(skin):
    if skin["class"] == "Tamer":
        return (f"The kid stands in a calm ready stance. The companion: {skin['pet']}. "
                "The kid and the companion stand on the same ground line, and both face right.")
    if skin["class"] == "Knight":
        return f"Calm ready stance: the {skin['weapon']} held ready in front, the shield on the near arm."
    return f"Calm ready stance: the {skin['weapon']} held ready in front, not attacking."


def ref(skin):
    import gemini
    out = src(skin) / "ref.png"
    if out.exists():
        return f"{skin['id']}: ref exists"
    source = src(skin) / "source.png"
    source_image(skin).save(source)
    style = ROOT / SPEC["style_ref"]
    prompt = (
        "The FIRST image shows the exact sprite format we need: one game sprite of a kid hero, pure side view, facing "
        "RIGHT, full body, crisp pixel art with a dark outline and soft moonlit blue rim light, on a flat magenta "
        "background. Draw the character from the SECOND image in exactly that format, size, and pixel style. "
        f"The character: {skin['look']}. {pose(skin)} Keep the colors and the costume of the second image. "
        "Full body from head to feet, centered, filling about 80 percent of the image height, the same size as the "
        "character in the first image. Slim kid proportions, about 3 heads tall, a cute friendly face. "
        "No glowing parts: draw lights, crystals, and magic items as solid bright color with no halo, no glow, no "
        "sparkles, no light rays. The background is ONE flat pure magenta color #FF00FF everywhere, with no shadow, "
        "no ground, no gradient. No text. If the second image shows a piece of another character at an edge, leave it out."
    )
    out.write_bytes(gemini.generate(prompt, [style, source]))
    return f"{skin['id']}: ref done"


HEIGHT = 86  # the body height in art pixels before the outline: the ranger is 88 with its outline


def pixel(skin):
    """Converts the reference to pixel art at a fixed body height, cleans it, and adds the dark outline.

    The fixed-size converter costs about 1 generation; the auto-size converters cost 6 or 20 and give a
    different size for each skin. A cleanup pass (0.1 generation) sharpens the edges.
    """
    import pixellab
    out = src(skin) / "sprite.png"
    if out.exists():
        return f"{skin['id']}: sprite exists"
    image = Image.open(src(skin) / "ref.png").convert("RGB")
    box = cleanup.key_background(image.resize((image.width // 4, image.height // 4), Image.NEAREST)).size
    size = min(256, round(image.height * HEIGHT / (box[1] * 4) / 4) * 4)
    body = {"image": pixellab.encoded(image), "image_size": {"width": image.width, "height": image.height},
            "output_size": {"width": size, "height": size}, "fixer": True, "init_image_strength": 800}
    reply = pixellab.call("/image-to-pixelart", body)
    result = pixellab.wait(reply["background_job_id"]) if "background_job_id" in reply else reply
    raw = pixellab.decoded(result.get("image") or result["images"][0])
    reply = pixellab.call("/correct-pixelart", {"images": [pixellab.encoded(raw)], "strength": 0.1})
    result = pixellab.wait(reply["background_job_id"]) if "background_job_id" in reply else reply
    raw = pixellab.decoded((result.get("images") or [result.get("image")])[0])
    raw.save(src(skin) / "px.png")
    sprite = cleanup.outline(cleanup.key_background(raw))
    sprite.save(out)
    return f"{skin['id']}: sprite {sprite.size} from {size}px"


def actions(skin):
    """The motion text of each animation: the shared moves, then the moves of the fight class."""
    text = {**SPEC["common"], **SPEC["classes"][skin["class"]]}
    return {anim: text[anim].format(weapon=skin["weapon"]) for anim in ORDER}


def short(text, limit=300):
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0]


def canvas(sprite):
    frame = Image.new("RGBA", (FRAME, FRAME))
    frame.alpha_composite(sprite, ((FRAME - sprite.width) // 2, FOOT - sprite.height))
    return frame


def animate(skin, only=None):
    """Makes each animation with PixMiniMax: about 1 generation each, steady colors, and few added effects.

    The text mode (animate-with-text-v3) cost 3 to 4 generations each and added swirls, trails, and color shifts
    to most frames, so the pilot moved to this mode.
    """
    import pixellab
    sprite = Image.open(src(skin) / "sprite.png")
    if sprite.width > FRAME - 8 or sprite.height > FOOT - 4:
        return f"{skin['id']}: sprite {sprite.size} is too big for the {FRAME} canvas"
    folder = src(skin) / "anims"
    folder.mkdir(exist_ok=True)
    costs = json.loads((src(skin) / "cost.json").read_text()) if (src(skin) / "cost.json").exists() else {}
    lines = []
    for anim, motion in actions(skin).items():
        if only and anim not in only:
            continue
        if (folder / f"{anim}-00.png").exists():
            continue
        body = {"first_frame": pixellab.encoded(canvas(sprite)), "description": motion,
                "frame_count": SPEC["frames"][anim], "no_background": True, "direction": "east", "view": "side",
                "subject_description": short(skin["look"]), "initial_pose": short(pose(skin))}
        before = pixellab.balance()
        reply = pixellab.call("/animate-pixminimax", body)
        result = pixellab.wait(reply["background_job_id"])
        for number, item in enumerate(result["images"]):
            pixellab.decoded(item).save(folder / f"{anim}-{number:02}.png")
        costs[anim] = round(before - pixellab.balance(), 2)
        lines.append(f"{anim} {len(result['images'])}")
    (src(skin) / "cost.json").write_text(json.dumps(costs) + "\n")
    return f"{skin['id']}: " + (", ".join(lines) or "all animations exist")


def frames(skin, anim):
    return [Image.open(f).convert("RGBA") for f in sorted((src(skin) / "anims").glob(f"{anim}-*.png"))]


def proto_frames(skin):
    """The frames of a prototype fighter, cut from the cleaned sheets of the swamp demo."""
    name = skin["prototype"]
    sheet = Image.open(PROTOTYPE / f"{name}.png")
    layout = json.loads((PROTOTYPE / "sheets.json").read_text())[name]
    out = {}
    for anim, proto in PROTO_ANIMS[name].items():
        first, count = layout[proto]
        out[anim] = [sheet.crop(((i % COLUMNS) * FRAME, (i // COLUMNS) * FRAME, (i % COLUMNS + 1) * FRAME,
                                 (i // COLUMNS + 1) * FRAME)) for i in range(first, first + count)]
    return out


def clean(skin):
    if "prototype" in skin:
        return proto_frames(skin)
    still = Image.open(src(skin) / "sprite.png")
    base = cleanup.palette(still)
    out = {}
    for anim in ORDER:
        images = frames(skin, anim)
        if not images:
            continue
        # A frame that a check by eye found bad, listed in skins.json as "drop": {"<anim>": [frame numbers]}.
        bad = set(skin.get("drop", {}).get(anim, []))
        images = [image for number, image in enumerate(images) if number not in bad]
        if anim == "idle":
            images = cleanup.keep_inside(images)
        else:
            images = [cleanup.strip_novel(image, base) for image in images]
        if anim == "hurt":
            images = cleanup.drop_effects(images, base)
        # A hit flash in a hurt frame is drawn in code, so a washed hurt frame goes. An attack keeps its smear
        # frames (a classic slash smear), but loses a frame where the whole body turns white.
        images = cleanup.drop_washed(images, still, 100 if anim == "hurt" else 200)
        out[anim] = [cleanup.drop_specks(image) for image in images]
    return out


def hexes(image, count=4):
    """The main colors of a sprite, most used first, without the dark outline and shadow colors."""
    solid = [c[:3] for c in image.getdata() if c[3] and sum(c[:3]) > 120]
    colors = Image.new("RGB", (len(solid), 1))
    colors.putdata(solid)
    quant = colors.quantize(count)
    palette = quant.getpalette()
    return ["#%02x%02x%02x" % tuple(palette[i * 3:i * 3 + 3]) for _, i in sorted(quant.getcolors(), reverse=True)]


def build(ids):
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"frame": FRAME, "columns": COLUMNS, "foot": FOOT, "skins": {}}
    for skin_id in ids:
        skin = SKINS[skin_id]
        anims = clean(skin)
        if "idle" not in anims:
            print(f"{skin_id}: no frames yet")
            continue
        row, layout = [], {}
        for anim in ORDER:
            if anim in anims:
                layout[anim] = {"start": len(row), "count": len(anims[anim])}
                row += anims[anim]
        rows = (len(row) + COLUMNS - 1) // COLUMNS
        sheet = Image.new("RGBA", (FRAME * COLUMNS, FRAME * rows))
        for number, image in enumerate(row):
            sheet.alpha_composite(image, (number % COLUMNS * FRAME, number // COLUMNS * FRAME))
        (OUT / skin_id).mkdir(parents=True, exist_ok=True)
        sheet.save(OUT / skin_id / "sheet.png", optimize=True)
        still = row[0]
        manifest["skins"][skin_id] = {
            "code": skin["code"], "name": skin["name"], "rarity": skin["rarity"], "class": skin["class"],
            "health": skin["health"], "attack": skin["attack"], "palette": hexes(still),
            "sheet": f"{skin_id}/sheet.png", "animations": layout,
        }
        print(f"{skin_id}: {sheet.size}, " + ", ".join(f"{a} {v['count']}" for a, v in layout.items()))
    order = {s["id"]: n for n, s in enumerate(SPEC["skins"])}
    manifest["skins"] = dict(sorted(manifest["skins"].items(), key=lambda kv: order[kv[0]]))
    manifest["rarities"] = SPEC["rarities"]
    manifest_path.write_text(json.dumps(manifest, indent=1) + "\n")


def strip(skin_id, out):
    anims = clean(SKINS[skin_id])
    width = max(len(v) for v in anims.values())
    sheet = Image.new("RGBA", (width * FRAME * 2, len(anims) * FRAME * 2), (28, 40, 58, 255))
    for y, anim in enumerate(anims):
        for x, image in enumerate(anims[anim]):
            sheet.alpha_composite(image.resize((FRAME * 2, FRAME * 2), Image.NEAREST), (x * FRAME * 2, y * FRAME * 2))
    sheet.save(out)
    print(out, {a: len(v) for a, v in anims.items()})


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    step, ids = sys.argv[1], sys.argv[2:]
    if step == "balance":
        import pixellab
        print("generations:", pixellab.balance())
        return
    if step == "strip":
        return strip(ids[0], ids[1])
    ids = ids or [s["id"] for s in SPEC["skins"] if "prototype" not in s or step == "build"]
    if step == "build":
        return build(ids)
    work = {"ref": ref, "pixel": pixel, "animate": animate}[step]
    def run(skin_id):
        try:
            return work(SKINS[skin_id])
        except Exception as error:
            return f"{skin_id}: FAIL {error}"
    with ThreadPoolExecutor(4) as pool:
        for line in pool.map(run, ids):
            print(line, flush=True)


if __name__ == "__main__":
    main()

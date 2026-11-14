#!/usr/bin/env python3
"""Turns the Gemini reference sprites into game sprites and animations with PixelLab.

Usage: PIXEL_LAB_KEY=... python3 pixellab.py pixel|animate|balance [sprite ...]
  pixel    converts raw/<sprite>.png to true pixel art and keys out the magenta: sprites/<sprite>.png
  animate  makes each animation of pixellab.json from sprites/<sprite>.png: anims/<sprite>-<anim>-NN.png
  balance  prints the generations that remain
Each paid result is a file. A second run skips each file that exists.
"""
import base64, io, json, os, pathlib, sys, time, urllib.error, urllib.request
from PIL import Image

HERE = pathlib.Path(__file__).parent
SPEC = json.loads((HERE / "pixellab.json").read_text())
API = "https://api.pixellab.ai/v2"


def call(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": "Bearer " + os.environ["PIXEL_LAB_KEY"], "Content-Type": "application/json"}
    for _ in range(60):
        try:
            return json.loads(urllib.request.urlopen(urllib.request.Request(API + path, data, headers), timeout=300).read())
        except urllib.error.HTTPError as error:
            text = error.read().decode()[:400]
            if error.code == 429 or "concurrent" in text.lower():
                time.sleep(10)
                continue
            raise RuntimeError(f"{path} {error.code}: {text}")
    raise RuntimeError(f"{path}: the provider stayed busy")


def wait(job_id):
    for _ in range(200):
        job = call(f"/background-jobs/{job_id}")
        if job["status"] != "processing":
            if job["status"] != "completed":
                raise RuntimeError(f"job {job_id}: {str(job)[:400]}")
            return job["last_response"]
        time.sleep(5)
    raise RuntimeError(f"job {job_id} did not end")


def encoded(image):
    data = io.BytesIO()
    image.save(data, "PNG")
    return {"type": "base64", "base64": base64.b64encode(data.getvalue()).decode(), "format": "png"}


def decoded(item):
    return Image.open(io.BytesIO(base64.b64decode(item["base64"].split(",")[-1]))).convert("RGBA")


def key_magenta(image):
    """Makes each pixel near the magenta key fully clear, and every other pixel fully solid."""
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a < 128 or (r > 150 and b > 150 and g < 110 and abs(r - b) < 90):
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (r, g, b, 255)
    return image.crop(image.getbbox())


def pixel(name):
    out = HERE / "sprites" / f"{name}.png"
    if out.exists():
        return
    source = Image.open(HERE / "raw" / f"{name}.png").convert("RGB")
    reply = call("/image-to-pixelart-pro", {"image": encoded(source), "description": SPEC["pixel_hint"]})
    result = wait(reply["background_job_id"]) if "background_job_id" in reply else reply
    images = result.get("images") or [result["image"]]
    raw = decoded(images[0])
    raw.save(HERE / "raw" / f"{name}-px.png")
    sprite = key_magenta(raw)
    out.parent.mkdir(exist_ok=True)
    sprite.save(out)
    print(f"{name}: pixel art {raw.size}, sprite {sprite.size}")


def animate(name):
    sprite = Image.open(HERE / "sprites" / f"{name}.png")
    # A canvas with room for the motion: the sprite sits on the floor line, centered.
    side = SPEC["canvas"]
    canvas = Image.new("RGBA", (side, side))
    canvas.alpha_composite(sprite, ((side - sprite.width) // 2, side - sprite.height - 4))
    folder = HERE / "anims"
    folder.mkdir(exist_ok=True)
    for anim, action in SPEC["animations"][name].items():
        if (folder / f"{name}-{anim}-00.png").exists():
            continue
        body = {"first_frame": encoded(canvas), "action": action, "frame_count": SPEC["frames"][anim],
                "no_background": True}
        frames = wait(call("/animate-with-text-v3", body)["background_job_id"])["images"]
        for number, item in enumerate(frames):
            decoded(item).save(folder / f"{name}-{anim}-{number:02}.png")
        print(f"{name} {anim}: {len(frames)} frames")


def balance():
    reply = call("/balance")
    return reply.get("subscription", {}).get("generations", reply)


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("pixel", "animate", "balance"):
        sys.exit(__doc__)
    before = balance()
    print("generations before:", before)
    for name in sys.argv[2:] or SPEC["sprites"]:
        {"pixel": pixel, "animate": animate, "balance": lambda n: None}[sys.argv[1]](name)
    print("generations after:", balance())


if __name__ == "__main__":
    main()

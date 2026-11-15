#!/usr/bin/env python3
"""Makes the art options of the style picker with Retro Diffusion and PixelLab.

Usage: PIXEL_LAB_KEY=... RETRO_DIFFUSION_KEY=... python3 art/explore/generate.py arenas|skins|shopkeepers|items [name ...]
Retro Diffusion makes the arenas. PixelLab makes the characters and the items.
The script writes each PNG to art/explore/raw/ and skips a file that exists.
"""
import base64, json, os, pathlib, sys, time, urllib.error, urllib.request, uuid

HERE = pathlib.Path(__file__).parent
SPEC = json.loads((HERE / "spec.json").read_text())
OUT = HERE / "raw"
PIXELLAB = "https://api.pixellab.ai/v2"
RETRO = "https://api.retrodiffusion.ai/v2/inferences"


def call(url, headers, body=None):
    """Sends one request. Waits while the provider reports a job limit."""
    data = json.dumps(body).encode() if body else None
    for _ in range(60):
        try:
            request = urllib.request.Request(url, data, {**headers, "Content-Type": "application/json"})
            return urllib.request.urlopen(request, timeout=300).read()
        except urllib.error.HTTPError as error:
            if error.code not in (423, 429):
                raise RuntimeError(f"{error.code} {error.read()[:300]}") from error
            time.sleep(8)
    raise RuntimeError("the job limit did not clear")


def pixellab_key():
    return {"Authorization": "Bearer " + os.environ["PIXEL_LAB_KEY"]}


def retro_key():
    return {"X-RD-Token": os.environ["RETRO_DIFFUSION_KEY"]}


def balance():
    return json.loads(call(f"{PIXELLAB}/balance", pixellab_key()))


def retro(prompt, style, seed):
    """Makes one arena with Retro Diffusion. Returns the PNG bytes and the cost."""
    body = {"prompt": f"{prompt}, {SPEC['style']}, {style['extra']}", "prompt_style": style["prompt_style"],
            "width": style["width"], "height": style["height"], "num_images": 1, "seed": seed, "remove_bg": False}
    reply = json.loads(call(RETRO, {**retro_key(), "Idempotency-Key": str(uuid.uuid4())}, body))
    if "task_id" in reply:
        for _ in range(120):
            time.sleep(4)
            task = json.loads(call(f"{RETRO}/tasks/{reply['task_id']}", retro_key()))
            if task["status"] in ("succeeded", "completed", "failed"):
                break
        if task["status"] == "failed" or not task.get("result"):
            raise RuntimeError(f"the task did not succeed: {str(task)[:300]}")
        reply = task["result"]
    return base64.b64decode(reply["base64_images"][0]), reply.get("balance_cost")


def pixflux(prompt, size, seed):
    """Makes one sprite with a transparent background with PixelLab."""
    body = {"description": f"{prompt}, {SPEC['style']}", "image_size": {"width": size, "height": size},
            "no_background": True, "seed": seed, **SPEC["pixellab"]}
    reply = json.loads(call(f"{PIXELLAB}/create-image-pixflux", pixellab_key(), body))
    return base64.b64decode(reply["image"]["base64"].split(",")[-1])


def jobs(kind):
    """Gives (file name, maker) for each image of one kind."""
    if kind == "arenas":
        for name, prompt in SPEC["arenas"].items():
            for number, style in SPEC["arena_styles"].items():
                yield f"{name}-{number}", lambda p=prompt, s=style: retro(p, s, 11)
    else:
        size = 64 if kind == "items" else 96
        for name, prompt in SPEC[kind].items():
            for seed in (1, 2):
                yield f"{name}-{seed}", lambda p=prompt, s=seed: (pixflux(p, size, s * 101), None)


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("arenas", "skins", "shopkeepers", "items"):
        sys.exit(__doc__)
    kind, wanted = sys.argv[1], set(sys.argv[2:])
    OUT.mkdir(exist_ok=True)
    before = balance() if kind != "arenas" else None
    failed = False
    for name, make in jobs(kind):
        target = OUT / f"{name}.png"
        if target.exists() or (wanted and name not in wanted and name.rsplit("-", 1)[0] not in wanted):
            continue
        try:
            data, cost = make()
            target.write_bytes(data)
            print(name, "ok", f"cost {cost}" if cost is not None else "", flush=True)
        except Exception as error:
            failed = True
            print(name, "failed", str(error)[:300], flush=True)
    if before is not None:
        print("PixelLab balance before:", json.dumps(before)[:300])
        print("PixelLab balance after: ", json.dumps(balance())[:300])
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

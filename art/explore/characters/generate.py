#!/usr/bin/env python3
"""Makes the character test images for each variant in spec.json with the Gemini image API.

Usage: GEMINI_API_KEY=... python3 generate.py [image id ...]
An image id is <variant>-battle or <variant>-lineup, for example C1-battle.
With no ids, it makes each image that has no file in raw/. It writes raw/<id>.png.
"""
import base64, json, os, pathlib, sys, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = pathlib.Path(__file__).parent
SPEC = json.loads((HERE / "spec.json").read_text())
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{SPEC['model']}:generateContent"


def prompt(variant, kind):
    world = SPEC["world"] if variant["id"] != "C3" else SPEC["world"].replace("giant redwood forest", "giant stylized 3D redwood forest")
    return f"{SPEC[kind]}\n\n{world}\n\n{SPEC['body']}\n\n{variant['style']}"


def generate(text):
    body = {"contents": [{"parts": [{"text": text}]}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "16:9"}}}
    request = urllib.request.Request(URL, json.dumps(body).encode(),
                                     {"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    try:
        reply = json.loads(urllib.request.urlopen(request, timeout=300).read())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{error.code}: {error.read()[:400]!r}")
    for part in reply["candidates"][0]["content"]["parts"]:
        if "inlineData" in part:
            return base64.b64decode(part["inlineData"]["data"])
    raise RuntimeError(f"no image in the reply: {str(reply)[:400]}")


def main():
    variants = {v["id"]: v for v in SPEC["variants"]}
    images = {f"{v}-{kind}": (variants[v], kind) for v in variants for kind in ("battle", "lineup")}
    out = HERE / "raw"
    out.mkdir(exist_ok=True)
    ids = sys.argv[1:] or [i for i in images if not (out / f"{i}.png").exists()]

    def make(i):
        try:
            (out / f"{i}.png").write_bytes(generate(prompt(*images[i])))
            return f"{i}: done"
        except Exception as error:
            return f"{i}: FAIL {error}"

    with ThreadPoolExecutor(6) as pool:
        results = list(pool.map(make, ids))
    print("\n".join(results))
    sys.exit(1 if any("FAIL" in r for r in results) else 0)


if __name__ == "__main__":
    main()

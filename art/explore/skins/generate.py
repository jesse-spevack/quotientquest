#!/usr/bin/env python3
"""Makes one lineup image of 6 skins for each rarity in spec.json with the Gemini image API.

Usage: GEMINI_API_KEY=... python3 generate.py [rarity id ...]
With no ids, it makes each lineup that has no file in raw/. It writes raw/<rarity>.png.
Each request sends the H2 lineup (style) and the B4 swamp (place) as reference images.
"""
import base64, json, os, pathlib, sys, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = pathlib.Path(__file__).parent
SPEC = json.loads((HERE / "spec.json").read_text())
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{SPEC['model']}:generateContent"
REFERENCES = [HERE.parent / "heroes2/raw/H2-lineup.png", HERE.parent / "backgrounds/raw/B4.png"]


def prompt(rarity):
    kids = " ".join(f"{n} {kid}." for n, kid in enumerate(rarity["kids"], 1))
    return (f"{SPEC['layout']} From left to right: {kids}\n\n{rarity['extra']}\n\n{SPEC['world']}\n\n{SPEC['body']}\n\n"
            f"{SPEC['style']}\n\nThe first reference image shows the character style only: draw new characters, not these. "
            "The second reference image shows the place only.")


def generate(text):
    images = [{"inline_data": {"mime_type": "image/png", "data": base64.b64encode(p.read_bytes()).decode()}} for p in REFERENCES]
    body = {"contents": [{"parts": images + [{"text": text}]}],
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
    rarities = {r["id"]: r for r in SPEC["rarities"]}
    out = HERE / "raw"
    out.mkdir(exist_ok=True)
    ids = sys.argv[1:] or [i for i in rarities if not (out / f"{i}.png").exists()]

    def make(i):
        try:
            (out / f"{i}.png").write_bytes(generate(prompt(rarities[i])))
            return f"{i}: done"
        except Exception as error:
            return f"{i}: FAIL {error}"

    with ThreadPoolExecutor(4) as pool:
        results = list(pool.map(make, ids))
    print("\n".join(results))
    sys.exit(1 if any("FAIL" in r for r in results) else 0)


if __name__ == "__main__":
    main()

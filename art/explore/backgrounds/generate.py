#!/usr/bin/env python3
"""Makes the arena test images in spec.json with the Gemini image API.

Usage: GEMINI_API_KEY=... python3 generate.py [place id ...]
Each request sends the round-5 H2 battle image as a reference, so the fighters and the UI stay the same.
With no ids, it makes each image that has no file in raw/. It writes raw/<id>.png.
"""
import base64, json, os, pathlib, sys, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = pathlib.Path(__file__).parent
SPEC = json.loads((HERE / "spec.json").read_text())
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{SPEC['model']}:generateContent"
REFERENCE = base64.b64encode((HERE / SPEC["reference"]).read_bytes()).decode()


def generate(place):
    text = f"{SPEC['keep']}\n\nThe new place: {place['prompt']}\n\n{SPEC['goals']}"
    body = {"contents": [{"parts": [{"inline_data": {"mime_type": "image/png", "data": REFERENCE}}, {"text": text}]}],
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
    places = {p["id"]: p for p in SPEC["places"]}
    out = HERE / "raw"
    out.mkdir(exist_ok=True)
    ids = sys.argv[1:] or [i for i in places if not (out / f"{i}.png").exists()]

    def make(i):
        try:
            (out / f"{i}.png").write_bytes(generate(places[i]))
            return f"{i}: done"
        except Exception as error:
            return f"{i}: FAIL {error}"

    with ThreadPoolExecutor(6) as pool:
        results = list(pool.map(make, ids))
    print("\n".join(results))
    sys.exit(1 if any("FAIL" in r for r in results) else 0)


if __name__ == "__main__":
    main()

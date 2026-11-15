#!/usr/bin/env python3
"""Makes the reference sprites and the parallax layers of the swamp demo with the Gemini image API.

Usage: GEMINI_API_KEY=... python3 gemini.py [image id ...]
With no ids, it makes each image of gemini.json that has no file in raw/. It writes raw/<id>.png.
Each request sends the reference images of the spec, so the look stays the look of H2 and B4.
"""
import base64, json, os, pathlib, sys, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = pathlib.Path(__file__).parent
SPEC = json.loads((HERE / "gemini.json").read_text())
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{SPEC['model']}:generateContent"


def generate(image):
    parts = [{"inline_data": {"mime_type": "image/png", "data": base64.b64encode((HERE / ref).read_bytes()).decode()}}
             for ref in image["references"]]
    parts.append({"text": image["prompt"] + "\n\n" + SPEC["style"]})
    body = {"contents": [{"parts": parts}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": image["aspect"]}}}
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
    images = SPEC["images"]
    out = HERE / "raw"
    out.mkdir(exist_ok=True)
    ids = sys.argv[1:] or [i for i in images if not (out / f"{i}.png").exists()]

    def make(i):
        try:
            (out / f"{i}.png").write_bytes(generate(images[i]))
            return f"{i}: done"
        except Exception as error:
            return f"{i}: FAIL {error}"

    with ThreadPoolExecutor(6) as pool:
        results = list(pool.map(make, ids))
    print("\n".join(results))
    sys.exit(1 if any("FAIL" in r for r in results) else 0)


if __name__ == "__main__":
    main()

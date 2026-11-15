#!/usr/bin/env python3
"""Makes one style test image for each style in spec.json with the Gemini image API.

Usage: GEMINI_API_KEY=... python3 generate.py [style id ...]
With no ids, it makes each style that has no file in raw/. It writes raw/<id>.png.
"""
import base64, json, os, pathlib, sys, urllib.error, urllib.request

HERE = pathlib.Path(__file__).parent
SPEC = json.loads((HERE / "spec.json").read_text())
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{SPEC['model']}:generateContent"


def generate(style):
    body = {"contents": [{"parts": [{"text": f"{SPEC['scene']}\n\n{style['prompt']}"}]}],
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
    styles = {style["id"]: style for style in SPEC["styles"]}
    out = HERE / "raw"
    out.mkdir(exist_ok=True)
    ids = sys.argv[1:] or [i for i in styles if not (out / f"{i}.png").exists()]
    failed = False
    for i in ids:
        try:
            (out / f"{i}.png").write_bytes(generate(styles[i]))
            print(f"{i}: done")
        except Exception as error:
            print(f"{i}: FAIL {error}", file=sys.stderr)
            failed = True
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

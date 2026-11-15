"""A small client for the Gemini image API. The key comes from the GEMINI_API_KEY env var only."""
import base64, json, os, urllib.error, urllib.request

MODEL = "gemini-3-pro-image"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"


def generate(prompt, references, aspect="1:1"):
    """Gives the PNG bytes of one image. Each reference is a path to a PNG or a JPEG."""
    parts = []
    for path in references:
        mime = "image/jpeg" if str(path).endswith(".jpg") else "image/png"
        parts.append({"inline_data": {"mime_type": mime, "data": base64.b64encode(open(path, "rb").read()).decode()}})
    parts.append({"text": prompt})
    body = {"contents": [{"parts": parts}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect}}}
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

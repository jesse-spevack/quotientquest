"""A small client for the PixelLab v2 API. The key comes from the PIXEL_LAB_KEY env var only."""
import base64, io, json, os, time, urllib.error, urllib.request
from PIL import Image

API = "https://api.pixellab.ai/v2"


def call(path, body=None):
    """Sends one request. Waits while PixelLab reports a job limit."""
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
    """Polls a background job and gives its last response."""
    for _ in range(240):
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


def balance():
    reply = call("/balance")
    return reply.get("subscription", {}).get("generations", reply)

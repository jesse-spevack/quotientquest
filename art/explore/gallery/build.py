#!/usr/bin/env python3
"""Builds the skin gallery page from art/sprites/skins/manifest.json.

Usage, from the repo root: python3 art/explore/gallery/build.py
It writes index.html and copies each sheet to sheets/<id>.png, the paths the published page uses.
"""
import json, pathlib, shutil

HERE = pathlib.Path(__file__).parent
SKINS = HERE.parents[1] / "sprites/skins"

manifest = json.loads((SKINS / "manifest.json").read_text())
(HERE / "sheets").mkdir(exist_ok=True)
for skin_id, skin in manifest["skins"].items():
    shutil.copy(SKINS / skin["sheet"], HERE / "sheets" / f"{skin_id}.png")
    skin["sheet"] = f"sheets/{skin_id}.png"
page = (HERE / "template.html").read_text()
page = page.replace("__MANIFEST__", json.dumps(manifest)).replace("__COUNT__", str(len(manifest["skins"])))
(HERE / "index.html").write_text(page)
print(len(manifest["skins"]), "skins")

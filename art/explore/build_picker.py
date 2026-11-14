#!/usr/bin/env python3
"""Builds picker.html from the PNG files in raw/. Each image goes into the page as a data URI.

Usage: python3 art/explore/build_picker.py
"""
import base64, json, pathlib

HERE = pathlib.Path(__file__).parent
RAW = HERE / "raw"

GROUPS = {
    "arenas": [("a-temple", "Mountain temple"), ("b-bamboo", "Bamboo river"), ("c-sky", "Sky islands")],
    "skins": [("d-monk", "Staff monk"), ("e-fox", "Fox archer"), ("f-dragon", "Jade dragon knight"), ("g-lantern", "Lantern mage")],
    "shopkeepers": [("h-merchant", "Old merchant"), ("i-panda", "Red panda")],
    "items": [("j-sword", "Curved sword"), ("k-armor", "Jade armor"), ("l-gourd", "Health gourd"), ("m-coin", "Gold coin"), ("n-bigcoin", "Special coin")],
}
STYLE = {"arenas": {"1": "Painted look", "2": "Sharp pixels"}}


def options():
    data = {}
    for group, names in GROUPS.items():
        data[group] = []
        for name, label in names:
            for number in ("1", "2"):
                path = RAW / f"{name}-{number}.png"
                if not path.exists():
                    continue
                data[group].append({"code": name[0].upper() + number, "label": label,
                                    "style": STYLE.get(group, {}).get(number, f"Version {number}"),
                                    "src": "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()})
    return data


def main():
    page = (HERE / "picker_template.html").read_text().replace("__DATA__", json.dumps(options()))
    (HERE / "picker.html").write_text(page)
    print(f"picker.html: {len(page) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()

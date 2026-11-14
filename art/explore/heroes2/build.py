#!/usr/bin/env python3
"""Builds heroes2.html from template.html, spec.json, and the JPEG files in web/."""
import base64, html, json, pathlib

HERE = pathlib.Path(__file__).parent
spec = json.loads((HERE / "spec.json").read_text())


def image(name, alt):
    data = base64.b64encode((HERE / "web" / f"{name}.jpg").read_bytes()).decode()
    return f'<img src="data:image/jpeg;base64,{data}" alt="{alt}" width="1376" height="768">'


blocks = []
for variant in spec["variants"]:
    code, name = variant["id"], html.escape(variant["name"])
    blocks.append(f"""    <section class="style">
      <button class="pick" type="button" data-code="{code}" aria-pressed="false" aria-label="Pick {code}, {name}">
        <span class="shots">{image(f"{code}-battle", f"A fight with {name}")}{image(f"{code}-lineup", f"Six skins with {name}")}</span>
        <span class="badge">Picked</span>
      </button>
      <div class="label"><span class="code">{code}</span><h2>{name}</h2><p>{html.escape(variant['note'])}</p></div>
    </section>""")
page = (HERE / "template.html").read_text().replace("%%VARIANTS%%", "\n".join(blocks))
(HERE / "heroes2.html").write_text(page)
print(f"heroes2.html: {len(page) / 1e6:.2f} MB")

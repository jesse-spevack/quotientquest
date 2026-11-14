#!/usr/bin/env python3
"""Builds arenas.html from template.html, spec.json, and the JPEG files in web/."""
import base64, html, json, pathlib

HERE = pathlib.Path(__file__).parent
spec = json.loads((HERE / "spec.json").read_text())

blocks = []
for place in spec["places"]:
    code, name = place["id"], html.escape(place["name"])
    data = base64.b64encode((HERE / "web" / f"{code}.jpg").read_bytes()).decode()
    blocks.append(f"""    <section class="style">
      <button class="pick" type="button" data-code="{code}" aria-pressed="false" aria-label="Pick {code}, {name}">
        <span class="shots one"><img src="data:image/jpeg;base64,{data}" alt="A fight in the arena {name}" width="1376" height="768"></span>
        <span class="badge">Picked</span>
      </button>
      <div class="label"><span class="code">{code}</span><h2>{name}</h2><p>{html.escape(place['note'])}</p></div>
    </section>""")
page = (HERE / "template.html").read_text().replace("%%VARIANTS%%", "\n".join(blocks))
(HERE / "arenas.html").write_text(page)
print(f"arenas.html: {len(page) / 1e6:.2f} MB")

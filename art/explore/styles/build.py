#!/usr/bin/env python3
"""Builds styles.html from template.html, spec.json, and the JPEG files in web/."""
import base64, html, json, pathlib

HERE = pathlib.Path(__file__).parent
spec = json.loads((HERE / "spec.json").read_text())
blocks = []
for style in spec["styles"]:
    data = base64.b64encode((HERE / "web" / f"{style['id']}.jpg").read_bytes()).decode()
    name = html.escape(style["name"])
    blocks.append(f"""    <section class="style">
      <button class="pick" type="button" data-code="{style['id']}" aria-pressed="false" aria-label="Pick {style['id']}, {name}">
        <img src="data:image/jpeg;base64,{data}" alt="The same fight in the style {name}" width="1376" height="768">
        <span class="badge">Picked</span>
      </button>
      <div class="label"><span class="code">{style['id']}</span><h2>{name}</h2><p>{html.escape(style['note'])}</p></div>
    </section>""")
page = (HERE / "template.html").read_text().replace("%%STYLES%%", "\n".join(blocks))
(HERE / "styles.html").write_text(page)
print(f"styles.html: {len(page) / 1e6:.2f} MB")

#!/usr/bin/env python3
"""Builds skins.html from template.html, spec.json, the cards in cards/, and the lineups in web/."""
import base64, html, json, pathlib

HERE = pathlib.Path(__file__).parent
spec = json.loads((HERE / "spec.json").read_text())


def data(path):
    return "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode()


def stat(kind, label, value):
    return (f'<span class="stat {kind}"><span>{label}</span><span class="bar"><i style="width:{value * 10}%"></i></span>'
            f'<b>{value}</b></span>')


tiers, shots, number = [], [], 0
for rarity in spec["rarities"]:
    cards = []
    for skin in rarity["skins"]:
        number += 1
        code, name = f"K{number:02}", html.escape(skin["name"])
        cards.append(f"""      <button class="card" type="button" data-code="{code}" aria-pressed="false" aria-label="Pick {code}, {name}">
        <span class="art"><img src="{data(HERE / 'cards' / f'{code}.jpg')}" alt="{name}"></span>
        <span class="info"><span class="name-row"><span class="name">{name}</span><span class="code">{code}</span></span>
        {stat("hp", "Health", skin["health"])}{stat("atk", "Attack", skin["attack"])}</span>
        <span class="badge">Picked</span>
      </button>""")
    points = spec["points"][rarity["id"]]
    tiers.append(f"""  <section class="tier" style="--tier: {rarity['color']}">
    <div class="tier-head"><h2>{rarity['name']}</h2><p>{points} points of Health and Attack</p></div>
    <div class="grid">
{chr(10).join(cards)}
    </div>
  </section>""")
    shots.append(f'      <figure><img src="{data(HERE / "web" / (rarity["id"] + ".jpg"))}" alt="The {rarity["name"].lower()} lineup" '
                 f'width="1376" height="768"><figcaption>{rarity["name"]}</figcaption></figure>')
page = (HERE / "template.html").read_text().replace("%%TIERS%%", "\n".join(tiers)).replace("%%SHOTS%%", "\n".join(shots))
(HERE / "skins.html").write_text(page)
print(f"skins.html: {len(page) / 1e6:.2f} MB")

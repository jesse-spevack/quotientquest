# Art tools

These scripts make the animated skin sprites of Quotient Quest. Run them from the repo root.

## Steps for one skin

1. `ref`: Gemini draws a side-view reference sprite on flat magenta. It uses the approved skin card and the ranger sprite as references.
2. `pixel`: PixelLab converts the reference to pixel art at a body height of 86 pixels. The script cleans the background and adds a 1-pixel dark outline. This costs about 1.1 generations.
3. `animate`: PixelLab PixMiniMax makes 5 animations: idle, attack A, attack B, hurt, and defeat. Each costs about 1 generation.
4. `build`: the script cleans the frames and writes `art/sprites/skins/<id>/sheet.png` and `art/sprites/skins/manifest.json`.

Each paid result is a file. A second run skips each file that exists. To make one step again, delete its file first.

## Keys

The scripts read keys from env vars only. Never write a key to a file.

```sh
export PIXEL_LAB_KEY=$(op item get f65h7bzub7qdbzy2tvcfwmweta --vault keys --fields PIXEL_LAB_KEY --reveal)
export GEMINI_API_KEY=$(op item get js-notes --vault keys --fields GEMINI_API_KEY --reveal)
python3 art/tools/skins.py ref hot-dog-knight
python3 art/tools/skins.py pixel hot-dog-knight
python3 art/tools/skins.py animate hot-dog-knight
python3 art/tools/skins.py build
python3 art/tools/skins.py strip hot-dog-knight /tmp/check.png
```

## Files

- `skins.json`: the skins, their fight class, stats, look, and the motion text of each class.
- `skins.py`: the steps above.
- `pixellab.py` and `gemini.py`: small API clients.
- `cleanup.py`: the background key, the outline, and the frame cleanup.

## The sheet format

A sheet is a grid of 160x160 frames with 10 columns. The feet of the still sprite touch the line at y = 156 in each frame. `manifest.json` gives the first frame and the frame count of each animation.

## Lessons

- Use PixMiniMax (`/animate-pixminimax`) for animation. The text mode (`/animate-with-text-v3`) costs 3 to 4 times more, and it adds swirls, trails, and color shifts to most frames.
- Use the fixed-size converter (`/image-to-pixelart`) with `fixer` on. The auto-size converters cost 6 or 20 generations and give each skin a different size.
- Ask Gemini for no glowing parts. The game draws glow and magic in code.
- PixelLab can return the background as flat black or flat magenta. `key_background` handles both.
- A magenta or purple color on a skin can disappear in the key. Ask for other colors on lanterns and crystals.

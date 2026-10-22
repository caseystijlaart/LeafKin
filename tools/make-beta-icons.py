# Makes the beta app icons (icons/beta/) from the normal ones: amber instead of green, with a β badge.
# Usage: python3 tools/make-beta-icons.py   (needs Pillow)
from PIL import Image, ImageDraw, ImageFont
import os

GREEN, PALE = (47, 93, 58), (232, 240, 228)
AMBER, INK = (176, 104, 18), (31, 42, 34)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
here = os.path.dirname(os.path.abspath(__file__))
src, out = os.path.join(here, "../icons"), os.path.join(here, "../icons/beta")
os.makedirs(out, exist_ok=True)

def recolor(im):
    # Each pixel is a blend of the green background and the pale leaf; keep the blend, swap the green.
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            t = max(0.0, min(1.0, (g - GREEN[1]) / (PALE[1] - GREEN[1])))
            px[x, y] = tuple(round(AMBER[i] + (PALE[i] - AMBER[i]) * t) for i in range(3)) + (a,)
    return im

def badge(im, small=False):
    w = im.width
    if small:  # favicon: no room for a badge
        return im
    d = ImageDraw.Draw(im)
    cx, cy, r = w * 0.25, w * 0.25, w * 0.135
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PALE)
    f = ImageFont.truetype(FONT, int(r * 1.35))
    d.text((cx, cy + r * 0.04), "β", font=f, fill=INK, anchor="mm")
    return im

for name in ["icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png", "favicon-32.png"]:
    im = Image.open(os.path.join(src, name)).convert("RGBA")
    badge(recolor(im), small=name.startswith("favicon")).save(os.path.join(out, name), optimize=True)
    print("made", name)

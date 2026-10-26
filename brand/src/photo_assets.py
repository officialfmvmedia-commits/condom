"""CONDOM v2 photo assets: logo crops, avatar, app icon, favicons, hero pack with white->alpha. Run from repo root."""
import numpy as np
from PIL import Image, ImageDraw

src = Image.open('brand/png/condom-real-top.jpg').convert('RGB')
CX, CY, OBJ = (182 + 846) / 2, (151 + 875) / 2, 724  # bbox of the condom incl. shadow

def square(fill):
    side = OBJ / fill
    x0, y0 = int(CX - side / 2), int(CY - side / 2)
    canvas = Image.new('RGB', (int(side), int(side)), (255, 255, 255))
    crop = src.crop((max(0, x0), max(0, y0), min(1024, x0 + int(side)), min(1024, y0 + int(side))))
    canvas.paste(crop, (max(0, -x0), max(0, -y0)))
    return canvas

sq = square(0.80).resize((1024, 1024), Image.LANCZOS)
sq.save('brand/png/condom-logo-square-1024.png'); sq.save('brand/png/condom-logo-square-1024.jpg', quality=92)
rd = square(0.74).resize((1024, 1024), Image.LANCZOS).convert('RGBA')
mask = Image.new('L', (4096, 4096), 0); ImageDraw.Draw(mask).ellipse((0, 0, 4095, 4095), fill=255)
rd.putalpha(mask.resize((1024, 1024), Image.LANCZOS)); rd.save('brand/png/condom-logo-round-1024.png')
square(0.72).resize((1080, 1080), Image.LANCZOS).save('brand/png/condom-avatar-1080.png')
tight = square(0.90)
tight.resize((1024, 1024), Image.LANCZOS).save('brand/png/condom-app-icon-1024.png')
tight.resize((180, 180), Image.LANCZOS).save('public/apple-touch-icon.png')
for s in (32, 64, 192): tight.resize((s, s), Image.LANCZOS).save(f'public/img/icon-{s}.png')
for s in (96, 192): rd.resize((s, s), Image.LANCZOS).save(f'public/img/logo-{s}.png')

# hero: crop the 2x2 pack, then colour-to-alpha against white
pk = Image.open('brand/png/condom-2x2-pack-raw.jpg').convert('RGB').crop((291, 13, 1021, 706))
pk.save('brand/png/condom-hero-pack.jpg', quality=92)
im = np.asarray(pk).astype(np.float32)
c = np.where(im >= 250, 255, im)
a = np.max((255 - c) / 255, axis=2, keepdims=True)
rgb = np.where(a > 0, (c - 255 * (1 - a)) / np.maximum(a, 1e-4), 255)
out = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8), 'RGBA')
out.save('brand/png/condom-hero-pack-alpha.png'); out.save('public/img/hero-pack.webp', quality=88)

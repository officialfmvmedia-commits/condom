"""CONDOM v2 (friendly) brand SVGs: rounded wordmark + PROTECTED seal. Text is outlined (Nunito 900)."""
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import os, math

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'svg'); os.makedirs(OUT, exist_ok=True)
GREEN = '#009242'      # pump green, median of condom-real-top.jpg
GREEN_DEEP = '#006B2E'
TINT = '#E8F6EE'
INK = '#14231A'
WHITE = '#FFFFFF'

font = instantiateVariableFont(TTFont(os.path.join(HERE, '..', 'fonts', 'Nunito-VariableFont_wght.ttf')), {'wght': 900})
gs = font.getGlyphSet(); cmap = font.getBestCmap(); CAP = font['OS/2'].sCapHeight

def glyph(ch, x, y, scale, rot=None):
    pen = SVGPathPen(gs)
    if rot is None:
        t = (scale, 0, 0, -scale, x, y)
    else:
        c, s = math.cos(rot), math.sin(rot)
        t = (scale * c, scale * s, scale * s, -scale * c, x, y)
    gs[cmap[ord(ch)]].draw(TransformPen(pen, t))
    return pen.getCommands()

def width(ch, scale): return gs[cmap[ord(ch)]].width * scale

def wordmark(color, cap=100, track=0.04, pad=20):
    scale = cap / CAP; x = pad; paths = []
    for i, ch in enumerate('CONDOM'):
        paths.append(f'<path d="{glyph(ch, x, pad + cap, scale)}" fill="{color}"/>')
        x += width(ch, scale) + (cap * track if i < 5 else 0)
    W, H = x + pad, cap + pad * 2 + cap * 0.04
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}">{"".join(paths)}</svg>', W, H

def seal(size=512, fg=GREEN, tint=TINT, label='PROTECTED'):
    c = size / 2; R = size * 0.47
    p = [f'<circle cx="{c}" cy="{c}" r="{R:.1f}" fill="{tint}" stroke="{fg}" stroke-width="{size*0.022:.1f}"/>',
         f'<circle cx="{c}" cy="{c}" r="{R*0.64:.1f}" fill="none" stroke="{fg}" stroke-width="{size*0.008:.1f}" stroke-dasharray="{size*0.012:.1f} {size*0.022:.1f}" stroke-linecap="round" opacity=".55"/>']
    text = f'{label} • {label} • '
    cap = size * 0.07; scale = cap / CAP; tr = R * 0.80
    ws = [width(ch, scale) + cap * 0.16 for ch in text]
    k = 2 * math.pi * tr / sum(ws); ang = -math.pi / 2
    for ch, w in zip(text, ws):
        aw = w * k / tr; mid = ang + aw / 2
        if ch != ' ':
            gw = width(ch, scale); rot = mid + math.pi / 2
            px, py = c + tr * math.cos(mid), c + tr * math.sin(mid)
            x0 = px - gw / 2 * math.cos(rot); y0 = py - gw / 2 * math.sin(rot)
            p.append(f'<path d="{glyph(ch, x0, y0, scale, rot)}" fill="{fg}"/>')
        ang += aw
    r = R * 0.48
    p.append(f'<circle cx="{c}" cy="{c}" r="{r:.1f}" fill="{fg}"/>')
    s = r * 0.95
    p.append(f'<path d="M {c-s*0.42:.1f} {c+s*0.02:.1f} L {c-s*0.1:.1f} {c+s*0.34:.1f} L {c+s*0.46:.1f} {c-s*0.3:.1f}" fill="none" stroke="{WHITE}" stroke-width="{r*0.24:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">{"".join(p)}</svg>'

def write(n, s): open(os.path.join(OUT, n), 'w').write(s)
s, W, H = wordmark(INK); write('condom-wordmark-ink.svg', s)
s, W, H = wordmark(GREEN); write('condom-wordmark-green.svg', s)
s, W, H = wordmark(WHITE); write('condom-wordmark-white.svg', s)
write('condom-seal-protected.svg', seal())
write('condom-seal-protected-white.svg', seal(fg=WHITE, tint=GREEN))
print('wordmark', round(W), round(H))

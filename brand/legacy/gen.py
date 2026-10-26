"""Generates CONDOM brand SVGs (text converted to outlines, no font dependency)."""
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import os, math

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'svg')
os.makedirs(OUT, exist_ok=True)
FONT = os.path.join(HERE, '..', 'fonts', 'Unbounded-VariableFont_wght.ttf')

LATEX = '#3BFFB4'
VOID = '#060708'
BONE = '#F4F6F5'

font = instantiateVariableFont(TTFont(FONT), {'wght': 760})
gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm
CAP = font['OS/2'].sCapHeight

def glyph_path(ch, x, scale, baseline):
    name = cmap[ord(ch)]
    pen = SVGPathPen(gs)
    tp = TransformPen(pen, (scale, 0, 0, -scale, x, baseline))
    gs[name].draw(tp)
    return pen.getCommands(), gs[name].width * scale

def ring(cx, cy, r, color, inner=True):
    """The CONDOM seal: thick outer ring (the rolled rim) + hairline inner ring + seal tick."""
    sw = r * 0.34
    ro = r - sw / 2
    parts = [f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{ro:.2f}" fill="none" stroke="{color}" stroke-width="{sw:.2f}"/>']
    if inner:
        ri = r * 0.36
        parts.append(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{ri:.2f}" fill="none" stroke="{color}" stroke-width="{r*0.085:.2f}"/>')
    return '\n'.join(parts)

def mark_svg(size=512, fg=LATEX, bg=None, pad=0.1):
    r = size * (0.5 - pad)
    c = size / 2
    bgrect = f'<rect width="{size}" height="{size}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">{bgrect}{ring(c,c,r,fg)}</svg>'

def wordmark_body(cap_h, x0, baseline, fg, ring_color, tracking=0.06):
    """Returns (svg body, total width). O's are replaced by the seal ring."""
    scale = cap_h / CAP
    x = x0
    body = []
    for i, ch in enumerate('CONDOM'):
        if ch == 'O':
            # ring sized to cap height, centered on cap height
            ow = gs[cmap[ord('O')]].width * scale
            r = cap_h / 2 * 1.04
            body.append(ring(x + ow / 2, baseline - cap_h / 2, r, ring_color))
            x += ow
        else:
            d, w = glyph_path(ch, x, scale, baseline)
            body.append(f'<path d="{d}" fill="{fg}"/>')
            x += w
        if i < 5: x += cap_h * tracking
    return '\n'.join(body), x - x0

def wordmark_svg(fg=BONE, ring_color=LATEX, bg=None, cap_h=100, padx=24, pady=24):
    body, w = wordmark_body(cap_h, padx, pady + cap_h * 1.02, fg, ring_color)
    W = w + padx * 2; H = cap_h * 1.04 + pady * 2
    bgrect = f'<rect width="{W:.0f}" height="{H:.0f}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}">{bgrect}{body}</svg>', W, H

def text_path(s, x, baseline, cap_h, fg, tracking=0.0, anchor='start'):
    scale = cap_h / CAP
    widths = [gs[cmap[ord(ch)]].width * scale for ch in s]
    total = sum(widths) + cap_h * tracking * (len(s) - 1)
    if anchor == 'middle': x -= total / 2
    out = []
    for ch, w in zip(s, widths):
        if ch != ' ':
            d, _ = glyph_path(ch, x, scale, baseline)
            out.append(f'<path d="{d}" fill="{fg}"/>')
        x += w + cap_h * tracking
    return '\n'.join(out), total

def seal_svg(size=512, fg=LATEX, bg=None, label='PROTECTED'):
    """Circular 'PROTECTED' seal: outer hairline, circular text, ring mark in center."""
    c = size / 2
    R = size * 0.46
    scale_cap = size * 0.062
    parts = []
    if bg: parts.append(f'<rect width="{size}" height="{size}" fill="{bg}"/>')
    parts.append(f'<circle cx="{c}" cy="{c}" r="{R:.2f}" fill="none" stroke="{fg}" stroke-width="{size*0.012:.2f}"/>')
    parts.append(f'<circle cx="{c}" cy="{c}" r="{R*0.66:.2f}" fill="none" stroke="{fg}" stroke-width="{size*0.006:.2f}" opacity=".55"/>')
    # circular text laid glyph by glyph
    text = f'{label} · {label} · '
    scale = scale_cap / CAP
    tr = R * 0.83  # baseline radius (text sits inside outer ring)
    widths = [gs[cmap[ord(ch)]].width * scale + scale_cap * 0.18 for ch in text]
    total = sum(widths)
    k = (2 * math.pi * tr) / total  # stretch to fill full circle
    ang = -math.pi / 2
    for ch, w in zip(text, widths):
        aw = w * k / tr
        mid = ang + aw / 2
        if ch != ' ':
            gw = gs[cmap[ord(ch)]].width * scale
            pen = SVGPathPen(gs)
            # glyph local coords: x along tangent, y up; place so glyph centered at mid angle
            cos, sin = math.cos(mid), math.sin(mid)
            # rotation so glyph 'up' points outward
            rot = mid + math.pi / 2
            rc, rs = math.cos(rot), math.sin(rot)
            px, py = c + tr * cos, c + tr * sin
            # transform: scale, flip y, translate by -gw/2, rotate, translate to (px,py)
            a, b, cc, d = scale * rc, scale * rs, scale * rs, -scale * rc
            e = px - (gw / 2) * rc
            f = py - (gw / 2) * rs
            tp = TransformPen(pen, (a, b, cc, d, e, f))
            gs[cmap[ord(ch)]].draw(tp)
            parts.append(f'<path d="{pen.getCommands()}" fill="{fg}"/>')
        ang += aw
    parts.append(ring(c, c, R * 0.42, fg))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">' + '\n'.join(parts) + '</svg>'

def write(name, s):
    with open(os.path.join(OUT, name), 'w') as f: f.write(s)

write('condom-mark-latex.svg', mark_svg())
write('condom-mark-bone.svg', mark_svg(fg=BONE))
write('condom-mark-void.svg', mark_svg(fg=VOID))
write('condom-app-icon.svg', mark_svg(fg=LATEX, bg=VOID, pad=0.22))
s, W, H = wordmark_svg(); write('condom-wordmark-bone.svg', s)
s, W, H = wordmark_svg(fg=VOID, ring_color=VOID); write('condom-wordmark-void.svg', s)
s, W, H = wordmark_svg(fg=BONE, ring_color=BONE); write('condom-wordmark-mono.svg', s)
write('condom-seal-protected.svg', seal_svg())
write('condom-seal-protected-bone.svg', seal_svg(fg=BONE))
print('ok', W, H)

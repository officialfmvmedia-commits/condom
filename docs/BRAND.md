# CONDOM brand (v2: friendly)

**Lines:** NO MORE BLOCK ZEROES. (the dev never buys in block 0) · The dev can't buy block 0. Max 0.3 SOL after. · MAX 1% DEV BUY · Every token born from CONDOM is a better coin. · Every outside block-0 buyer gets named. Publicly.

**Tone:** light, playful, friendly, in the traditional pump.fun register. The safe-sex pun is carried by the product photo (a clean, unused green condom; a blister pack with one pocket torn open) and by words ("protected", "born", "sealed"). Never explicit. Not corporate, not edgy: no dark mode, no neon, no glows, no sharp corners.

v1 (dark, Unbounded, latex mint `#3BFFB4`, ring mark) is retired; its files live in `brand/legacy/` for reference only.

## Logo
The **photo logo**: `brand/png/condom-real-top.jpg`, a photoreal top-down rolled condom in deep pump green on pure white, no text.
- Square (white bg, ~80% fill): `brand/png/condom-logo-square-1024.png` / `.jpg`
- Round (white disc, transparent outside, ~74% fill): `brand/png/condom-logo-round-1024.png`
- X avatar 1080 (white, X crops it round): `brand/png/condom-avatar-1080.png`
- App icon 1024 (tight crop): `brand/png/condom-app-icon-1024.png`
- Web: `public/img/logo-{96,192}.png` (round, used in nav/footer/modal/empty states), favicons `public/img/icon-{32,64,192}.png`, `public/apple-touch-icon.png`.

Always on white or off-white. Don't recolour, outline, tilt more than a playful ~12° on hover, or put it on dark photos.

## Wordmark
"CONDOM" in **Nunito 900**, letter-spacing +0.02em, Ink colour. Next to the logo, the wordmark cap height is ~0.55× the logo diameter (nav: 40px logo + 23px type).
In-app it's live text (`<Wordmark />`). Outlined SVGs (no font dependency): `brand/svg/condom-wordmark-{ink,green,white}.svg`; PNG `brand/png/condom-wordmark-{ink,green}.png`.

## Palette
| Token | Hex | Use |
|---|---|---|
| Page | `#FAFBF8` | page background (off-white) |
| Surface | `#FFFFFF` | cards, nav on scroll, modal |
| Tint | `#E8F6EE` | light green surfaces: badges, active nav, notices, report stats (`#F2FAF5` lighter) |
| Line | `#E4EAE5` | borders, dividers |
| Ink | `#14231A` | text (dark green-black, never pure black) |
| Mist | `#5D6C63` | secondary text |
| **Pump green** (primary) | `#009242` | CTAs, PROTECTED, highlights. Median of the condom pixels in `condom-real-top.jpg` |
| Green hi / deep | `#00A452` / `#006B2E` | hover, bar gradient / text on Tint, button edge |
| Flag | `#E0444E` (on `#FDECEC`) | UNPROTECTED / sells only |
| Amber | `#B86E00` (on `#FFF3DC`) | CAUTION only |

Green is the only brand colour. Flag/Amber are grade states, never decoration.

## Type (SIL OFL, bundled locally)
- **Nunito** (variable 200–1000, rounded terminals): everything. 900 for headlines, wordmark and big numbers; 800 for buttons/labels; 500–700 body. Subset Latin woff2 `public/fonts/Nunito.woff2`.
- **Geist Mono**: only for raw addresses/mints (`.copy`).
Full TTFs + licence in `brand/fonts/`.

## Shapes and motion
Pills for buttons/chips/tabs, 24px card radius (16px inputs), 1px light borders, soft shadows (`0 10px 30px -14px rgba(20,35,26,.14)`), primary buttons have a 2px deep-green bottom edge. Motion is bouncy and small: hover lift, gentle float on the hero photo, sticker wobble. Respect `prefers-reduced-motion`.

## Hero
`public/img/hero-pack.webp`: the 2x2 blister pack (`brand/png/condom-2x2-pack-raw.jpg`) cropped and converted white→alpha (`brand/png/condom-hero-pack-alpha.png`), so it sits on the off-white page with its own soft shadow. The PROTECTED seal is stuck on the torn corner like a sticker.

## PROTECTED seal
- Circular sticker, green on white: Tint disc, green rim, "PROTECTED •" ring text (Nunito 900, outlined), dashed inner ring, solid green centre with a white rounded check. `brand/svg/condom-seal-protected.svg` (+ `-white` for green backgrounds), PNG `brand/png/condom-seal-protected-1024.png`, web `public/img/seal-protected.svg`.
- In-app pill: `<ProtectedBadge />`: white check in a green dot + "Protected", Nunito 800, deep green on Tint. Every token born on CONDOM carries it; outside coins never do, even with a clean report.
- Grade chips: PROTECTED (green check), CAUTION (amber !), UNPROTECTED (red ×).

## X / social
| Asset | Path |
|---|---|
| X banner 1500×500 (chosen: 2x2 pack, one torn) | `brand/png/condom-banner-2x2-1500x500.png` (also `public/og.png`) |
| Alternate banner | `brand/png/condom-banner-4pack-1500x500.png` |
| X avatar 1080 | `brand/png/condom-avatar-1080.png` |

## Regenerate
`python3 brand/src/gen.py` (wordmark + seal SVGs) then `node brand/src/render.mjs <in.svg> <out.png> <w> <h> t`. Logo/avatar/favicon/hero crops: `python3 brand/src/photo_assets.py`.

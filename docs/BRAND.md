# CONDOM brand

**Lines:** NO MORE BLOCK ZEROES. (the dev never buys in block 0) · The dev can't buy block 0. Max 0.3 SOL after. · MAX 1% DEV BUY · Every token born from CONDOM is a better coin. · Outside block-0 buyers get named. Publicly.

**Tone:** cheeky but premium. The safe-sex pun is carried by confidence ("protected", "born", "sealed"), never by imagery. No explicit visuals.

## Mark
The **Seal**: a thick ring (the rolled rim / a sealed zero) with a hairline inner ring. Reads as a seal, a rolled rim and a "0" that's been contained. In the wordmark both O's are replaced by the Seal, in the accent colour.
Geometry (unit radius r): outer stroke 0.34r centred at r−0.17r; inner ring radius 0.36r, stroke 0.085r. Source: `brand/src/gen.py` (text is converted to outlines, so SVGs have no font dependency).

## Palette
| Token | Hex | Use |
|---|---|---|
| Void | `#060708` | background |
| Carbon | `#0B0D10` | raised surfaces |
| Bone | `#F4F6F5` | text, wordmark |
| Mist | `#9AA3AB` | secondary text |
| **Latex** (signature) | `#3BFFB4` | accent, the Seal, CTAs, PROTECTED |
| Latex ink | `#03140D` | text on Latex |
| Flag | `#FF5D73` | UNPROTECTED / sells only |
| Amber | `#FFC65C` | CAUTION only |

One accent only. Flag/Amber are semantic states, never decoration.

## Type (all SIL OFL, bundled locally)
- **Unbounded** 700–800: display, wordmark, numbers in headlines.
- **Geist** 400–600: UI and body.
- **Geist Mono**: addresses, amounts, badges (slashed zero on).
Web fonts are subset Latin woff2 in `public/fonts/`; full TTFs + licence in `brand/fonts/`.

## PROTECTED seal
- Circular seal: `brand/svg/condom-seal-protected.svg` (+ `-bone`), PNG `brand/png/condom-seal-protected-1024.png`.
- In-app pill: `<ProtectedBadge />` (Seal + "PROTECTED", Geist Mono caps, Latex on 12% Latex). Every token born on CONDOM carries it; outside coins never do, even with a clean report.

## Files
| Asset | Path |
|---|---|
| Mark SVG (latex / bone / void) | `brand/svg/condom-mark-*.svg` |
| Mark PNG 1024 (transparent) | `brand/png/condom-mark-1024.png` |
| App icon SVG / PNG 1024 | `brand/svg/condom-app-icon.svg`, `brand/png/condom-app-icon-1024.png` |
| Wordmark SVG (bone / void / mono) | `brand/svg/condom-wordmark-*.svg` |
| Wordmark PNG (transparent, 1766×304) | `brand/png/condom-wordmark-{bone,void}-1766x304.png` |
| X banner 1500×500 | `brand/png/condom-x-banner-1500x500.png` |
| Avatar 1080×1080 | `brand/png/condom-avatar-1080.png` |

Regenerate: `python3 brand/src/gen.py` then `node brand/src/render.mjs <in.svg|html> <out.png> <w> <h> [t]`.

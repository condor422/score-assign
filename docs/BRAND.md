# ScoreAssign brand

The logo is a gold flute-and-staff mark on a deep maroon field. The palette
below is sampled from that artwork, so marketing material and the application
agree without anyone matching colors by eye.

Downloads:

- [scoreassign-palette.png](brand/scoreassign-palette.png) — swatch sheet for decks and print
- [scoreassign-palette.svg](brand/scoreassign-palette.svg) — the same sheet, vector
- `apps/web/public/brand/scoreassign-logo.png` — full lockup
- `apps/web/public/brand/scoreassign-mark.png` — compact mark, square
- `apps/web/public/brand/icon-512.png`, `icon-180.png`, `icon-32.png` — app and touch icons

Both sheets are generated: `node scripts/generate-palette.mjs` re-renders them
from the same hex list, and the values match `apps/web/tailwind.config.js`.

## Maroon — primary

The logo field. Maroon is the brand's surface color, not merely an accent: dark
plates with gold type are the signature combination.

| Token | Hex | RGB | Use |
| --- | --- | --- | --- |
| `maroon-950` | `#2A0203` | 42, 2, 3 | Deepest shadow, footers |
| `maroon-900` | `#3A0304` | 58, 3, 4 | Logo field, dark plates, headers |
| `maroon-800` | `#4A0E0F` | 74, 14, 15 | Headings on light backgrounds |
| `maroon-700` | `#6B1418` | 107, 20, 24 | Primary buttons, active tab |
| `maroon-600` | `#8A1D22` | 138, 29, 34 | Hover state |
| `maroon-500` | `#A83A3F` | 168, 58, 63 | Accents, chart series |
| `maroon-100` | `#F6E4E4` | 246, 228, 228 | Borders, dividers |
| `maroon-50` | `#FCF4F4` | 252, 244, 244 | Tinted table rows |

## Gold — accent

The mark itself. Gold reads well on maroon and poorly on white, so it is used
for accents, borders and secondary buttons — never for body text on a light
background.

| Token | Hex | RGB | Use |
| --- | --- | --- | --- |
| `gold-800` | `#7A5A1E` | 122, 90, 30 | Gold-toned text on light backgrounds |
| `gold-700` | `#A87C2E` | 168, 124, 46 | Icon strokes |
| `gold-600` | `#C09A47` | 192, 154, 71 | Dividers on maroon |
| `gold-500` | `#D8B058` | 216, 176, 88 | Secondary buttons, focus ring |
| `gold-400` | `#E8C868` | 232, 200, 104 | Highlights, hover on maroon |
| `gold-100` | `#F7EBCF` | 247, 235, 207 | Badges |
| `gold-50` | `#FCF7EA` | 252, 247, 234 | Callouts |

## Neutrals and status

| Token | Hex | Use |
| --- | --- | --- |
| `ink` | `#1C1A17` | Body text — warm black, not pure black |
| `surface` | `#FAF7F2` | Application background (warm cream) |
| `success` | `#2F6B4F` | Confirmed assignments |
| `caution` | `#8F5A0C` | Trial notices, over-capacity warnings |
| `danger` | `#B02418` | Declines, suspended workspaces, destructive actions |
| `info` | `#2C5F73` | Neutral notices |

Status colors are deliberately desaturated so they sit beside maroon without
competing with it. `danger` is distinct from `maroon-700` in saturation, which
matters because a destructive button must not read as a primary one.

## Usage rules

1. **Gold on maroon, maroon on cream.** Gold type on white or cream fails
   contrast at body sizes; use `gold-800` if gold-toned text is unavoidable.
2. **One maroon plate per screen.** The header is the plate; cards stay on
   `surface` or white so the eye has somewhere to rest.
3. **Never recolor the logo.** It ships as a gold-on-maroon raster. On a light
   background use the lockup as-is; on a dark background use the compact mark.
4. **Keep clear space** of at least the height of the mark's cap around the
   lockup.
5. **Body text is `ink`**, never maroon. Maroon is for headings and chrome.

## Typography

The app uses the system UI stack (`Inter`, then platform defaults), with
semibold for headings and regular for body. Marketing material can substitute
any humanist sans; avoid slab and script faces, which fight the mark.

## Contrast

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `ink` on `surface` | 16.3:1 | AAA body text |
| white on `maroon-700` | 12.1:1 | AAA button label |
| `gold-400` on `maroon-900` | 10.8:1 | AAA — the logo's own pairing |
| `maroon-800` on `surface` | 14.4:1 | AAA heading |
| `danger` on `surface` | 6.3:1 | AA body, AAA large |
| `success` on `surface` | 5.9:1 | AA body |
| `gold-800` on `surface` | 5.9:1 | AA body |
| `caution` on `surface` | 5.4:1 | AA body |
| `gold-500` on white | 2.0:1 | **fails** — decoration only |

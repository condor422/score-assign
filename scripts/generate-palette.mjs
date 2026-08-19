/**
 * Renders the marketing palette sheet from the same hex values the app ships,
 * so the downloadable swatch cannot drift from the theme. Writes an SVG plus a
 * PNG rendered from it.
 *
 *   node scripts/generate-palette.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../docs/brand');

const groups = [
  {
    title: 'Maroon — primary surface, drawn from the logo field',
    swatches: [
      { name: 'Maroon 950', hex: '#2A0203', note: 'Deepest shadow' },
      { name: 'Maroon 900', hex: '#3A0304', note: 'Logo field, dark plates' },
      { name: 'Maroon 800', hex: '#4A0E0F', note: 'Headings on light' },
      { name: 'Maroon 700', hex: '#6B1418', note: 'Primary action' },
      { name: 'Maroon 600', hex: '#8A1D22', note: 'Hover' },
      { name: 'Maroon 500', hex: '#A83A3F', note: 'Accents, charts' },
      { name: 'Maroon 100', hex: '#F6E4E4', note: 'Borders' },
      { name: 'Maroon 50', hex: '#FCF4F4', note: 'Tinted rows' },
    ],
  },
  {
    title: 'Gold — the mark itself; accent, never body text on white',
    swatches: [
      { name: 'Gold 800', hex: '#7A5A1E', note: 'Gold text on light' },
      { name: 'Gold 700', hex: '#A87C2E', note: 'Icon strokes' },
      { name: 'Gold 600', hex: '#C09A47', note: 'Dividers on maroon' },
      { name: 'Gold 500', hex: '#D8B058', note: 'Secondary action' },
      { name: 'Gold 400', hex: '#E8C868', note: 'Highlight, hover' },
      { name: 'Gold 100', hex: '#F7EBCF', note: 'Badges' },
      { name: 'Gold 50', hex: '#FCF7EA', note: 'Callouts' },
    ],
  },
  {
    title: 'Neutrals and status',
    swatches: [
      { name: 'Ink', hex: '#1C1A17', note: 'Body text' },
      { name: 'Surface', hex: '#FAF7F2', note: 'App background' },
      { name: 'Success', hex: '#2F6B4F', note: 'Confirmed' },
      { name: 'Caution', hex: '#8F5A0C', note: 'Trial, over capacity' },
      { name: 'Danger', hex: '#B02418', note: 'Declined, suspended' },
      { name: 'Info', hex: '#2C5F73', note: 'Neutral notices' },
    ],
  },
];

const W = 1260;
const CARD = 132;
const GAP = 16;
const PER_ROW = 8;
const HEAD = 150;

function group(g, top) {
  const rows = Math.ceil(g.swatches.length / PER_ROW);
  const cells = g.swatches
    .map((s, index) => {
      const x = 40 + (index % PER_ROW) * (CARD + GAP);
      const y = top + 34 + Math.floor(index / PER_ROW) * (CARD + 54);
      return `
    <rect x="${x}" y="${y}" width="${CARD}" height="${CARD}" rx="10" fill="${s.hex}" stroke="#E4DACB" />
    <text x="${x}" y="${y + CARD + 18}" font-size="14" font-weight="600" fill="#1C1A17">${s.name}</text>
    <text x="${x}" y="${y + CARD + 34}" font-size="13" font-family="monospace" fill="#6B1418">${s.hex}</text>
    <text x="${x}" y="${y + CARD + 48}" font-size="11" fill="#7A7266">${s.note}</text>`;
    })
    .join('');
  return {
    markup: `
    <text x="40" y="${top + 12}" font-size="17" font-weight="700" fill="#3A0304">${g.title}</text>${cells}`,
    height: 34 + rows * (CARD + 54) + 24,
  };
}

let cursor = HEAD;
let body = '';
for (const g of groups) {
  const rendered = group(g, cursor);
  body += rendered.markup;
  cursor += rendered.height;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${cursor + 40}" viewBox="0 0 ${W} ${cursor + 40}" font-family="Inter, Segoe UI, sans-serif">
  <rect width="${W}" height="${cursor + 40}" fill="#FAF7F2" />
  <rect x="0" y="0" width="${W}" height="104" fill="#3A0304" />
  <text x="40" y="52" font-size="28" font-weight="700" fill="#E8C868">ScoreAssign brand palette</text>
  <text x="40" y="80" font-size="14" fill="#F7EBCF">Gold on maroon, sampled from the ScoreAssign logo. Hex values match apps/web/tailwind.config.js.</text>
  ${body}
</svg>
`;

mkdirSync(outDir, { recursive: true });
const svgPath = resolve(outDir, 'scoreassign-palette.svg');
writeFileSync(svgPath, svg);

// The SVG is the source of truth; the PNG is a convenience for people who want
// to drop the palette into a deck. Either rasteriser will do, and neither being
// installed is a warning rather than a failure.
const pngPath = resolve(outDir, 'scoreassign-palette.png');
const rasterisers = [
  ['rsvg-convert', ['-w', String(W * 2), svgPath, '-o', pngPath]],
  [
    'python3',
    [
      '-c',
      `import cairosvg; cairosvg.svg2png(url=${JSON.stringify(svgPath)}, write_to=${JSON.stringify(pngPath)}, scale=2)`,
    ],
  ],
];

const rendered = rasterisers.some(([command, args]) => {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});
if (!rendered) console.warn('no SVG rasteriser available; PNG not regenerated');

console.log(`wrote ${svgPath}`);

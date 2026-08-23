/**
 * Draws the three ad vehicles so they can be looked at.
 *
 *   npm run vehicles
 *
 * Not a test — a picture. Every visual defect in this project has been found by
 * rendering something and looking at it, and none of them by reading the
 * markup: the dashed focus rings on the card image, the sign that overflowed
 * its board, the lamppost glow that fell across a shopfront. A vehicle that is
 * the wrong size for the road, or whose wheels float, will be obvious here in a
 * second and invisible in a diff.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { join } from 'path';
import sharp from 'sharp';
import Vehicle, { VEHICLE_SIZE } from '@/components/Vehicle';
import { TIME_PALETTES } from '@/lib/palette';

const palette = TIME_PALETTES.day;

/* The strip of road a vehicle actually has to live in, taken from the street
   renderer rather than guessed: baseline 560, sidewalk 56, frame 720. */
const BASELINE = 560;
const CURB_Y = BASELINE + 56;
const VIEW_HEIGHT = 720;
const ROAD_DEPTH = VIEW_HEIGHT - CURB_Y;

const WIDTH = 1200;
const HEIGHT = 560;

const kinds = [
  { kind: 'led' as const, body: '#E8544B', label: 'LED truck' },
  { kind: 'pickup' as const, body: '#4FA382', label: 'Pickup' },
  { kind: 'van' as const, body: '#4A90C4', label: 'Van' },
];

const rows = kinds
  .map((v, i) => {
    const y = 190 + i * 130;
    const drawn = renderToStaticMarkup(
      <Vehicle kind={v.kind} body={v.body} stroke={palette.stroke} id={`ad-${v.kind}`} />,
    );
    return `
      <text x="40" y="${y - 40}" font-family="Verdana, sans-serif" font-size="15" font-weight="700" fill="#1A1A1A">${v.label} — ${VEHICLE_SIZE[v.kind].width}x${VEHICLE_SIZE[v.kind].height}</text>
      <g transform="translate(230 ${y})">${drawn}</g>
      <line x1="230" y1="${y}" x2="1160" y2="${y}" stroke="#B9B9B2" stroke-width="2" stroke-dasharray="7 6"/>
      <line x1="230" y1="${y - ROAD_DEPTH}" x2="1160" y2="${y - ROAD_DEPTH}" stroke="#E8544B" stroke-width="2" stroke-dasharray="4 5"/>`;
  })
  .join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${palette.road}"/>
  <text x="40" y="40" font-family="Verdana, sans-serif" font-size="16" font-weight="700" fill="#1A1A1A">Marlow ad vehicles</text>
  <text x="40" y="64" font-family="Verdana, sans-serif" font-size="13" fill="#33332F">grey dash = road surface · red dash = the curb, ${ROAD_DEPTH} units above it</text>
  ${rows}
</svg>`;

const out = join(process.cwd(), 'vehicle-preview.png');
sharp(Buffer.from(svg))
  .png()
  .toFile(out)
  .then((info) => console.log(`wrote ${out} — ${info.width}x${info.height}`))
  .catch((e) => {
    console.error('RASTERISE FAILED:', e.message);
    process.exit(1);
  });

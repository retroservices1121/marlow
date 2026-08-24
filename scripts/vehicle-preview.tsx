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
import Street from '@/components/Street';
import Pedestrians from '@/components/Pedestrians';
import { STREETS, generateLots } from '@/lib/lots';
import type { AdSlot } from '@/lib/ads';
import { TIME_PALETTES } from '@/lib/palette';

const palette = TIME_PALETTES.day;

/* The strip of road a vehicle actually has to live in, taken from the street
   renderer rather than guessed: baseline 560, sidewalk 56, frame 720. */
const BASELINE = 560;
const CURB_Y = BASELINE + 56;
const VIEW_HEIGHT = 720;
const ROAD_DEPTH = VIEW_HEIGHT - CURB_Y;

const WIDTH = 1200;
const HEIGHT = 700;

const kinds = [
  { kind: 'blimp' as const, body: '#A868A8', label: 'Blimp' },
  { kind: 'led' as const, body: '#E8544B', label: 'LED truck' },
  { kind: 'pickup' as const, body: '#4FA382', label: 'Pickup' },
  { kind: 'van' as const, body: '#4A90C4', label: 'Van' },
];

const rows = kinds
  .map((v, i) => {
    const y = 200 + i * 150;
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

/*
 * And the convoy where it actually lives. Three vehicles look fine on a grey
 * card and can still be the wrong size against a building, in the wrong lane,
 * or sitting on the pavement — none of which the card would show.
 */
const main = STREETS.find((st) => st.main);
if (!main) throw new Error('no main street');
const lots = generateLots([{ ...main, count: 9 }]);

const slots: AdSlot[] = [
  { kind: 'blimp', minBidCents: 2000, bidCents: 2400, nextCents: 2500, taken: true, url: 'https://example.com', adUrl: null },
  { kind: 'led', minBidCents: 1000, bidCents: 0, nextCents: 1000, taken: true, url: 'https://example.com', adUrl: null },
  { kind: 'pickup', minBidCents: 500, bidCents: 1200, nextCents: 1300, taken: true, url: 'https://example.com', adUrl: null },
  { kind: 'van', minBidCents: 300, bidCents: 0, nextCents: 300, taken: false, url: null, adUrl: null },
];

const street = renderToStaticMarkup(<Street lots={lots} timeOfDay="day" ads={slots} />);
const box = street.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
if (!box) throw new Error('no viewBox');
let walkerAt = 120;
const inner = street
  .replace(/^<svg[^>]*>/, '')
  .replace(/<\/svg>$/, '')
  .replace(/<rect[^>]*class="mw-focus-ring"[^>]*>(<\/rect>)?/g, '')
  /*
   * Walkers all sit at x = 0 in a still, because the CSS that carries them
   * along the street is not applied to a PNG. Spread here so the drawing can
   * actually be looked at — a person facing the wrong way is invisible in a
   * pile of people at the left-hand edge.
   */
  .replace(/<g transform="translate\(0 590\)">/g, () => {
    walkerAt += 260;
    return `<g transform="translate(${walkerAt} 590)">`;
  });

/* The convoy starts off the left-hand end, so it is shifted into frame here —
   the animation that normally does that is CSS, and this is a still. */
const streetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="640" viewBox="0 0 ${box[1]} ${box[2]}" preserveAspectRatio="xMinYMid meet">
  <g>${inner.replace('class="mw-traffic"', 'transform="translate(1400 0)"')}</g>
</svg>`;

const streetOut = join(process.cwd(), 'street-traffic.png');

/*
 * And the people on their own, big enough to judge.
 *
 * At street scale a person is forty pixels tall and a nose is three, so
 * "facing the wrong way" and "facing the right way" look identical. This is the
 * only view in which that can be checked, which is the whole reason it exists.
 */
const peopleSvg = (() => {
  const drawn = renderToStaticMarkup(
    <Pedestrians totalWidth={1600} baseline={0} palette={palette} />,
  );
  /*
   * Every person repositioned on an even spacing, walkers and standers alike.
   * The first attempt only moved the ones at x = 0 and framed 480 units of a
   * 900-unit street, so it showed two standers and hid every walker — the
   * exact thing it was built to look at.
   */
  let at = -80;
  const spread = drawn.replace(/<g transform="translate\([-\d.]+ 0\)">/g, () => {
    at += 92;
    return `<g transform="translate(${at} 0)">`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="260" viewBox="0 0 620 104">
    <rect width="620" height="104" fill="#D6D6D0"/>
    <text x="8" y="16" font-family="Verdana, sans-serif" font-size="9" font-weight="700" fill="#1A1A1A">Walkers face the way they go · standers face the shop</text>
    <g transform="translate(0 96)">${spread}</g>
  </svg>`;
})();

const peopleOut = join(process.cwd(), 'people-preview.png');

Promise.all([
  sharp(Buffer.from(svg)).png().toFile(out),
  sharp(Buffer.from(streetSvg)).png().toFile(streetOut),
  sharp(Buffer.from(peopleSvg)).png().toFile(peopleOut),
])
  .then(([a, b, c]) => {
    console.log(`wrote ${out} — ${a.width}x${a.height}`);
    console.log(`wrote ${streetOut} — ${b.width}x${b.height}`);
    console.log(`wrote ${peopleOut} — ${c.width}x${c.height}`);
  })
  .catch((e) => {
    console.error('RASTERISE FAILED:', e.message);
    process.exit(1);
  });

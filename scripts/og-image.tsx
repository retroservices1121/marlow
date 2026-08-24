/**
 * The picture that goes with a link to Marlow.
 *
 * Drawn by the renderer that draws the town, not by hand and not by a model:
 * whatever is in this image is exactly what somebody finds when they follow the
 * link, including the shop names, which are derived from their addresses and so
 * cannot be prettier here than they are there.
 *
 *   npm run og
 *
 * Run when the street's look changes. The result is committed, because a card
 * image is fetched by strangers' servers at unpredictable times and generating
 * it per request would be work done a thousand times for one answer.
 *
 * It lives in `public/` rather than as `app/opengraph-image.png`. Next turns
 * that filename into a route handler, and a route handler runs inside the app —
 * where our middleware matcher skips anything ending in .png, so Clerk found
 * itself invoked without its middleware and the whole thing 500'd. A file in
 * `public/` is just bytes on a URL, which is all a card image ever needed to be.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import Street from '@/components/Street';
import { STREETS, generateLots } from '@/lib/lots';
import type { AdSlot } from '@/lib/ads';

const WIDTH = 1200;
const HEIGHT = 630;

/** How much of the street to show. Enough for variety, not so much it turns to soup. */
const SHOPS = 11;

const main = STREETS.find((s) => s.main);
if (!main) throw new Error('no main street');

const lots = generateLots([{ ...main, count: SHOPS }]);

/*
 * The card shows the town working, not an empty set. Every slot is drawn as
 * vacant on purpose: this picture is what a stranger sees before they know
 * Marlow exists, and "YOUR AD HERE" going past on a truck explains the whole
 * business in a way no sentence on the card could.
 *
 * They are shown vacant rather than carrying real advertisers for a second
 * reason: a card is fetched and cached by strangers' servers for as long as
 * they feel like it, so putting a paying customer's artwork in one would
 * promise them a placement nobody can take back down.
 */
const slots: AdSlot[] = [
  { kind: 'blimp', minBidCents: 2000, bidCents: 0, nextCents: 2000, taken: false, url: null, adUrl: null },
  { kind: 'led', minBidCents: 1000, bidCents: 0, nextCents: 1000, taken: false, url: null, adUrl: null },
  { kind: 'pickup', minBidCents: 500, bidCents: 0, nextCents: 500, taken: false, url: null, adUrl: null },
  { kind: 'van', minBidCents: 300, bidCents: 0, nextCents: 300, taken: false, url: null, adUrl: null },
];

const street = renderToStaticMarkup(<Street lots={lots} timeOfDay="day" ads={slots} />);

// The street draws itself into its own viewBox; lift the numbers back out
// rather than guessing them, so this keeps working when the street changes.
const viewBox = street.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
if (!viewBox) throw new Error('could not read the street viewBox');
const [, w, h] = viewBox;
const streetWidth = Number(w);
const streetHeight = Number(h);

/*
 * Inner markup only: the outer <svg> is replaced by ours.
 *
 * The keyboard focus ring goes with it. On the site a stylesheet keeps it
 * hidden until somebody tabs to a building; in a standalone SVG there is no
 * stylesheet, so every shop came out wrapped in a dashed box like a building
 * site. Nothing but rendering it and looking would have caught that.
 */
const inner = street
  .replace(/^<svg[^>]*>/, '')
  .replace(/<\/svg>$/, '')
  // Both closing forms: React renders SVG elements as <rect ...></rect>, not
  // self-closing, which is why the first attempt at this silently did nothing.
  .replace(/<rect[^>]*class="mw-focus-ring"[^>]*>(<\/rect>)?/g, '')
  /*
   * The convoy and the blimp are driven across the street by CSS, and a
   * standalone SVG has no stylesheet — so both would sit off the left-hand end
   * where they start, out of frame. Placed by hand here, and only here: the
   * live street still animates.
   */
  /*
   * Proportions of the street, not fixed numbers, so both stay where they were
   * put if the shop count ever changes.
   *
   * Both are pushed right, away from the two things in the left of the frame:
   * the words at the top, which the blimp flew straight behind on the first
   * attempt with only its gondola showing underneath, and the marlow.lol badge
   * at the bottom, which swallowed the van whole on the second.
   */
  .replace('class="mw-traffic"', `transform="translate(${streetWidth * 0.85} 0)"`)
  .replace('class="mw-blimp"', `transform="translate(${streetWidth * 0.62} 0)"`);

if (/mw-focus-ring/.test(inner)) throw new Error('focus rings survived the strip');
if (/mw-traffic|mw-blimp/.test(inner)) throw new Error('traffic was not placed');

/*
 * Sized so the shops fill the width and stand on the bottom edge. The sky above
 * is where the words go, which is why the street is anchored down rather than
 * centred.
 */
const scale = WIDTH / streetWidth;
const drawnHeight = streetHeight * scale;
const top = HEIGHT - drawnHeight;

/*
 * The words sit on a panel, not straight on the sky.
 *
 * Laid over the drawing they collided with whichever roofline happened to be
 * tallest, and a card is read at thumbnail size where anything overlapping is
 * simply lost. The panel is the same cream-and-ink the site uses for every
 * other box, so it belongs in the picture rather than sitting on top of it.
 */
const FONT = 'Verdana, DejaVu Sans, Arial, sans-serif';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#7EC8E3"/>
  <g transform="translate(0 ${top}) scale(${scale})">${inner}</g>

  <g transform="translate(56 46)">
    <rect width="640" height="196" rx="2" fill="#FDF6E8" stroke="#1A1A1A" stroke-width="5"/>
    <text x="34" y="86" font-family="${FONT}" font-size="66" font-weight="700" fill="#1A1A1A" letter-spacing="1">MARLOW</text>
    <text x="36" y="128" font-family="${FONT}" font-size="25" fill="#4A4A45">Own a virtual storefront.</text>
    <text x="36" y="164" font-family="${FONT}" font-size="25" fill="#4A4A45">1,000 addresses. From $15.</text>
  </g>

  <g transform="translate(56 ${HEIGHT - 78})">
    <rect width="232" height="52" rx="2" fill="#F5CE3E" stroke="#1A1A1A" stroke-width="5"/>
    <text x="24" y="35" font-family="${FONT}" font-size="27" font-weight="700" fill="#1A1A1A">marlow.lol</text>
  </g>
</svg>`;

const out = join(process.cwd(), 'public', 'card.png');
sharp(Buffer.from(svg))
  .png()
  .toFile(out)
  .then((info) => {
    console.log(`wrote ${out} — ${info.width}x${info.height}, ${info.size} bytes`);
  })
  .catch((e) => {
    // Also keep the SVG when rasterising fails, so the failure can be looked at.
    writeFileSync(join(process.cwd(), 'og-debug.svg'), svg);
    console.error('RASTERISE FAILED:', e.message, '— wrote og-debug.svg');
    process.exit(1);
  });

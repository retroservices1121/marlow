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

const WIDTH = 1200;
const HEIGHT = 630;

/** How much of the street to show. Enough for variety, not so much it turns to soup. */
const SHOPS = 11;

const main = STREETS.find((s) => s.main);
if (!main) throw new Error('no main street');

const lots = generateLots([{ ...main, count: SHOPS }]);
const street = renderToStaticMarkup(<Street lots={lots} timeOfDay="day" />);

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
  .replace(/<rect[^>]*class="mw-focus-ring"[^>]*>(<\/rect>)?/g, '');

if (/mw-focus-ring/.test(inner)) throw new Error('focus rings survived the strip');

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

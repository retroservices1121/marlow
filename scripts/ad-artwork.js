/**
 * Draws a piece of ad artwork and writes it out as a PNG.
 *
 *   node scripts/ad-artwork.js
 *
 * Exists because the town needs to be able to make an ad occasionally without
 * one — a courtesy for somebody who sent traffic our way, or a house ad on a
 * slot nobody has bought. Drawn to the panel's own proportions so nothing is
 * cropped: the panel fills its space with `slice`, so artwork of the wrong
 * shape loses its edges rather than letterboxing.
 */
const { join } = require('path');
const sharp = require('sharp');

/** The blimp's panel is 210 x 68 in street units. This is that, at four times. */
const WIDTH = 840;
const HEIGHT = 272;

const INK = '#1A1A1A';
const YELLOW = '#F5CE3E';
const CREAM = '#FFF6E5';
const FONT = 'Verdana, DejaVu Sans, Arial, sans-serif';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${YELLOW}"/>
  <rect x="16" y="16" width="${WIDTH - 32}" height="${HEIGHT - 32}" fill="${CREAM}" stroke="${INK}" stroke-width="9"/>
  <g font-family="${FONT}" fill="${INK}" text-anchor="middle">
    <text x="${WIDTH / 2}" y="84" font-size="42" font-weight="700" letter-spacing="6">THANK YOU</text>
    <text x="${WIDTH / 2}" y="176" font-size="94" font-weight="700" letter-spacing="-1">OUTBID.LOL</text>
    <text x="${WIDTH / 2}" y="228" font-size="36" font-weight="400" letter-spacing="3">FOR THE PROMO</text>
  </g>
</svg>`;

const out = join(process.cwd(), 'ad-blimp-thanks.png');
sharp(Buffer.from(svg))
  .png()
  .toFile(out)
  .then((info) => console.log(`wrote ${out} — ${info.width}x${info.height}, ${info.size} bytes`))
  .catch((e) => {
    console.error('RASTERISE FAILED:', e.message);
    process.exit(1);
  });

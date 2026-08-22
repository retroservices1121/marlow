/**
 * The street scene.
 *
 * Owns the single root `<svg>` for the whole town: 120 buildings, one element
 * tree, no per-building `<svg>`, no filters, and exactly one animated group
 * (the clouds). Buildings share walls — each starts where the previous ended.
 */

import { subRandom } from '@/lib/hash';
import type { Lot } from '@/lib/lots';
import {
  LAMP_GLOW,
  TIME_PALETTES,
  applyTimeTint,
  mixHex,
  shade,
  skyBands,
  type TimeOfDay,
} from '@/lib/palette';
import Building, { DEFAULT_BASELINE, buildingTotalHeight, deriveGeometry } from './Building';
import {
  Cloud,
  Crossing,
  FURNITURE,
  FURNITURE_KINDS,
  INK,
  Star,
  StreetSign,
  streetSignWidth,
} from './parts';

export const BASELINE = DEFAULT_BASELINE;
export const SIDEWALK_HEIGHT = 56;
export const VIEW_HEIGHT = 720;
/** Empty run of sidewalk before the first and after the last building. */
export const STREET_MARGIN = 48;
/**
 * Gap where one block ends and the next begins. Buildings still share walls
 * within a block — the spec's rule — but a town whose streets are priced
 * differently has to show where one street stops and another starts.
 */
export const INTERSECTION_WIDTH = 210;
/** Pavement that wraps past the end building before the kerb turns the corner. */
const PAVEMENT_RETURN = 30;

const CURB_Y = BASELINE + SIDEWALK_HEIGHT;
/** Furniture stands part-way across the sidewalk, in front of the facades. */
const FURNITURE_BASELINE = BASELINE + 30;

/** One cloud per this many units of street, and the same for stars. */
const CLOUD_SPACING = 900;
const STAR_FIELD_WIDTH = 1600;

export type StreetProps = {
  lots: Lot[];
  timeOfDay: TimeOfDay;
  /** Optional label rendered above the scene by the caller, not here. */
  className?: string;
  /** Turns each building into a link. Omit for a plain, non-interactive street. */
  hrefForLot?: (lot: Lot) => string;
};

type Placement = {
  lot: Lot;
  x: number;
  width: number;
};

/** One street's continuous run of buildings. */
type Block = {
  street: string;
  x: number;
  width: number;
  /** Pavement extent, which overhangs the buildings before the kerb returns. */
  pavementFrom: number;
  pavementTo: number;
};

type FurniturePlacement = {
  key: string;
  kind: keyof typeof FURNITURE;
  x: number;
};

/**
 * Cumulative x positions. Walls are shared inside a block; blocks are separated
 * by an intersection.
 */
function layout(lots: Lot[]): {
  placements: Placement[];
  blocks: Block[];
  totalWidth: number;
  skyline: number;
} {
  let cursor = STREET_MARGIN;
  let skyline = 0;
  const placements: Placement[] = [];
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const lot of lots) {
    if (current && lot.street !== current.street) {
      current.width = cursor - current.x;
      blocks.push(current);
      cursor += INTERSECTION_WIDTH;
      current = null;
    }
    if (!current) {
      current = { street: lot.street, x: cursor, width: 0, pavementFrom: 0, pavementTo: 0 };
    }

    const geo = deriveGeometry(lot.address, lot.buildingType);
    placements.push({ lot, x: cursor, width: geo.width });
    cursor += geo.width;
    skyline = Math.max(skyline, buildingTotalHeight(geo));
  }

  if (current) {
    current.width = cursor - current.x;
    blocks.push(current);
  }

  const totalWidth = cursor + STREET_MARGIN;
  blocks.forEach((block, i) => {
    block.pavementFrom = i === 0 ? 0 : block.x - PAVEMENT_RETURN;
    block.pavementTo = i === blocks.length - 1 ? totalWidth : block.x + block.width + PAVEMENT_RETURN;
  });

  return { placements, blocks, totalWidth, skyline };
}

/**
 * Furniture lands every 3rd to 5th building. Both the spacing and the choice
 * of piece come from the street name, so a street's furniture is as stable as
 * its buildings.
 */
function placeFurniture(placements: Placement[]): FurniturePlacement[] {
  const out: FurniturePlacement[] = [];
  const cursors = new Map<string, { rng: ReturnType<typeof subRandom>; next: number; seen: number }>();

  for (const { lot, x, width } of placements) {
    let state = cursors.get(lot.street);
    if (!state) {
      const rng = subRandom(lot.street, 'furniture');
      state = { rng, next: rng.int(2, 4), seen: 0 };
      cursors.set(lot.street, state);
    }
    if (state.seen === state.next) {
      out.push({
        key: `${lot.address}-furniture`,
        kind: state.rng.pick(FURNITURE_KINDS),
        // Sit on the shared wall between this building and the next.
        x: x + width,
      });
      state.next = state.seen + state.rng.int(3, 5);
    }
    state.seen += 1;
  }

  return out;
}

export default function Street({ lots, timeOfDay, className, hrefForLot }: StreetProps) {
  const palette = TIME_PALETTES[timeOfDay];
  const stroke = palette.stroke;
  const { placements, blocks, totalWidth } = layout(lots);
  const furniture = placeFurniture(placements);
  const night = timeOfDay === 'night';

  /* Sky decoration, seeded on the town rather than any one address. */
  const skyRng = subRandom('marlow', 'sky');
  const cloudCount = Math.max(3, Math.round(totalWidth / CLOUD_SPACING));
  const clouds = Array.from({ length: cloudCount }, (_, i) => ({
    x: (totalWidth / cloudCount) * i + skyRng.range(0, 90),
    y: skyRng.range(70, 240),
    scale: skyRng.range(0.75, 1.5),
  }));

  const starRng = subRandom('marlow', 'stars');
  // `stars` is a per-screen density; a 19,000-unit street needs proportionally more.
  const starCount = palette.stars > 0 ? Math.round((palette.stars * totalWidth) / STAR_FIELD_WIDTH) : 0;
  const stars = Array.from({ length: starCount }, () => ({
    x: starRng.range(0, totalWidth),
    y: starRng.range(10, BASELINE - 200),
    size: starRng.range(1.4, 3.2),
  }));

  const roadMark = mixHex(palette.road, '#FFFFFF', night ? 0.35 : 0.55);
  /* Light pooling on the pavement under a lamp — never a cone over the shops. */
  const lampGlow = mixHex(palette.sidewalk, LAMP_GLOW, 0.6);
  /* One wash shared by every dressing fill in the scene. */
  const wash = (hex: string) => applyTimeTint(hex, palette);
  const curbFace = shade(palette.sidewalk, 0.18);

  return (
    <svg
      className={['mw-street', className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${totalWidth} ${VIEW_HEIGHT}`}
      preserveAspectRatio="xMinYMid meet"
      /*
       * An explicit ratio alongside the CSS height is what makes `width: auto`
       * resolve to the full street width in every browser. Without it some
       * engines fall back to 100% of the container and squash 120 buildings
       * into the viewport instead of letting them scroll.
       */
      style={{ aspectRatio: `${totalWidth} / ${VIEW_HEIGHT}` }}
      role="group"
      aria-label={`Marlow street scene, ${lots.length} lots, ${timeOfDay}`}
      shapeRendering="geometricPrecision"
    >
      {/* Sky */}
      <rect x={0} y={0} width={totalWidth} height={VIEW_HEIGHT} fill={palette.sky} />
      {skyBands(palette).map((band, i) => (
        <rect key={i} x={0} y={0} width={totalWidth} height={90 + i * 62} fill={band} />
      ))}

      {stars.map((star, i) => (
        <Star key={i} x={star.x} y={star.y} size={star.size} />
      ))}

      {/* The one animated group in the scene. */}
      <g
        className="mw-clouds"
        style={{ ['--mw-drift' as string]: `${-totalWidth}px` }}
      >
        {clouds.map((cloud, i) => (
          <Cloud key={i} x={cloud.x} y={cloud.y} scale={cloud.scale} fill={palette.cloud} stroke={stroke} />
        ))}
        {clouds.map((cloud, i) => (
          <Cloud
            key={`wrap-${i}`}
            x={cloud.x + totalWidth}
            y={cloud.y}
            scale={cloud.scale}
            fill={palette.cloud}
            stroke={stroke}
          />
        ))}
      </g>

      {/* Road, then sidewalk on top of it */}
      <rect x={0} y={CURB_Y} width={totalWidth} height={VIEW_HEIGHT - CURB_Y} fill={palette.road} />
      {Array.from({ length: Math.ceil(totalWidth / 160) }, (_, i) => (
        <rect
          key={i}
          x={i * 160 + 40}
          y={CURB_Y + (VIEW_HEIGHT - CURB_Y) * 0.55}
          width={72}
          height={7}
          fill={roadMark}
        />
      ))}

      {/* Side streets running away between the blocks */}
      {blocks.slice(0, -1).map((block, i) => {
        const from = block.pavementTo;
        const to = blocks[i + 1].pavementFrom;
        return (
          <Crossing
            key={`crossing-${block.street}`}
            x={from}
            width={to - from}
            baseline={BASELINE}
            curbY={CURB_Y}
            road={palette.road}
            stroke={stroke}
          />
        );
      })}

      {/* Pavement, one run per block, with the kerb returning at each corner */}
      {blocks.map((block) => {
        const width = block.pavementTo - block.pavementFrom;
        return (
          <g key={`pavement-${block.street}`}>
            <rect
              x={block.pavementFrom}
              y={BASELINE}
              width={width}
              height={SIDEWALK_HEIGHT}
              fill={palette.sidewalk}
            />
            <rect x={block.pavementFrom} y={CURB_Y - 9} width={width} height={9} fill={curbFace} />
            <line
              x1={block.pavementFrom}
              y1={BASELINE}
              x2={block.pavementTo}
              y2={BASELINE}
              stroke={stroke}
              {...INK}
            />
            <line
              x1={block.pavementFrom}
              y1={CURB_Y}
              x2={block.pavementTo}
              y2={CURB_Y}
              stroke={stroke}
              {...INK}
            />
            {/* Kerb returns — the vertical edges that make a corner a corner */}
            <line
              x1={block.pavementFrom}
              y1={BASELINE}
              x2={block.pavementFrom}
              y2={CURB_Y}
              stroke={stroke}
              {...INK}
            />
            <line
              x1={block.pavementTo}
              y1={BASELINE}
              x2={block.pavementTo}
              y2={CURB_Y}
              stroke={stroke}
              {...INK}
            />
          </g>
        );
      })}

      {/* Buildings */}
      {placements.map(({ lot, x }) => (
        <Building
          key={lot.id}
          address={lot.address}
          number={lot.number}
          street={lot.street}
          status={lot.status}
          buildingType={lot.buildingType}
          facadeColor={lot.facadeColor}
          accentColor={lot.accentColor}
          signText={lot.signText}
          timeOfDay={timeOfDay}
          x={x}
          baseline={BASELINE}
          href={hrefForLot?.(lot)}
        />
      ))}

      {/* A sign on each corner, so a block's identity is visible */}
      {blocks.map((block) => {
        // Signs sit on the near corner of their block. The first block starts at
        // the very edge of the scene, so the plate is nudged in far enough to
        // stay whole rather than being clipped by the viewBox.
        const half = streetSignWidth(block.street) / 2;
        const x = Math.max(block.pavementFrom + 26, half + 10);
        return (
          <StreetSign
            key={`sign-${block.street}`}
            x={x}
            baseline={FURNITURE_BASELINE}
            name={block.street}
            stroke={stroke}
            wash={wash}
          />
        );
      })}

      {/* Furniture sits in front of the facades, on the sidewalk */}
      {furniture.map((piece) => {
        const Piece = FURNITURE[piece.kind];
        return (
          <Piece
            key={piece.key}
            x={piece.x}
            baseline={FURNITURE_BASELINE}
            stroke={stroke}
            night={night}
            wash={wash}
            glow={lampGlow}
          />
        );
      })}
    </svg>
  );
}

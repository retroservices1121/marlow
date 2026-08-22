/**
 * One street, drawn as a side elevation.
 *
 * The town used to be a single row of all 120 buildings, which made the side
 * streets a fiction: they were more blocks in the same line, and the openings
 * between them led nowhere. A street is now a place. Main Street has junctions
 * along it you can turn into; each side street runs from its junction to a
 * dead end.
 *
 * Owns the single root `<svg>` for the street. Buildings share walls — each one
 * starts where the previous ended, no gaps — and the pavement is interrupted
 * only where another street meets this one.
 */

import { subRandom } from '@/lib/hash';
import { junctionsOn, parentStreet, streetByName, type Lot, type StreetDef } from '@/lib/lots';
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

export type Opening = {
  /** Lot index this opening follows. -1 puts it before the first building. */
  afterIndex: number;
  /** The street it leads to. */
  to: StreetDef;
  /** Label on the sign standing in the gap. */
  label: string;
};

export type StreetProps = {
  lots: Lot[];
  timeOfDay: TimeOfDay;
  /** Optional label rendered above the scene by the caller, not here. */
  className?: string;
  /** Turns each building into a link. Omit for a plain, non-interactive street. */
  hrefForLot?: (lot: Lot) => string;
  /** Address someone was linked directly to, pinned so it stands out. */
  highlightAddress?: string | null;
  /** Logo for that one building, if its store has one. */
  highlightLogoUrl?: string | null;
  /** Where a turning leads. Without this the openings are decoration. */
  hrefForStreet?: (street: StreetDef) => string;
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

type PlacedOpening = Opening & {
  from: number;
  until: number;
  /** Block this gap follows. -1 when the street opens with it. */
  afterBlock: number;
};

/**
 * Cumulative x positions. Walls are shared along the street; the pavement is
 * interrupted only where another street meets this one.
 */
function layout(
  lots: Lot[],
  openings: Opening[],
): {
  placements: Placement[];
  blocks: Block[];
  gaps: PlacedOpening[];
  totalWidth: number;
  skyline: number;
} {
  const streetName = lots[0]?.street ?? '';
  let cursor = STREET_MARGIN;
  let skyline = 0;
  const placements: Placement[] = [];
  const blocks: Block[] = [];
  const gaps: PlacedOpening[] = [];
  let current: Block | null = null;

  const openBefore = new Map(openings.map((o) => [o.afterIndex + 1, o]));

  // A plain loop rather than forEach: TypeScript cannot follow a mutable
  // variable reassigned inside a closure, and narrows `current` to never.
  for (let index = 0; index < lots.length; index++) {
    const lot = lots[index];
    const opening = openBefore.get(index);
    if (opening) {
      if (current) {
        current.width = cursor - current.x;
        blocks.push(current);
        current = null;
      }
      gaps.push({
        ...opening,
        from: cursor,
        until: cursor + INTERSECTION_WIDTH,
        afterBlock: blocks.length - 1,
      });
      cursor += INTERSECTION_WIDTH;
    }
    if (!current) {
      current = { street: streetName, x: cursor, width: 0, pavementFrom: 0, pavementTo: 0 };
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

  /*
   * A side street opens with its junction back to Main Street, so a gap can sit
   * before the first building as well as between two. Pavement runs to the edge
   * of the scene only where no gap interrupts it.
   */
  const opensWithGap = gaps.some((gap) => gap.afterBlock === -1);
  const endsWithGap = gaps.some((gap) => gap.afterBlock === blocks.length - 1);

  blocks.forEach((block, i) => {
    block.pavementFrom = i === 0 && !opensWithGap ? 0 : block.x - PAVEMENT_RETURN;
    block.pavementTo =
      i === blocks.length - 1 && !endsWithGap ? totalWidth : block.x + block.width + PAVEMENT_RETURN;
  });

  // A gap's clear road runs between whatever pavement bounds it.
  gaps.forEach((gap) => {
    gap.from = gap.afterBlock >= 0 ? blocks[gap.afterBlock].pavementTo : 0;
    gap.until = blocks[gap.afterBlock + 1]?.pavementFrom ?? totalWidth;
  });

  return { placements, blocks, gaps, totalWidth, skyline };
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

export default function Street({
  lots,
  timeOfDay,
  className,
  hrefForLot,
  highlightAddress,
  highlightLogoUrl,
  hrefForStreet,
}: StreetProps) {
  const palette = TIME_PALETTES[timeOfDay];
  const stroke = palette.stroke;

  // Turnings come from the street's own definition, so a street knows what it
  // connects to without the caller having to describe the town.
  const street = streetByName(lots[0]?.street ?? '');
  const parent = street ? parentStreet(street) : undefined;
  const openings: Opening[] = !street
    ? []
    : street.main
      ? junctionsOn(street).map((j) => ({
          afterIndex: j.afterIndex,
          to: j.street,
          label: j.street.name,
        }))
      : parent
        ? [{ afterIndex: -1, to: parent, label: parent.name }]
        : [];

  const { placements, blocks, gaps, totalWidth } = layout(lots, openings);
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

      {/* Turnings: the street each opening leads to */}
      {gaps.map((gap) => (
        <Crossing
          key={`crossing-${gap.to.slug}`}
          x={gap.from}
          width={gap.until - gap.from}
          baseline={BASELINE}
          curbY={CURB_Y}
          road={palette.road}
          stroke={stroke}
          sky={palette.sky}
          seed={gap.to.slug}
        />
      ))}

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
          highlighted={lot.address === highlightAddress}
          logoUrl={lot.address === highlightAddress ? highlightLogoUrl : null}
        />
      ))}

      {/* This street's own name, on the first corner of its own pavement —
          not at the edge of the scene, where a side street's junction sign
          already stands and the two would sit on top of each other. */}
      {street && blocks.length > 0 && (
        <StreetSign
          x={Math.max(
            blocks[0].pavementFrom + 26,
            streetSignWidth(street.name) / 2 + 10,
          )}
          baseline={FURNITURE_BASELINE}
          name={street.name}
          stroke={stroke}
          wash={wash}
        />
      )}

      {/* Each turning, signed and walkable */}
      {gaps.map((gap) => {
        // On the near corner rather than mid-road: that is where a street sign
        // stands, and it leaves the view down the turning unobstructed.
        const post = gap.from + Math.max(34, streetSignWidth(gap.label) / 2 + 8);
        const sign = (
          <StreetSign
            x={post}
            baseline={FURNITURE_BASELINE}
            name={gap.label}
            stroke={stroke}
            wash={wash}
          />
        );
        const href = hrefForStreet?.(gap.to);
        if (!href) return <g key={`turn-${gap.to.slug}`}>{sign}</g>;
        return (
          <a
            key={`turn-${gap.to.slug}`}
            className="mw-turning"
            href={href}
            aria-label={`Turn into ${gap.label}`}
            data-turning={gap.to.slug}
          >
            {/* An invisible target over the whole opening, so the turning is the
                gap itself rather than just the signpost. */}
            <rect
              x={gap.from}
              y={BASELINE - 150}
              width={gap.until - gap.from}
              height={CURB_Y - BASELINE + 150}
              fill="transparent"
            />
            {sign}
          </a>
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

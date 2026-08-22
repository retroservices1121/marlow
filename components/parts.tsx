/**
 * Drawing primitives.
 *
 * Every shape here is flat-filled and outlined with the same uniform stroke.
 * No gradients, no shadows, no filters, no opacity tricks — the only variable
 * is colour. Parts draw in local coordinates and are positioned by the caller.
 */

import type { ReactNode } from 'react';
import { seededRandom } from '@/lib/hash';
import {
  CORNER_RADIUS,
  HOARDING,
  LIT_WINDOW,
  STROKE_WIDTH,
  inkOn,
  mixHex,
  shade,
  tint,
} from '@/lib/palette';

/** Uniform line style, applied to every drawn shape without exception. */
export const INK = {
  strokeWidth: STROKE_WIDTH,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
};

export const SIGN_FONT = "Fredoka, 'Trebuchet MS', 'Segoe UI', sans-serif";

/* ====================================================================== */
/* Roofs                                                                  */
/* ====================================================================== */

export type RoofProps = {
  width: number;
  /** Facade fill, already time-tinted. */
  color: string;
  accent: string;
  stroke: string;
};

/**
 * A roof definition owns both its silhouette and how much headroom it needs.
 * `Building.tsx` only ever reads `ROOFS[type]`, so a fifth roof is a new entry
 * in this record and nothing else.
 */
export type RoofDef = {
  height: (width: number) => number;
  render: (props: RoofProps) => ReactNode;
};

/** Overhang past the facade edge, so roofs read as caps rather than lids. */
const EAVE = 7;

export const ROOFS: Record<string, RoofDef> = {
  flat: {
    height: () => 18,
    render: ({ width, color, stroke }) => (
      <rect
        x={-EAVE}
        y={-18}
        width={width + EAVE * 2}
        height={18}
        rx={CORNER_RADIUS}
        fill={shade(color, 0.2)}
        stroke={stroke}
        {...INK}
      />
    ),
  },

  pitched: {
    height: (width) => Math.min(78, Math.round(width * 0.44)),
    render: ({ width, color, stroke }) => {
      const h = ROOFS.pitched.height(width);
      return (
        <polygon
          points={`${-EAVE},0 ${width / 2},${-h} ${width + EAVE},0`}
          fill={shade(color, 0.26)}
          stroke={stroke}
          {...INK}
        />
      );
    },
  },

  stepped: {
    height: () => 38,
    render: ({ width, color, stroke }) => {
      const inset = width * 0.24;
      return (
        <>
          <rect
            x={inset}
            y={-38}
            width={width - inset * 2}
            height={24}
            fill={shade(color, 0.3)}
            stroke={stroke}
            {...INK}
          />
          <rect
            x={-EAVE}
            y={-16}
            width={width + EAVE * 2}
            height={16}
            fill={shade(color, 0.2)}
            stroke={stroke}
            {...INK}
          />
        </>
      );
    },
  },

  curved: {
    height: () => 42,
    render: ({ width, color, stroke }) => (
      // The quadratic control sits above the apex; the drawn arc peaks near 42.
      <path
        d={`M ${-EAVE} 0 Q ${width / 2} ${-84} ${width + EAVE} 0 Z`}
        fill={shade(color, 0.24)}
        stroke={stroke}
        {...INK}
      />
    ),
  },
};

/** Derived roof choice picks from here, so new entries join the rotation. */
export const ROOF_TYPES: readonly string[] = Object.keys(ROOFS);

export function Roof({ type, ...props }: RoofProps & { type: string }) {
  const def = ROOFS[type] ?? ROOFS.flat;
  return <>{def.render(props)}</>;
}

export function roofHeight(type: string, width: number): number {
  const def = ROOFS[type] ?? ROOFS.flat;
  return def.height(width);
}

/* ====================================================================== */
/* Awning                                                                 */
/* ====================================================================== */

export type AwningProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  stripes: number;
  accent: string;
  stroke: string;
};

/** Striped trapezoid. Stripes are polygons, not a pattern fill. */
export function Awning({ x, y, width, height, stripes, accent, stroke }: AwningProps) {
  const flare = 9;
  const light = tint(accent, 0.72);
  const bands: ReactNode[] = [];

  for (let i = 0; i < stripes; i++) {
    const t0 = i / stripes;
    const t1 = (i + 1) / stripes;
    const topLeft = t0 * width;
    const topRight = t1 * width;
    const bottomLeft = -flare + t0 * (width + flare * 2);
    const bottomRight = -flare + t1 * (width + flare * 2);
    bands.push(
      <polygon
        key={i}
        points={`${topLeft},0 ${topRight},0 ${bottomRight},${height} ${bottomLeft},${height}`}
        fill={i % 2 === 0 ? accent : light}
        stroke="none"
      />,
    );
  }

  return (
    <g transform={`translate(${x} ${y})`}>
      {bands}
      <polygon
        points={`0,0 ${width},0 ${width + flare},${height} ${-flare},${height}`}
        fill="none"
        stroke={stroke}
        {...INK}
      />
    </g>
  );
}

/* ====================================================================== */
/* Windows and doors                                                      */
/* ====================================================================== */

export type WindowProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  lit: boolean;
  glass: string;
  frame: string;
  stroke: string;
  /** Draw the muntin cross. Small windows skip it. */
  muntins?: boolean;
};

export function Window({
  x,
  y,
  width,
  height,
  lit,
  glass,
  frame,
  stroke,
  muntins = true,
}: WindowProps) {
  const showMuntins = muntins && width > 22 && height > 26;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width={width}
        height={height}
        rx={CORNER_RADIUS}
        fill={lit ? LIT_WINDOW : glass}
        stroke={stroke}
        {...INK}
      />
      {showMuntins && (
        <>
          <line x1={width / 2} y1={0} x2={width / 2} y2={height} stroke={stroke} {...INK} />
          <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={stroke} {...INK} />
        </>
      )}
      <rect x={-4} y={height} width={width + 8} height={6} fill={frame} stroke={stroke} {...INK} />
    </g>
  );
}

export type ShopWindowProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  lit: boolean;
  glass: string;
  frame: string;
  stroke: string;
};

/** The big ground-floor pane, with a mullion and a sill. */
export function ShopWindow({ x, y, width, height, lit, glass, frame, stroke }: ShopWindowProps) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width={width}
        height={height}
        rx={CORNER_RADIUS}
        fill={lit ? LIT_WINDOW : glass}
        stroke={stroke}
        {...INK}
      />
      <line x1={width / 2} y1={0} x2={width / 2} y2={height} stroke={stroke} {...INK} />
      <rect x={-5} y={height} width={width + 10} height={9} fill={frame} stroke={stroke} {...INK} />
    </g>
  );
}

export type DoorProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  accent: string;
  stroke: string;
};

export function Door({ x, y, width, height, accent, stroke }: DoorProps) {
  const transom = Math.min(20, height * 0.16);
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={width} height={height} rx={CORNER_RADIUS} fill={accent} stroke={stroke} {...INK} />
      <line x1={0} y1={transom} x2={width} y2={transom} stroke={stroke} {...INK} />
      <circle cx={width - 10} cy={height * 0.58} r={3.4} fill="none" stroke={stroke} {...INK} />
      <rect
        x={-5}
        y={height - 7}
        width={width + 10}
        height={7}
        fill={shade(accent, 0.25)}
        stroke={stroke}
        {...INK}
      />
    </g>
  );
}

/* ====================================================================== */
/* Signage                                                                */
/* ====================================================================== */

export type SignProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  board: string;
  stroke: string;
};

const SIGN_MAX_SIZE = 30;
const SIGN_MIN_SIZE = 9;
/** Fredoka 600 average advance, including the letter-spacing applied below. */
const GLYPH_ADVANCE = 0.68;

/**
 * Auto-shrink to fit: font size is computed from the character count rather
 * than measured, so the server and the browser agree exactly.
 */
export function fitSignFontSize(text: string, boardWidth: number, boardHeight: number): number {
  const chars = Math.max(text.length, 1);
  const byWidth = (boardWidth * 0.88) / (chars * GLYPH_ADVANCE);
  const byHeight = boardHeight * 0.56;
  return Math.max(SIGN_MIN_SIZE, Math.min(SIGN_MAX_SIZE, byWidth, byHeight));
}

export function Sign({ x, y, width, height, text, board, stroke }: SignProps) {
  const fontSize = fitSignFontSize(text, width, height);
  // A long name on a narrow board bottoms out at the minimum size. `textLength`
  // is the backstop that keeps it on the board — and it also absorbs any drift
  // between the estimated advance width above and the real Fredoka metrics.
  const available = width * 0.88;
  const natural = text.length * fontSize * GLYPH_ADVANCE;
  const constrain = natural > available;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={width} height={height} rx={CORNER_RADIUS} fill={board} stroke={stroke} {...INK} />
      <text
        x={width / 2}
        y={height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={SIGN_FONT}
        fontWeight={600}
        fontSize={fontSize}
        letterSpacing={fontSize * 0.06}
        textLength={constrain ? available : undefined}
        lengthAdjust={constrain ? 'spacingAndGlyphs' : undefined}
        fill={inkOn(board)}
        stroke="none"
      >
        {text}
      </text>
    </g>
  );
}

/** House-number plate, mounted on the door. */
export function NumberPlate({
  x,
  y,
  number,
  fill,
  stroke,
}: {
  x: number;
  y: number;
  number: number;
  fill: string;
  stroke: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={34} height={20} rx={CORNER_RADIUS} fill={fill} stroke={stroke} {...INK} />
      <text
        x={17}
        y={10.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={SIGN_FONT}
        fontWeight={600}
        fontSize={12}
        fill={inkOn(fill)}
        stroke="none"
      >
        {number}
      </text>
    </g>
  );
}

/* ====================================================================== */
/* Vacant state                                                           */
/* ====================================================================== */

export type HoardingProps = {
  /** Address-derived clip id — never random, so SSR and the client match. */
  clipId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
};

/** Diagonal-plank hoarding. Planks are clipped, not faded. */
export function Hoarding({ clipId, x, y, width, height, stroke }: HoardingProps) {
  const planks: ReactNode[] = [];
  const step = 26;
  for (let offset = -height; offset < width + height; offset += step) {
    planks.push(
      <line
        key={offset}
        x1={offset}
        y1={height}
        x2={offset + height}
        y2={0}
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="butt"
      />,
    );
  }

  return (
    <g transform={`translate(${x} ${y})`}>
      <defs>
        <clipPath id={clipId}>
          <rect width={width} height={height} />
        </clipPath>
      </defs>
      <rect width={width} height={height} fill={HOARDING} stroke="none" />
      <g clipPath={`url(#${clipId})`}>{planks}</g>
      <rect width={width} height={height} fill="none" stroke={stroke} {...INK} />
      <line x1={0} y1={height * 0.26} x2={width} y2={height * 0.26} stroke={stroke} {...INK} />
    </g>
  );
}

export function ForSalePlacard({
  x,
  y,
  fill,
  stroke,
}: {
  x: number;
  y: number;
  fill: string;
  stroke: string;
}) {
  const w = 84;
  const h = 34;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx={CORNER_RADIUS} fill={fill} stroke={stroke} {...INK} />
      <text
        x={w / 2}
        y={h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={SIGN_FONT}
        fontWeight={600}
        fontSize={13}
        letterSpacing={1}
        fill={inkOn(fill)}
        stroke="none"
      >
        FOR SALE
      </text>
    </g>
  );
}

/* ====================================================================== */
/* Street furniture                                                       */
/* ====================================================================== */

export type FurnitureProps = {
  x: number;
  /** Sidewalk line the piece stands on. */
  baseline: number;
  stroke: string;
  /** Night adds a flat glow polygon under lamps. */
  night: boolean;
  /** Applies the current time-of-day wash to a flat fill. */
  wash: (hex: string) => string;
  /** Flat colour for the pool of light a lamp casts at night. */
  glow: string;
};

export function Lamppost({ x, baseline, stroke, night, wash, glow }: FurnitureProps) {
  const height = 108;
  return (
    <g transform={`translate(${x} ${baseline})`}>
      {/*
        * A pool on the pavement, not a cone. A cone from the lamp head covers
        * the shopfront behind it, since furniture draws in front of the facades.
        */}
      {night && <polygon points="-44,12 44,12 27,-11 -27,-11" fill={glow} stroke="none" />}
      <rect x={-4} y={-height} width={8} height={height} fill={wash("#4A4F58")} stroke={stroke} {...INK} />
      <rect x={-13} y={-4} width={26} height={8} rx={2} fill={wash("#4A4F58")} stroke={stroke} {...INK} />
      <polygon
        points={`0,${-height - 22} 15,${-height} -15,${-height}`}
        fill={night ? LIT_WINDOW : '#E7E2D3'}
        stroke={stroke}
        {...INK}
      />
    </g>
  );
}

export function Hydrant({ x, baseline, stroke, wash }: FurnitureProps) {
  return (
    <g transform={`translate(${x} ${baseline})`}>
      <rect x={-11} y={-30} width={22} height={30} rx={3} fill={wash("#E8544B")} stroke={stroke} {...INK} />
      <rect x={-16} y={-24} width={32} height={7} fill={wash("#E8544B")} stroke={stroke} {...INK} />
      <rect x={-8} y={-38} width={16} height={9} rx={3} fill={wash("#E8544B")} stroke={stroke} {...INK} />
      <rect x={-15} y={-4} width={30} height={6} fill={wash("#C1443C")} stroke={stroke} {...INK} />
    </g>
  );
}

export function Bench({ x, baseline, stroke, wash }: FurnitureProps) {
  return (
    <g transform={`translate(${x} ${baseline})`}>
      <rect x={-34} y={-40} width={68} height={9} fill={wash("#8C6E4F")} stroke={stroke} {...INK} />
      <rect x={-34} y={-22} width={68} height={9} fill={wash("#8C6E4F")} stroke={stroke} {...INK} />
      <rect x={-30} y={-22} width={7} height={22} fill={wash("#6E5540")} stroke={stroke} {...INK} />
      <rect x={23} y={-22} width={7} height={22} fill={wash("#6E5540")} stroke={stroke} {...INK} />
    </g>
  );
}

export function Tree({ x, baseline, stroke, wash }: FurnitureProps) {
  return (
    <g transform={`translate(${x} ${baseline})`}>
      <rect x={-6} y={-58} width={12} height={58} fill={wash("#8C6E4F")} stroke={stroke} {...INK} />
      <polygon points="0,-132 32,-74 -32,-74" fill={wash("#5A6E5A")} stroke={stroke} {...INK} />
      <polygon points="0,-108 38,-50 -38,-50" fill={wash("#6C8259")} stroke={stroke} {...INK} />
    </g>
  );
}

export function Mailbox({ x, baseline, stroke, wash }: FurnitureProps) {
  return (
    <g transform={`translate(${x} ${baseline})`}>
      <rect x={-6} y={-30} width={12} height={30} fill={wash("#3F5C77")} stroke={stroke} {...INK} />
      <path
        d="M -18 -30 L -18 -52 A 18 18 0 0 1 18 -52 L 18 -30 Z"
        fill={wash("#4A90C4")}
        stroke={stroke}
        {...INK}
      />
      <line x1={-11} y1={-44} x2={11} y2={-44} stroke={stroke} {...INK} />
    </g>
  );
}

export const FURNITURE = {
  lamppost: Lamppost,
  hydrant: Hydrant,
  bench: Bench,
  tree: Tree,
  mailbox: Mailbox,
} as const;

export type FurnitureKind = keyof typeof FURNITURE;
export const FURNITURE_KINDS = Object.keys(FURNITURE) as FurnitureKind[];

/* ====================================================================== */
/* Sky                                                                    */
/* ====================================================================== */

export function Cloud({
  x,
  y,
  scale,
  fill,
  stroke,
}: {
  x: number;
  y: number;
  scale: number;
  fill: string;
  stroke: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M 0 0 A 26 26 0 0 1 46 -14 A 30 30 0 0 1 100 -6 A 22 22 0 0 1 118 0 Z"
        fill={fill}
        stroke={stroke}
        {...INK}
      />
    </g>
  );
}

export function Star({ x, y, size }: { x: number; y: number; size: number }) {
  return <circle cx={x} cy={y} r={size} fill="#F2EFE0" stroke="none" />;
}

/* ====================================================================== */
/* Street identity                                                        */
/* ====================================================================== */

export type StreetSignProps = {
  x: number;
  /** Sidewalk line the post stands on. */
  baseline: number;
  name: string;
  stroke: string;
  wash: (hex: string) => string;
};

/**
 * A corner street sign. This is what makes a block's identity — and therefore
 * its price — visible; without it Main Street and a side street are the same
 * row of buildings.
 */
/** Plate width for a street name, so callers can keep it inside the scene. */
export function streetSignWidth(name: string): number {
  return Math.max(96, name.length * 9.4);
}

export function StreetSign({ x, baseline, name, stroke, wash }: StreetSignProps) {
  const height = 96;
  const plateWidth = streetSignWidth(name);
  const plateHeight = 26;
  const plate = wash('#3F5C77');

  return (
    <g transform={`translate(${x} ${baseline})`}>
      <rect x={-4} y={-height} width={8} height={height} fill={wash('#4A4F58')} stroke={stroke} {...INK} />
      <rect x={-13} y={-5} width={26} height={9} rx={2} fill={wash('#4A4F58')} stroke={stroke} {...INK} />
      <g transform={`translate(${-plateWidth / 2} ${-height - plateHeight + 8})`}>
        <rect
          width={plateWidth}
          height={plateHeight}
          rx={CORNER_RADIUS}
          fill={plate}
          stroke={stroke}
          {...INK}
        />
        <text
          x={plateWidth / 2}
          y={plateHeight / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={SIGN_FONT}
          fontWeight={600}
          fontSize={13}
          letterSpacing={0.8}
          fill={inkOn(plate)}
          stroke="none"
        >
          {name.toUpperCase()}
        </text>
      </g>
    </g>
  );
}

export type CrossingProps = {
  /** Clear opening between two blocks. */
  x: number;
  width: number;
  baseline: number;
  curbY: number;
  road: string;
  stroke: string;
  /** Sky, which the far end of the street fades toward. */
  sky: string;
  /** Stable seed so the distant rooftops never shuffle between renders. */
  seed: string;
};

/**
 * The side street running away between two blocks.
 *
 * A flat elevation cannot show depth with perspective, so the receding road is
 * a plain tapered polygon and the buildings along it are small silhouettes
 * washed toward the sky — flat fills throughout, no gradients. Without them the
 * opening reads as a missing building rather than somewhere you can go.
 */
export function Crossing({ x, width, baseline, curbY, road, stroke, sky, seed }: CrossingProps) {
  const depth = 88;
  const taper = Math.min(38, width * 0.28);
  const horizon = baseline - depth;
  const rng = seededRandom(`${seed}#crossing`);

  /*
   * The far end of the street: one low terrace across the back of the opening,
   * washed toward the sky so it sits behind everything. Earlier this was three
   * rows of buildings at different depths, which in a gap this narrow read as a
   * cluster of towers floating in a slot rather than a street going away.
   */
  const backFill = mixHex('#6E7A85', sky, 0.5);
  const terraceHeight = 46;
  const terraceTop = horizon - terraceHeight;
  const terraceFrom = taper * 0.5;
  const terraceWidth = width - taper;

  const roofs: ReactNode[] = [];
  const roofCount = 3;
  for (let i = 0; i < roofCount; i++) {
    const segment = terraceWidth / roofCount;
    const left = terraceFrom + segment * i;
    const peak = 10 + rng.range(0, 9);
    roofs.push(
      <polygon
        key={i}
        points={`${left},${terraceTop} ${left + segment / 2},${terraceTop - peak} ${left + segment},${terraceTop}`}
        fill={shade(backFill, 0.14)}
        stroke={stroke}
        {...INK}
      />,
    );
  }

  return (
    <g transform={`translate(${x} 0)`}>
      {/* Ground plane of the crossing, where the pavement would otherwise run */}
      <rect x={0} y={baseline} width={width} height={curbY - baseline} fill={road} />
      {roofs}
      <rect
        x={terraceFrom}
        y={terraceTop}
        width={terraceWidth}
        height={terraceHeight}
        fill={backFill}
        stroke={stroke}
        {...INK}
      />
      {/* The street receding out of view */}
      <polygon
        points={`0,${baseline} ${width},${baseline} ${width - taper},${horizon} ${taper},${horizon}`}
        fill={shade(road, 0.16)}
        stroke={stroke}
        {...INK}
      />
    </g>
  );
}

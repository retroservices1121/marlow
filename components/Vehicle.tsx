/**
 * The three vehicles that carry advertising through Marlow.
 *
 * Drawn to the town's rules — one stroke width, flat fills, no gradients — so a
 * truck belongs on the street rather than sitting on it like a sticker.
 *
 * Each is drawn at its own true size rather than one shape scaled three ways.
 * Scaling would thin the outline on the smaller vehicles, and a uniform 3.5
 * stroke is the single rule this whole town is drawn by; a van with a finer
 * line than the shop behind it stops looking like it is in the same place.
 *
 * They are deliberately different sizes, and deliberately small. Different,
 * because three identical rectangles at three prices is not a choice anybody
 * can see the reason for — truck, then pickup, then van, and their ad panels
 * fall in the same order so the price ladder is visible before it is read.
 * Small, because the street only gives 104 units between the curb and the
 * bottom of the frame, and anything filling that slides across the shopfronts
 * people are paying for.
 *
 * All three face right. A convoy arguing about direction reads as a mistake.
 *
 * Nothing about the artwork is ours, so it is clipped to its panel and can
 * never paint outside it.
 */

import { CORNER_RADIUS, STROKE_WIDTH } from '@/lib/palette';

export type VehicleKind = 'led' | 'pickup' | 'van';

export type VehicleProps = {
  kind: VehicleKind;
  /** The winning ad's artwork, served from our own origin. */
  adUrl?: string | null;
  /** Shown when nobody holds the slot. */
  vacantText?: string;
  /** Body colour. Flat, from the town's palette. */
  body: string;
  stroke: string;
  /** Unique per rendered vehicle: two clip paths with one id clip nothing. */
  id: string;
};

const INK = { strokeWidth: STROKE_WIDTH, strokeLinejoin: 'round' as const };

/**
 * How much road each one takes, nose to tail, standing on y = 0.
 *
 * Exported because the street has to know how far apart to space them and how
 * far to drive them before they are off the end.
 */
export const VEHICLE_SIZE: Record<VehicleKind, { width: number; height: number }> = {
  led: { width: 250, height: 82 },
  pickup: { width: 196, height: 64 },
  van: { width: 158, height: 50 },
};

const GLASS = '#CFE9F2';
const TYRE = '#2B2B2B';

function Wheel({ cx, r }: { cx: number; r: number }) {
  return (
    <>
      <circle cx={cx} cy={-r} r={r} fill={TYRE} stroke="#1A1A1A" {...INK} />
      <circle cx={cx} cy={-r} r={r * 0.34} fill="#D9CBB3" stroke="#1A1A1A" strokeWidth={2.5} />
    </>
  );
}

/**
 * The advertiser's panel.
 *
 * Filled with their artwork when somebody holds the slot, and with an
 * invitation when nobody does — an empty white rectangle driving past reads as
 * a fault rather than an opportunity.
 */
function AdPanel({
  x,
  y,
  w,
  h,
  adUrl,
  vacantText,
  stroke,
  id,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  adUrl?: string | null;
  vacantText?: string;
  stroke: string;
  id: string;
}) {
  const label = vacantText ?? 'YOUR AD HERE';
  return (
    <>
      <defs>
        <clipPath id={id}>
          <rect x={x} y={y} width={w} height={h} rx={CORNER_RADIUS} />
        </clipPath>
      </defs>

      <rect x={x} y={y} width={w} height={h} rx={CORNER_RADIUS} fill="#FFF6E5" />

      {adUrl ? (
        <image
          href={adUrl}
          x={x}
          y={y}
          width={w}
          height={h}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${id})`}
        />
      ) : (
        <text
          x={x + w / 2}
          y={y + h / 2 + Math.min(5, h * 0.17)}
          textAnchor="middle"
          fontSize={Math.min(15, h * 0.44)}
          fontWeight={600}
          fill="#6B6B64"
          /* Squeezed to fit rather than allowed off the side of the van. */
          textLength={w - 12}
          lengthAdjust="spacingAndGlyphs"
        >
          {label}
        </text>
      )}

      <rect x={x} y={y} width={w} height={h} rx={CORNER_RADIUS} fill="none" stroke={stroke} {...INK} />
    </>
  );
}

export default function Vehicle({ kind, adUrl, vacantText, body, stroke, id }: VehicleProps) {
  if (kind === 'led') {
    /*
     * A flatbed carrying a screen — the biggest panel in the town, riding at
     * the back with the cab leading, which is the right way round for
     * something driving away from you.
     */
    return (
      <g>
        <rect x={0} y={-24} width={250} height={13} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
        <rect x={192} y={-62} width={58} height={38} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
        <rect x={208} y={-57} width={32} height={18} rx={CORNER_RADIUS} fill={GLASS} stroke={stroke} strokeWidth={2.5} />
        <rect x={4} y={-82} width={182} height={60} rx={CORNER_RADIUS} fill="#1A1A1A" stroke={stroke} {...INK} />
        <AdPanel x={12} y={-75} w={166} h={46} adUrl={adUrl} vacantText={vacantText} stroke={stroke} id={id} />
        <Wheel cx={40} r={12} />
        <Wheel cx={126} r={12} />
        <Wheel cx={216} r={12} />
      </g>
    );
  }

  if (kind === 'pickup') {
    /* A working truck, second of the three: bed at the back, cab in front. */
    return (
      <g>
        <rect x={0} y={-28} width={196} height={14} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
        <rect x={0} y={-56} width={114} height={30} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
        <rect x={112} y={-64} width={54} height={38} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
        <rect x={121} y={-58} width={28} height={16} rx={CORNER_RADIUS} fill={GLASS} stroke={stroke} strokeWidth={2.5} />
        <rect x={166} y={-46} width={30} height={20} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
        <AdPanel x={8} y={-51} w={100} h={24} adUrl={adUrl} vacantText={vacantText} stroke={stroke} id={id} />
        <Wheel cx={32} r={13} />
        <Wheel cx={152} r={13} />
      </g>
    );
  }

  /*
   * A small panel van, least of the three. Its side is one flat surface, so its
   * panel is kept deliberately short of the pickup's — otherwise the smallest
   * vehicle would carry the second-biggest advertisement and the price ladder
   * would stop making sense to anybody looking at it.
   */
  return (
    <g>
      <rect x={0} y={-50} width={122} height={39} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
      <rect x={122} y={-34} width={36} height={23} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
      <rect x={130} y={-30} width={20} height={11} rx={CORNER_RADIUS} fill={GLASS} stroke={stroke} strokeWidth={2.5} />
      <AdPanel x={8} y={-42} w={96} h={20} adUrl={adUrl} vacantText={vacantText} stroke={stroke} id={id} />
      <Wheel cx={28} r={9} />
      <Wheel cx={132} r={9} />
    </g>
  );
}

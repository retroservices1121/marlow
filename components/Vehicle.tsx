/**
 * The three vehicles that carry advertising through Marlow.
 *
 * Drawn to the town's rules — one stroke width, flat fills, no gradients — so a
 * truck belongs on the street rather than sitting on it like a sticker.
 *
 * All three face right, because they all drive the same way and a convoy
 * arguing about direction reads as a mistake. All three fit inside the road:
 * the street gives 104 units between the curb and the bottom of the frame, and
 * a vehicle taller than that slides across the shopfronts people are paying
 * for. The ad being legible matters; the shops staying visible matters more,
 * and the vehicle moves — its panel is read over a few seconds, not at a
 * glance.
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

/** Every vehicle is drawn in this box, standing on y = 0, nose to the right. */
export const VEHICLE_WIDTH = 300;
export const VEHICLE_HEIGHT = 100;

const WHEEL_R = 14;
const GLASS = '#CFE9F2';
const TYRE = '#2B2B2B';

function Wheel({ cx }: { cx: number }) {
  return (
    <>
      <circle cx={cx} cy={-WHEEL_R} r={WHEEL_R} fill={TYRE} stroke="#1A1A1A" {...INK} />
      <circle cx={cx} cy={-WHEEL_R} r={WHEEL_R * 0.36} fill="#D9CBB3" stroke="#1A1A1A" strokeWidth={2.5} />
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
          y={y + h / 2 + Math.min(6, h * 0.16)}
          textAnchor="middle"
          fontSize={Math.min(17, h * 0.42)}
          fontWeight={600}
          fill="#6B6B64"
          /* A long invitation is squeezed rather than allowed off the side. */
          textLength={label.length > 13 ? w - 16 : undefined}
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
     * A flatbed carrying a screen. The screen rides at the back and the cab
     * leads, so the biggest panel in the town is the last thing you see going
     * past rather than the first — which is the right way round for something
     * driving away from you.
     */
    return (
      <g>
        {/* Chassis */}
        <rect x={0} y={-26} width={300} height={16} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
        {/* Cab, leading */}
        <rect x={228} y={-74} width={72} height={48} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
        <rect x={252} y={-68} width={40} height={22} rx={CORNER_RADIUS} fill={GLASS} stroke={stroke} strokeWidth={2.5} />
        {/* The screen and its housing */}
        <rect x={6} y={-96} width={214} height={72} rx={CORNER_RADIUS} fill="#1A1A1A" stroke={stroke} {...INK} />
        <AdPanel x={16} y={-88} w={194} h={56} adUrl={adUrl} vacantText={vacantText} stroke={stroke} id={id} />
        <Wheel cx={48} />
        <Wheel cx={150} />
        <Wheel cx={258} />
      </g>
    );
  }

  if (kind === 'pickup') {
    /* A working truck: bed at the back carrying the panel, cab in front. */
    return (
      <g>
        <rect x={0} y={-30} width={300} height={18} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
        {/* Bed side, which is what the ad is painted on */}
        <rect x={0} y={-72} width={172} height={46} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
        {/* Cab */}
        <rect x={168} y={-84} width={92} height={54} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
        <rect x={182} y={-78} width={40} height={24} rx={CORNER_RADIUS} fill={GLASS} stroke={stroke} strokeWidth={2.5} />
        {/* Bonnet */}
        <rect x={260} y={-58} width={40} height={28} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
        <AdPanel x={10} y={-66} w={152} h={34} adUrl={adUrl} vacantText={vacantText} stroke={stroke} id={id} />
        <Wheel cx={44} />
        <Wheel cx={232} />
      </g>
    );
  }

  /* A panel van: one flat side, wrapped end to end. */
  return (
    <g>
      <rect x={0} y={-88} width={236} height={76} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
      <rect x={236} y={-62} width={64} height={50} rx={CORNER_RADIUS} fill={body} stroke={stroke} {...INK} />
      <rect x={250} y={-56} width={38} height={22} rx={CORNER_RADIUS} fill={GLASS} stroke={stroke} strokeWidth={2.5} />
      <rect x={0} y={-14} width={300} height={6} rx={CORNER_RADIUS} fill={body} stroke={stroke} strokeWidth={2.5} />
      <AdPanel x={14} y={-80} w={208} h={54} adUrl={adUrl} vacantText={vacantText} stroke={stroke} id={id} />
      <Wheel cx={52} />
      <Wheel cx={252} />
    </g>
  );
}

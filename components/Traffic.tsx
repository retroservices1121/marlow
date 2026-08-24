/**
 * The convoy: three vehicles driving the length of the street, carrying ads.
 *
 * The truck leads and the other two trail behind it in their own lanes, near to
 * far, so the road has depth rather than three shapes in a line. Drawn last, so
 * they pass in front of the curb the way something on the road actually would.
 *
 * One animation for the whole convoy rather than three. They travel together at
 * one speed, which keeps them from ever overtaking or overlapping each other —
 * and three independent animations of slightly different lengths would drift
 * into a pile-up within a minute of anybody leaving the tab open.
 *
 * The distance is the street's own width, so the convoy leaves at one end and
 * arrives at the other whatever street it is on, and the duration is derived
 * from that distance so a long street is not crossed at a sprint.
 *
 * Nothing moves for anybody who has asked for less motion. A vehicle sliding
 * across the page forever is exactly what that setting exists to stop, and the
 * ads are still there, still legible, still clickable — parked.
 */

import Vehicle, { VEHICLE_SIZE, type VehicleKind } from './Vehicle';
import type { AdSlot } from '@/lib/ads';
import { formatPrice } from '@/lib/pricing';
import { CORNER_RADIUS, STROKE_WIDTH } from '@/lib/palette';
import { applyTimeTint, type TimePalette } from '@/lib/palette';

/** Body colours, from the town's own palette. */
const BODY: Record<VehicleKind, string> = {
  blimp: '#A868A8',
  led: '#E8544B',
  pickup: '#4FA382',
  van: '#4A90C4',
};

/**
 * Where each one rides, as a distance up from the bottom of the frame and a
 * distance back along the road from the leader.
 *
 * The truck is nearest and in front; the van is furthest away and furthest
 * back, which is also why it is smallest.
 */
const LANE: Record<Exclude<VehicleKind, 'blimp'>, { up: number; back: number }> = {
  led: { up: 4, back: 0 },
  pickup: { up: 30, back: 430 },
  van: { up: 52, back: 800 },
};

/** The three that use the road. The blimp is not one of them. */
const ROAD: Exclude<VehicleKind, 'blimp'>[] = ['van', 'pickup', 'led'];

/**
 * Where the underside of the blimp's gondola sits, from the top of the frame.
 *
 * Up among the clouds, which is the point of it. The first attempt put this at
 * 168 and then added the blimp's own height on top, which flew it at 300 —
 * level with the upper floors of the tall buildings, reading less as an
 * airship than as something that had gone badly wrong. Measured to the same
 * edge every other vehicle stands on, so there is no offset to get backwards.
 */
const BLIMP_BASELINE = 195;

/** The blimp crosses the town in its own time, slower than anything driving. */
const BLIMP_SPEED = 92;

/** Units of road per second. Walking pace for something the size of a town. */
const SPEED = 240;

/** How far behind the last vehicle the convoy starts, so it enters cleanly. */
const RUN_UP = 1100;

/**
 * A tag over a vehicle, inviting somebody to take it off its rider.
 *
 * Only over vehicles that are actually taken. An empty one already says YOUR
 * AD HERE across its whole side, and hanging "outbid me" over nobody would be
 * asking people to compete with an empty seat.
 *
 * It carries the number, because "outbid me" without a price is a dare and
 * "outbid me for $11" is an offer. Sits in the band above the road and below
 * the shopfronts, where the only thing it can cross is a lamppost.
 */
function OutbidTag({
  cents,
  stroke,
  width,
  top,
}: {
  cents: number;
  stroke: string;
  width: number;
  top: number;
}) {
  const label = `OUTBID ME · ${formatPrice(cents)}`;
  const w = 148;
  const h = 26;
  const x = width / 2 - w / 2;
  const y = top - h - 12;

  return (
    <g className="mw-outbid">
      <rect x={x} y={y} width={w} height={h} rx={CORNER_RADIUS} fill="#F5CE3E" stroke={stroke} strokeWidth={STROKE_WIDTH} />
      {/* A pointer, so the tag belongs to the vehicle under it. */}
      <polygon
        points={`${width / 2 - 7},${y + h} ${width / 2 + 7},${y + h} ${width / 2},${y + h + 9}`}
        fill="#F5CE3E"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
      />
      <text
        x={width / 2}
        y={y + h / 2 + 5}
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
        fill="#1A1A1A"
        textLength={w - 16}
        lengthAdjust="spacingAndGlyphs"
      >
        {label}
      </text>
    </g>
  );
}

export default function Traffic({
  slots,
  totalWidth,
  viewHeight,
  palette,
}: {
  slots: AdSlot[];
  totalWidth: number;
  viewHeight: number;
  palette: TimePalette;
}) {
  const distance = totalWidth + RUN_UP + 400;
  const seconds = Math.round(distance / SPEED);

  const blimp = slots.find((s) => s.kind === 'blimp');
  const blimpSize = VEHICLE_SIZE.blimp;
  const blimpDistance = totalWidth + blimpSize.width + 600;

  return (
    <>
      {/*
        * The blimp first, so it is behind everything — it is the furthest away
        * thing in the picture and has to pass behind the rooflines, not over
        * them. Its own group and its own animation, because it does not travel
        * with the convoy and would look tethered to it if it did.
        */}
      {blimp && (
        <g
          className="mw-blimp"
          style={
            {
              '--mw-drive-from': -blimpSize.width - 200,
              '--mw-drive-to': totalWidth + 300,
              '--mw-drive-secs': `${Math.round(blimpDistance / BLIMP_SPEED)}s`,
            } as React.CSSProperties
          }
        >
          <g transform={`translate(0 ${BLIMP_BASELINE})`}>
            {blimp.url ? (
              <a href={blimp.url} target="_blank" rel="nofollow noopener noreferrer">
                <Vehicle
                  kind="blimp"
                  adUrl={blimp.adUrl}
                  body={applyTimeTint(BODY.blimp, palette)}
                  stroke={palette.stroke}
                  id="ad-blimp"
                />
              </a>
            ) : (
              <a href="/ads">
                <Vehicle
                  kind="blimp"
                  adUrl={blimp.adUrl}
                  body={applyTimeTint(BODY.blimp, palette)}
                  stroke={palette.stroke}
                  id="ad-blimp"
                />
              </a>
            )}
            {blimp.taken && (
              <a href="/ads">
                <OutbidTag
                  cents={blimp.nextCents}
                  stroke={palette.stroke}
                  width={blimpSize.width}
                  top={-blimpSize.height}
                />
              </a>
            )}
          </g>
        </g>
      )}

    <g
      className="mw-traffic"
      style={
        {
          '--mw-drive-from': -RUN_UP,
          '--mw-drive-to': totalWidth + 400,
          '--mw-drive-secs': `${seconds}s`,
        } as React.CSSProperties
      }
    >
      {ROAD.map((kind) => {
        const slot = slots.find((s) => s.kind === kind);
        const lane = LANE[kind];
        const size = VEHICLE_SIZE[kind];
        const baseline = viewHeight - lane.up;

        const drawn = (
          <Vehicle
            kind={kind}
            adUrl={slot?.adUrl ?? null}
            body={applyTimeTint(BODY[kind], palette)}
            stroke={palette.stroke}
            id={`ad-${kind}`}
          />
        );

        return (
          <g key={kind} transform={`translate(${-lane.back - size.width} ${baseline})`}>
            {slot?.url ? (
              /*
               * Advertiser-supplied and this page is public, so nofollow to keep
               * the town from becoming an SEO farm, and noopener so the
               * destination learns nothing about where the click came from.
               */
              <a href={slot.url} target="_blank" rel="nofollow noopener noreferrer">
                {drawn}
              </a>
            ) : (
              // An empty panel is itself the advertisement for the empty panel.
              <a href="/ads">{drawn}</a>
            )}

            {/*
              * The tag is a sibling of the vehicle, never inside it: the
              * vehicle leads to the advertiser and the tag leads to the
              * auction, and a link inside a link is neither.
              */}
            {slot?.taken && (
              <a href="/ads">
                <OutbidTag
                  cents={slot.nextCents}
                  stroke={palette.stroke}
                  width={size.width}
                  top={-size.height}
                />
              </a>
            )}
          </g>
        );
      })}
    </g>
    </>
  );
}

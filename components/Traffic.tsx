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
import { applyTimeTint, type TimePalette } from '@/lib/palette';

/** Body colours, from the town's own palette. */
const BODY: Record<VehicleKind, string> = {
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
const LANE: Record<VehicleKind, { up: number; back: number }> = {
  led: { up: 4, back: 0 },
  pickup: { up: 30, back: 430 },
  van: { up: 52, back: 800 },
};

/** Units of road per second. Walking pace for something the size of a town. */
const SPEED = 240;

/** How far behind the last vehicle the convoy starts, so it enters cleanly. */
const RUN_UP = 1100;

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

  // Furthest lane first, so the nearest vehicle passes in front of the others.
  const order: VehicleKind[] = ['van', 'pickup', 'led'];

  return (
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
      {order.map((kind) => {
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
          </g>
        );
      })}
    </g>
  );
}

/**
 * One building on its own, drawn by the same renderer the street uses.
 *
 * A storefront page should show the actual building, not a description of it —
 * so this is `Building` in its own viewBox, sized from its own geometry, with a
 * strip of sky and pavement so it is standing somewhere rather than floating.
 */

import Building, { DEFAULT_BASELINE, buildingTotalHeight, deriveGeometry } from './Building';
import type { BuildingType, Status } from '@/lib/lots';
import { STROKE_WIDTH, TIME_PALETTES, type TimeOfDay } from '@/lib/palette';

export type BuildingPortraitProps = {
  address: string;
  number: number;
  street: string;
  status: Status;
  buildingType: BuildingType;
  facadeColor: string;
  accentColor: string;
  signText: string;
  timeOfDay?: TimeOfDay;
  className?: string;
};

const PAD = 40;

export default function BuildingPortrait({
  timeOfDay = 'day',
  className,
  ...lot
}: BuildingPortraitProps) {
  const geo = deriveGeometry(lot.address, lot.buildingType);
  const palette = TIME_PALETTES[timeOfDay];
  const totalHeight = buildingTotalHeight(geo);
  const top = DEFAULT_BASELINE - totalHeight - PAD;
  const left = -PAD;
  const width = geo.width + PAD * 2;
  const height = totalHeight + PAD * 2;

  return (
    <svg
      viewBox={`${left} ${top} ${width} ${height}`}
      className={['mw-portrait', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={`${lot.signText || lot.address}, ${lot.number} ${lot.street}`}
    >
      <rect x={left} y={top} width={width} height={height} fill={palette.sky} />
      <rect x={left} y={DEFAULT_BASELINE} width={width} height={PAD} fill={palette.sidewalk} />
      <line
        x1={left}
        y1={DEFAULT_BASELINE}
        x2={left + width}
        y2={DEFAULT_BASELINE}
        stroke={palette.stroke}
        strokeWidth={STROKE_WIDTH}
      />
      <Building {...lot} timeOfDay={timeOfDay} x={0} />
    </svg>
  );
}

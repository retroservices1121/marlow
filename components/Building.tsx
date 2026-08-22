/**
 * The building renderer.
 *
 * Everything about a building's *shape* is derived from `address` and nothing
 * else — not from status, not from colour, not from array position, not from
 * the clock. Everything about its *look* comes from props. Keeping those two
 * sets apart is what stops the town rearranging itself on reload.
 *
 * Returns a `<g>`. `Street.tsx` owns the only root `<svg>`.
 */

import { subRandom } from '@/lib/hash';
import type { BuildingType, Status } from '@/lib/lots';
import {
  CORNER_RADIUS,
  STROKE_WIDTH,
  TIME_PALETTES,
  VACANT_SHELL,
  applyTimeTint,
  inkOn,
  shade,
  tint,
  type TimeOfDay,
} from '@/lib/palette';
import {
  Awning,
  Door,
  ForSalePlacard,
  Hoarding,
  INK,
  NumberPlate,
  ROOF_TYPES,
  Roof,
  ShopWindow,
  Sign,
  Window,
  roofHeight,
} from './parts';

export type BuildingProps = {
  /** "108 Main Street" — the seed for all derived geometry. */
  address: string;
  number: number;
  street: string;
  status: Status;
  buildingType: BuildingType;
  /** Hex from the curated palette. */
  facadeColor: string;
  /** Hex from the curated palette. */
  accentColor: string;
  /** Shop name, uppercase, max 18 chars. */
  signText: string;
  timeOfDay: TimeOfDay;
  /** Left edge position on the street. */
  x: number;
  /** Shared baseline every building on the street stands on. */
  baseline?: number;
  /**
   * Optional destination. With one the building becomes a real link, which
   * carries keyboard activation for free; without one it stays a focusable
   * figure, exactly as the renderer spec describes it.
   */
  href?: string;
  /** Marks this building out when someone has been linked straight to it. */
  highlighted?: boolean;
  /**
   * The store's logo, shown on the marker of a highlighted building only.
   *
   * The town is otherwise pure vector — 120 inline logos would be megabytes of
   * base64 on every street render, and illegible at street scale besides. One
   * image, for the one building you were pointed at, is affordable.
   */
  logoUrl?: string | null;
};

/* ---- Derived geometry -------------------------------------------------- */

type Range = readonly [number, number];

const WIDTHS: Record<BuildingType, Range> = {
  storefront: [120, 200],
  tower: [100, 140],
  warehouse: [120, 200],
  civic: [200, 260],
};

const HEIGHTS: Record<BuildingType, Range> = {
  storefront: [180, 280],
  tower: [300, 420],
  warehouse: [160, 200],
  civic: [260, 320],
};

/** Height of the ground floor — sign band, awning, door and glazing. */
const GROUND_FLOOR: Record<BuildingType, number> = {
  storefront: 168,
  tower: 132,
  warehouse: 118,
  civic: 176,
};

/** Vertical pitch of an upper storey, and the window inside it. */
const FLOOR_HEIGHT = 62;
const WINDOW_HEIGHT = 40;
const SIDE_MARGIN = 20;
const WINDOW_GAP = 16;
const MIN_WINDOW_WIDTH = 22;

/** The ground floor runs closer to the party walls than the upper storeys. */
const GROUND_MARGIN = 14;
/** Wall left between the door frame and the neighbouring pane. */
const DOOR_REVEAL = 8;
const MIN_PANE_WIDTH = 40;
const MIN_PANE_HEIGHT = 30;

const SIGN_HEIGHT = 36;
const AWNING_HEIGHT = 26;

export const DEFAULT_BASELINE = 560;

export type Geometry = {
  width: number;
  height: number;
  roofType: string;
  roofHeight: number;
  hasAwning: boolean;
  awningStripes: number;
  windowCols: number;
  windowRows: number;
  windowCount: number;
  /** Which upper windows are lit when the palette says `partial`. */
  litMask: readonly boolean[];
  doorX: number;
  doorWidth: number;
  wonk: number;
  groundFloor: number;
  signWidth: number;
};

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Pure function of (address, buildingType). Called by both `Building` and
 * `Street` — Street needs the widths to lay out shared walls before anything
 * is drawn.
 */
export function deriveGeometry(address: string, buildingType: BuildingType): Geometry {
  const [wMin, wMax] = WIDTHS[buildingType];
  const [hMin, hMax] = HEIGHTS[buildingType];

  // Snap to whole units so the cumulative street x positions stay exact.
  const width = roundTo(subRandom(address, 'width').range(wMin, wMax), 2);
  const height = roundTo(subRandom(address, 'height').range(hMin, hMax), 2);

  const roofType = subRandom(address, 'roof').pick(ROOF_TYPES);

  const awningRng = subRandom(address, 'awning');
  const hasAwning = buildingType === 'storefront' && awningRng.chance(0.62);
  const awningStripes = awningRng.int(5, 9);

  const groundFloor = Math.min(GROUND_FLOOR[buildingType], height - 12);
  const upperHeight = height - groundFloor;

  const gridRng = subRandom(address, 'windows');
  const maxCols = Math.max(
    2,
    Math.floor((width - SIDE_MARGIN * 2 + WINDOW_GAP) / (MIN_WINDOW_WIDTH + WINDOW_GAP)),
  );
  const windowCols = gridRng.int(2, Math.min(4, maxCols));
  let windowRows = Math.floor(upperHeight / FLOOR_HEIGHT);
  // Keep a little sky between the top row and the roofline.
  if (windowRows > 0 && upperHeight - (windowRows * FLOOR_HEIGHT - (FLOOR_HEIGHT - WINDOW_HEIGHT)) < 16) {
    windowRows -= 1;
  }
  const windowCount = windowCols * windowRows;

  const litRng = subRandom(address, 'lit');
  const litMask = Array.from({ length: windowCount }, () => litRng.chance(0.5));

  const doorWidth =
    buildingType === 'warehouse'
      ? Math.min(96, width * 0.38)
      : Math.min(64, Math.max(44, width * 0.24));
  const doorTravel = Math.max(0, width - GROUND_MARGIN * 2 - doorWidth);
  const doorOffset = subRandom(address, 'door').range(0, 1);
  // Civic doors stay near the middle. Everything else eases toward one party
  // wall, which leaves a single wide bay for glazing instead of two useless
  // slivers either side.
  const doorBias =
    buildingType === 'civic'
      ? 0.4 + doorOffset * 0.2
      : doorOffset * doorOffset * (3 - 2 * doorOffset);
  const doorX = GROUND_MARGIN + doorTravel * doorBias;

  const wonk = subRandom(address, 'wonk').range(-1.2, 1.2);

  const signWidth = width * subRandom(address, 'sign').range(0.6, 0.8);

  return {
    width,
    height,
    roofType,
    roofHeight: roofHeight(roofType, width),
    hasAwning,
    awningStripes,
    windowCols,
    windowRows,
    windowCount,
    litMask,
    doorX,
    doorWidth,
    wonk,
    groundFloor,
    signWidth,
  };
}

/** Total headroom a building needs above the baseline, roof included. */
export function buildingTotalHeight(geo: Geometry): number {
  return geo.height + geo.roofHeight;
}

/* ---- Renderer ---------------------------------------------------------- */

export default function Building({
  address,
  number,
  street,
  status,
  buildingType,
  facadeColor,
  accentColor,
  signText,
  timeOfDay,
  x,
  baseline = DEFAULT_BASELINE,
  href,
  highlighted = false,
  logoUrl = null,
}: BuildingProps) {
  const geo = deriveGeometry(address, buildingType);
  const palette = TIME_PALETTES[timeOfDay];
  const stroke = palette.stroke;
  const vacant = status === 'vacant';

  const { width: W, height: H, groundFloor: GF } = geo;

  // Fills. Shape never changes with the clock; only these do.
  const facade = vacant ? applyTimeTint(VACANT_SHELL, palette) : applyTimeTint(facadeColor, palette);
  const accent = applyTimeTint(accentColor, palette);
  const trim = shade(facade, 0.16);
  /* Paper-white signage stock, washed by the clock like every other fill. */
  const plate = applyTimeTint('#F4EFE4', palette);

  const litUpper = (index: number): boolean => {
    if (vacant) return false;
    if (palette.windowsLit === 'all') return true;
    if (palette.windowsLit === 'partial') return geo.litMask[index] ?? false;
    return false;
  };
  const groundLit = !vacant && palette.windowsLit !== 'none';

  /* Ground-floor bands, measured as heights above the baseline. */
  const signTop = GF - 6;
  const signBottom = signTop - SIGN_HEIGHT;
  const awningTop = signBottom - 8;
  const awningBottom = awningTop - AWNING_HEIGHT;
  const openTop = geo.hasAwning ? awningBottom - 10 : signBottom - 14;

  /* Upper window grid. */
  const upperHeight = H - GF;
  const blockHeight = geo.windowRows * FLOOR_HEIGHT - (FLOOR_HEIGHT - WINDOW_HEIGHT);
  const gridPad = geo.windowRows > 0 ? (upperHeight - blockHeight) / 2 : 0;
  const windowWidth =
    (W - SIDE_MARGIN * 2 - WINDOW_GAP * (geo.windowCols - 1)) / geo.windowCols;

  const upperWindows: React.ReactNode[] = [];
  if (!vacant) {
    for (let row = 0; row < geo.windowRows; row++) {
      const top = H - gridPad - row * FLOOR_HEIGHT;
      for (let col = 0; col < geo.windowCols; col++) {
        const index = row * geo.windowCols + col;
        upperWindows.push(
          <Window
            key={index}
            x={SIDE_MARGIN + col * (windowWidth + WINDOW_GAP)}
            y={-top}
            width={windowWidth}
            height={WINDOW_HEIGHT}
            lit={litUpper(index)}
            glass={palette.glass}
            frame={trim}
            stroke={stroke}
          />,
        );
      }
    }
  }

  /* Shop glazing either side of the door. */
  const shopPanes: React.ReactNode[] = [];
  if (!vacant && buildingType !== 'civic') {
    const sillHeight = 26;
    const paneHeight = openTop - sillHeight;
    const bays: Array<[number, number]> = [
      [GROUND_MARGIN, geo.doorX - DOOR_REVEAL],
      [geo.doorX + geo.doorWidth + DOOR_REVEAL, W - GROUND_MARGIN],
    ];
    bays.forEach(([from, to], i) => {
      const paneWidth = to - from;
      if (paneWidth < MIN_PANE_WIDTH || paneHeight < MIN_PANE_HEIGHT) return;
      shopPanes.push(
        <ShopWindow
          key={i}
          x={from}
          y={-openTop}
          width={paneWidth}
          height={paneHeight}
          lit={groundLit}
          glass={palette.glass}
          frame={trim}
          stroke={stroke}
        />,
      );
    });
  }

  /* Civic columns, drawn against the facade behind the door. */
  const columns: React.ReactNode[] = [];
  if (!vacant && buildingType === 'civic') {
    const count = 4;
    const columnWidth = 16;
    const span = W - GROUND_MARGIN * 2 - columnWidth;
    for (let i = 0; i < count; i++) {
      const cx = GROUND_MARGIN + (span * i) / (count - 1);
      // Skip columns that would collide with the doorway.
      if (cx + columnWidth > geo.doorX - 8 && cx < geo.doorX + geo.doorWidth + 8) continue;
      columns.push(
        <rect
          key={i}
          x={cx}
          y={-openTop}
          width={columnWidth}
          height={openTop}
          fill={tint(facade, 0.22)}
          stroke={stroke}
          {...INK}
        />,
      );
    }
  }

  const signX = Math.max(8, Math.min(W - 8 - geo.signWidth, geo.doorX + geo.doorWidth / 2 - geo.signWidth / 2));

  /* Vacant: hoarding across the lower two thirds of the shell. */
  const hoardingHeight = (H * 2) / 3;
  const slug = address.replace(/[^a-zA-Z0-9]/g, '-');
  const clipId = `hoard-${slug}`;
  const logoClipId = `logo-${slug}`;

  const label = vacant
    ? `Vacant lot, ${number} ${street}. For sale.`
    : `${signText}, ${number} ${street}.`;

  const body = (
    <g
      className="mw-building"
      tabIndex={href ? undefined : 0}
      role="img"
      aria-label={label}
      // Addressable from the client, so a deep link can find and centre it
      // without anyone recomputing the layout in pixels.
      data-address={address}
      data-street={street}
      transform={`translate(${x} ${baseline})`}
    >
      <g transform={`rotate(${geo.wonk} ${W / 2} 0)`}>
        {/* Facade */}
        <rect x={0} y={-H} width={W} height={H} fill={facade} stroke={stroke} {...INK} />

        {/* Roof */}
        <g transform={`translate(0 ${-H})`}>
          <Roof type={geo.roofType} width={W} color={facade} accent={accent} stroke={stroke} />
        </g>

        {vacant ? (
          <>
            <Hoarding
              clipId={clipId}
              x={0}
              y={-hoardingHeight}
              width={W}
              height={hoardingHeight}
              stroke={stroke}
            />
            <ForSalePlacard x={W / 2 - 42} y={-hoardingHeight * 0.62} fill={plate} stroke={stroke} />
          </>
        ) : (
          <>
            {/* Storey line between the ground floor and the upper floors */}
            <line x1={0} y1={-GF} x2={W} y2={-GF} stroke={stroke} {...INK} />

            {upperWindows}
            {columns}
            {shopPanes}

            <Door
              x={geo.doorX}
              y={-openTop}
              width={geo.doorWidth}
              height={openTop}
              accent={accent}
              stroke={stroke}
            />

            {geo.hasAwning && (
              <Awning
                x={GROUND_MARGIN}
                y={-awningTop}
                width={W - GROUND_MARGIN * 2}
                height={AWNING_HEIGHT}
                stripes={geo.awningStripes}
                accent={accent}
                stroke={stroke}
              />
            )}

            <Sign
              x={signX}
              y={-signTop}
              width={geo.signWidth}
              height={SIGN_HEIGHT}
              text={signText}
              board={accent}
              stroke={stroke}
            />

            <NumberPlate
              x={geo.doorX + geo.doorWidth / 2 - 17}
              y={-openTop + Math.min(20, openTop * 0.16) + 6}
              number={number}
              fill={plate}
              stroke={stroke}
            />
          </>
        )}

        {/*
         * The marker above the roof, for two different reasons.
         *
         * A logo hangs over an owner's door whenever anybody walks past — it is
         * part of what they bought. The plain red pin is the other job: saying
         * "this one" to somebody who followed a link to this exact address, and
         * it appears only for them, on a shop with no logo of its own to show.
         */}
        {(highlighted || logoUrl) && (
          <g className="mw-marker" transform={`translate(${W / 2} ${-(H + geo.roofHeight) - 18})`}>
            <polygon points="0,0 15,-19 -15,-19" fill="#E8544B" stroke={stroke} {...INK} />
            {logoUrl ? (
              <>
                <defs>
                  <clipPath id={logoClipId}>
                    <rect x={-30} y={-79} width={60} height={60} rx={CORNER_RADIUS} />
                  </clipPath>
                </defs>
                <rect x={-30} y={-79} width={60} height={60} rx={CORNER_RADIUS} fill="#FFF6E5" stroke="none" />
                <image
                  href={logoUrl}
                  x={-30}
                  y={-79}
                  width={60}
                  height={60}
                  preserveAspectRatio="xMidYMid meet"
                  clipPath={`url(#${logoClipId})`}
                />
                <rect
                  x={-30}
                  y={-79}
                  width={60}
                  height={60}
                  rx={CORNER_RADIUS}
                  fill="none"
                  stroke={stroke}
                  {...INK}
                />
              </>
            ) : (
              <>
                <rect x={-15} y={-45} width={30} height={26} rx={CORNER_RADIUS} fill="#E8544B" stroke={stroke} {...INK} />
                <circle cx={0} cy={-32} r={5.5} fill="#FFF6E5" stroke={stroke} {...INK} />
              </>
            )}
          </g>
        )}

        {/* Keyboard focus ring — CSS reveals it on :focus-visible only. */}
        <rect
          className="mw-focus-ring"
          x={-STROKE_WIDTH}
          y={-(H + geo.roofHeight) - STROKE_WIDTH}
          width={W + STROKE_WIDTH * 2}
          height={H + geo.roofHeight + STROKE_WIDTH * 2}
          fill="none"
          stroke={inkOn(palette.sky)}
          strokeWidth={4}
          strokeDasharray="10 7"
        />
      </g>
    </g>
  );

  return href ? (
    <a className="mw-building-link" href={href} aria-label={label}>
      {body}
    </a>
  ) : (
    body
  );
}

/**
 * Facade palette, time-of-day palettes, and flat colour mixing.
 *
 * Fills are the only thing time of day is allowed to touch. Line art never
 * changes shape or weight, and nothing here is implemented with CSS filters,
 * gradients or opacity — `mixHex` bakes the tint into a flat colour.
 */

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

/** Sixteen curated facades. Owners pick an index; there is no free picker. */
export const FACADE_PALETTE = [
  '#E8544B', '#F2A03D', '#F5CE3E', '#8FBF54',
  '#4FA382', '#4A90C4', '#6C6FBF', '#A868A8',
  '#D96A9E', '#C46B4A', '#8C6E4F', '#D9CBB3',
  '#7C8B96', '#5A6E5A', '#E0857B', '#3F5C77',
] as const;

/* ---- Style constants (§6) --------------------------------------------- */

export const STROKE_DAY = '#1A1A1A';
export const STROKE_NIGHT = '#0E1220';
export const STROKE_WIDTH = 3.5;
export const CORNER_RADIUS = 2;

/** Lit window fill, and the vacant-state colours. */
export const LIT_WINDOW = '#FFD98A';
export const VACANT_SHELL = '#CFC9BE';
export const HOARDING = '#B49A76';
export const LAMP_GLOW = '#F7E7A8';

export type WindowsLit = 'none' | 'partial' | 'all';

export type TimePalette = {
  sky: string;
  /** Optional second sky band painted above the horizon. */
  skyBand: string | null;
  road: string;
  sidewalk: string;
  facadeTint: string | null;
  facadeTintAmount: number;
  windowsLit: WindowsLit;
  stars: number;
  stroke: string;
  /** Unlit glass. */
  glass: string;
  /** Cloud body, kept close enough to the sky not to punch a hole in it. */
  cloud: string;
};

export const TIME_PALETTES: Record<TimeOfDay, TimePalette> = {
  dawn: {
    sky: '#F6C7A4',
    skyBand: null,
    road: '#B9A99A',
    sidewalk: '#D8CBBB',
    facadeTint: '#F0B27A',
    facadeTintAmount: 0.15,
    windowsLit: 'none',
    stars: 0,
    stroke: STROKE_DAY,
    glass: '#CFE3EC',
    cloud: '#FFF6EC',
  },
  day: {
    sky: '#7EC8E3',
    skyBand: null,
    road: '#9BA0A5',
    sidewalk: '#D6D6D0',
    facadeTint: null,
    facadeTintAmount: 0,
    windowsLit: 'none',
    stars: 0,
    stroke: STROKE_DAY,
    glass: '#CFE9F2',
    cloud: '#FFFFFF',
  },
  dusk: {
    sky: '#E88A5C',
    skyBand: '#7B5EA7',
    road: '#6E6472',
    sidewalk: '#9A8F98',
    facadeTint: '#8B5E9E',
    facadeTintAmount: 0.25,
    windowsLit: 'partial',
    stars: 0,
    stroke: STROKE_DAY,
    glass: '#6E6A86',
    cloud: '#D7C7E6',
  },
  night: {
    sky: '#1E2A4A',
    skyBand: null,
    road: '#2E3550',
    sidewalk: '#454C68',
    facadeTint: '#1E2A4A',
    facadeTintAmount: 0.55,
    windowsLit: 'all',
    stars: 40,
    stroke: STROKE_NIGHT,
    glass: '#2B3454',
    cloud: '#5C6486',
  },
};

export const TIMES_OF_DAY: readonly TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];

/* ---- Colour maths ------------------------------------------------------ */

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const int = parseInt(h, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((c) => clampByte(c).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/** Blend `tint` into `base` by `amount` (0..1). Result is a flat colour. */
export function mixHex(base: string, tint: string, amount: number): string {
  const a = Math.max(0, Math.min(1, amount));
  const [r1, g1, b1] = parseHex(base);
  const [r2, g2, b2] = parseHex(tint);
  return toHex(r1 + (r2 - r1) * a, g1 + (g2 - g1) * a, b1 + (b2 - b1) * a);
}

/** Darken toward the stroke colour — used for roofs and recesses. */
export function shade(hex: string, amount: number): string {
  return mixHex(hex, '#101010', amount);
}

/** Lighten toward white — used for awning stripes and trim. */
export function tint(hex: string, amount: number): string {
  return mixHex(hex, '#FFFFFF', amount);
}

/** Apply the current time-of-day wash to any facade-ish fill. */
export function applyTimeTint(color: string, palette: TimePalette): string {
  if (!palette.facadeTint || palette.facadeTintAmount <= 0) return color;
  return mixHex(color, palette.facadeTint, palette.facadeTintAmount);
}

/**
 * Stacked flat bands from `skyBand` down to `sky`, for the dusk sunset.
 * Gradients are out, so the transition is done as discrete bands — a flat
 * illustration technique, not a gradient in disguise. Returns top-down.
 */
export function skyBands(palette: TimePalette, count = 4): string[] {
  if (!palette.skyBand) return [];
  return Array.from({ length: count }, (_, i) =>
    mixHex(palette.skyBand as string, palette.sky, i / count),
  );
}

/** Readable ink for sign text sitting on `background`. */
export function inkOn(background: string): string {
  const [r, g, b] = parseHex(background);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#1A1A1A' : '#FFF6E5';
}

/* ---- Clock ------------------------------------------------------------- */

/** dawn 5–8, day 8–17, dusk 17–20, night 20–5. */
export function timeOfDayForHour(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

/** Visitor's local clock. Call on the client only, to keep SSR deterministic. */
export function currentTimeOfDay(now: Date = new Date()): TimeOfDay {
  return timeOfDayForHour(now.getHours());
}

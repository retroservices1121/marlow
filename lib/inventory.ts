/**
 * Merging stored owner choices onto the generated inventory.
 *
 * `generateLots()` stays the pure, deterministic default. This layer lays
 * whatever an owner has saved on top of it. An address with no stored row comes
 * through untouched, so an unedited town renders byte-identical to the one the
 * renderer shipped with.
 *
 * Everything here validates. These fields are user input and they feed straight
 * into the renderer, so a bad value must never reach a component — it is
 * dropped in favour of the generated default rather than drawn.
 */

import { FACADE_PALETTE } from './palette';
import { generateLots, type BuildingType, type Lot, type Status } from './lots';

export const MAX_SIGN_CHARS = 18;

const BUILDING_TYPES: readonly BuildingType[] = ['storefront', 'tower', 'warehouse', 'civic'];
const STATUSES: readonly Status[] = ['sold', 'vacant'];

/** The stored half of a lot: what an owner chose, plus who owns it. */
/**
 * How a lot came to be spoken for.
 *
 * `giveaway` is the odd one: it is not somebody's lot at all yet, it is one
 * held back to be handed out. It has to be distinguishable, or the page shows
 * "Sold" to everyone who follows the link announcing the prize.
 */
export type AcquiredVia = 'claim' | 'grant' | 'purchase' | 'giveaway';

function isAcquiredVia(value: unknown): value is AcquiredVia {
  return value === 'claim' || value === 'grant' || value === 'purchase' || value === 'giveaway';
}

export type LotOverride = {
  address: string;
  /** Set when a signed-in account owns the lot. */
  ownerId: string | null;
  /** Set at purchase, before any account exists. */
  ownerEmail: string | null;
  status: Status | null;
  buildingType: BuildingType | null;
  facadeColor: string | null;
  accentColor: string | null;
  signText: string | null;
  acquiredVia: AcquiredVia | null;
};

/** A lot plus the ownership facts the renderer does not care about. */
export type OwnedLot = Lot & {
  ownerId: string | null;
  /** Bought by somebody — with or without an account behind it yet. */
  claimed: boolean;
  /** Held back to be given away — not sold, and not available to buy. */
  reserved: boolean;
  /** Bought, but nobody has signed in with the buyer's email to take it over. */
  awaitingOwner: boolean;
};

/* ---- Validation -------------------------------------------------------- */

/** Curated palette only — never a free colour picker. */
export function isPaletteColor(value: unknown): value is string {
  return typeof value === 'string' && (FACADE_PALETTE as readonly string[]).includes(value.toUpperCase());
}

export function normalizeColor(value: unknown): string | null {
  return isPaletteColor(value) ? value.toUpperCase() : null;
}

export function isBuildingType(value: unknown): value is BuildingType {
  return typeof value === 'string' && BUILDING_TYPES.includes(value as BuildingType);
}

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && STATUSES.includes(value as Status);
}

/**
 * Sign text is uppercase, trimmed, length-capped, and restricted to characters
 * the sign board can actually render. Anything else is dropped rather than
 * drawn — a sign is a public-facing string on someone else's street.
 */
export function normalizeSignText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9 &.'\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SIGN_CHARS);
  return cleaned.length > 0 ? cleaned : null;
}

/** Coerces one database row into a validated override. */
export function toOverride(row: Record<string, unknown>): LotOverride {
  return {
    address: String(row.address),
    ownerId: row.owner_id == null ? null : String(row.owner_id),
    ownerEmail: row.owner_email == null ? null : String(row.owner_email).toLowerCase(),
    acquiredVia: isAcquiredVia(row.acquired_via) ? row.acquired_via : null,
    status: isStatus(row.status) ? row.status : null,
    buildingType: isBuildingType(row.building_type) ? row.building_type : null,
    facadeColor: normalizeColor(row.facade_color),
    accentColor: normalizeColor(row.accent_color),
    signText: normalizeSignText(row.sign_text),
  };
}

/* ---- Merge ------------------------------------------------------------- */

/**
 * Lays stored choices over the generated defaults.
 *
 * Note the ordering: `buildingType` is applied before anything else is read,
 * because it is the one owner-chosen field the geometry depends on. A lot whose
 * type changes legitimately changes shape — every other field is fills and text.
 */
export function applyOverrides(
  lots: readonly Lot[],
  overrides: ReadonlyMap<string, LotOverride>,
): OwnedLot[] {
  return lots.map((lot) => {
    const stored = overrides.get(lot.address);
    if (!stored) {
      return { ...lot, ownerId: null, claimed: false, awaitingOwner: false, reserved: false };
    }

    return {
      ...lot,
      status: stored.status ?? lot.status,
      buildingType: stored.buildingType ?? lot.buildingType,
      facadeColor: stored.facadeColor ?? lot.facadeColor,
      accentColor: stored.accentColor ?? lot.accentColor,
      signText: stored.signText ?? lot.signText,
      ownerId: stored.ownerId,
      // Either half of ownership means the lot is spoken for.
      claimed: stored.ownerId !== null || stored.ownerEmail !== null,
      awaitingOwner: stored.ownerId === null && stored.ownerEmail !== null,
      // Reserved only until somebody signs in and takes it; after that it is
      // simply their shop, however it was won.
      reserved: stored.ownerId === null && stored.acquiredVia === 'giveaway',
    };
  });
}

/** The generated inventory with stored choices applied. */
export function buildInventory(overrides: ReadonlyMap<string, LotOverride>): OwnedLot[] {
  return applyOverrides(generateLots(), overrides);
}

export function overridesByAddress(rows: Record<string, unknown>[]): Map<string, LotOverride> {
  return new Map(rows.map((row) => [String(row.address), toOverride(row)]));
}

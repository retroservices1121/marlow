/**
 * Lot type, street definitions, and the initial inventory generator.
 *
 * A Lot carries the owner-chosen fields (facade, accent, sign, building type)
 * and the app-supplied status. It carries no geometry: every dimension is
 * derived from `address` at render time, so a lot is cheap to store and
 * impossible to get out of sync with what is drawn.
 */

import { FACADE_PALETTE } from './palette';
import { subRandom } from './hash';

export type Tier = 'corner' | 'main' | 'side';
export type Status = 'sold' | 'vacant';
export type BuildingType = 'storefront' | 'tower' | 'warehouse' | 'civic';

export type Lot = {
  /** Stable id, safe as a React key. */
  id: string;
  /** "108 Main Street" — the seed for every derived dimension. */
  address: string;
  number: number;
  street: string;
  tier: Tier;
  status: Status;
  /* Owner-chosen, stored: */
  buildingType: BuildingType;
  facadeColor: string;
  accentColor: string;
  signText: string;
};

export type StreetDef = {
  name: string;
  /** How many lots this street holds. */
  count: number;
  /** Lots on a cross street are `side`; Main Street ends are `corner`. */
  main: boolean;
};

/** Main Street plus three named cross streets. 48 + 24 + 24 + 24 = 120. */
export const STREETS: readonly StreetDef[] = [
  { name: 'Main Street', count: 48, main: true },
  { name: 'Willow Lane', count: 24, main: false },
  { name: 'Harbor Road', count: 24, main: false },
  { name: 'Kiln Street', count: 24, main: false },
];

export const TOTAL_LOTS = STREETS.reduce((sum, s) => sum + s.count, 0);

/** Even numbers on the rendered side, from 100, incrementing by 2. */
const FIRST_NUMBER = 100;
const NUMBER_STEP = 2;

/* ---- Seed content ------------------------------------------------------
 * The shop names and colours below stand in for owner choices until owners
 * exist. They are derived from the address so the demo street is stable, but
 * they are ordinary stored props: overwrite any of them and only that one
 * building changes.
 */

const NAME_HEADS = [
  'BRASS', 'AMBER', 'CROOKED', 'BLUE', 'IRON', 'PAPER', 'SALT', 'CLOVER',
  'HOLLOW', 'MARIGOLD', 'PENNY', 'RUSSET', 'THIRSTY', 'GLASS', 'NORTH',
  'LANTERN', 'FIG', 'OLD', 'RIVER', 'SPARROW', 'CEDAR', 'HARROW', 'PLUM',
  'WREN', 'COPPER', 'MERCY', 'QUAIL', 'TIDE', 'ASH', 'GOLDEN', 'BRAMBLE',
  'SEVEN', 'LOW', 'MARBLE',
] as const;

const NAME_TAILS = [
  'KETTLE', 'GROCER', 'BAKERY', 'RECORDS', 'BARBER', 'CLOCKS', 'PRESS',
  'CAFE', 'TAILOR', 'HARDWARE', 'FLORIST', 'BOOKS', 'CHEMIST', 'DELI',
  'ATELIER', 'STUDIO', 'CANTINA', 'LAUNDRY',
] as const;

const TOWER_NAMES = [
  'MARLOW TOWER', 'THE STACKS', 'HIGH & DRY', 'BEACON WORKS', 'THE NARROWS',
  'CLOCKTOWER', 'UPPER OFFICES', 'THE SPINDLE', 'GRANITE HOUSE', 'THE PERCH',
] as const;
const WAREHOUSE_NAMES = [
  'DOCK NO. 4', 'THE DEPOT', 'FREIGHT & CO', 'COLD STORE', 'GRAIN HOUSE',
  'THE DRY DOCK', 'YARD NO. 9', 'SALT WORKS', 'THE TANNERY', 'KILN YARD',
  'BONDED STORE', 'THE ICEHOUSE',
] as const;
const CIVIC_NAMES = [
  'TOWN HALL', 'PUBLIC LIBRARY', 'THE ATHENAEUM', 'POST OFFICE',
  'COURT HOUSE', 'THE EXCHANGE', 'CIVIC ROOMS', 'CUSTOM HOUSE',
] as const;

const MAX_SIGN_CHARS = 18;

function seedSignText(address: string, type: BuildingType): string {
  const rng = subRandom(address, 'signText');
  let name: string;
  if (type === 'tower') name = rng.pick(TOWER_NAMES);
  else if (type === 'warehouse') name = rng.pick(WAREHOUSE_NAMES);
  else if (type === 'civic') name = rng.pick(CIVIC_NAMES);
  else name = `${rng.pick(NAME_HEADS)} ${rng.pick(NAME_TAILS)}`;
  return name.toUpperCase().slice(0, MAX_SIGN_CHARS);
}

function seedBuildingType(address: string, tier: Tier): BuildingType {
  const rng = subRandom(address, 'buildingType');
  if (tier === 'corner') return 'civic';
  const roll = rng.next();
  if (tier === 'main') {
    if (roll < 0.72) return 'storefront';
    if (roll < 0.88) return 'tower';
    if (roll < 0.96) return 'warehouse';
    return 'civic';
  }
  if (roll < 0.62) return 'storefront';
  if (roll < 0.74) return 'tower';
  return 'warehouse';
}

function seedColors(address: string): { facadeColor: string; accentColor: string } {
  const rng = subRandom(address, 'colors');
  const facadeIndex = rng.int(0, FACADE_PALETTE.length - 1);
  // Step a prime around the wheel so the accent never lands on the facade.
  const accentIndex = (facadeIndex + rng.int(3, 13)) % FACADE_PALETTE.length;
  return {
    facadeColor: FACADE_PALETTE[facadeIndex],
    accentColor: FACADE_PALETTE[accentIndex],
  };
}

function seedStatus(address: string, tier: Tier): Status {
  if (tier === 'corner') return 'sold';
  const rng = subRandom(address, 'status');
  return rng.chance(tier === 'main' ? 0.18 : 0.3) ? 'vacant' : 'sold';
}

/**
 * The initial inventory: 120 lots across four streets.
 * Pure and deterministic — no clock, no randomness, no storage.
 */
export function generateLots(streets: readonly StreetDef[] = STREETS): Lot[] {
  const lots: Lot[] = [];

  for (const street of streets) {
    for (let i = 0; i < street.count; i++) {
      const number = FIRST_NUMBER + i * NUMBER_STEP;
      const address = `${number} ${street.name}`;
      const isEnd = i === 0 || i === street.count - 1;
      const tier: Tier = street.main ? (isEnd ? 'corner' : 'main') : 'side';
      const buildingType = seedBuildingType(address, tier);
      const { facadeColor, accentColor } = seedColors(address);

      lots.push({
        id: address,
        address,
        number,
        street: street.name,
        tier,
        status: seedStatus(address, tier),
        buildingType,
        facadeColor,
        accentColor,
        signText: seedSignText(address, buildingType),
      });
    }
  }

  return lots;
}

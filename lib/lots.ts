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
/** How desirable a district is. The second axis of what a lot is worth. */
export type Standing = 'downtown' | 'central' | 'outer';
export type Status = 'sold' | 'vacant';
export type BuildingType = 'storefront' | 'tower' | 'warehouse' | 'civic';

export type Lot = {
  /** Stable id, safe as a React key. */
  id: string;
  /**
   * "108 Main Street" — the seed for every derived dimension, the primary key,
   * and what every shared link points at.
   *
   * Street names are unique across the whole city precisely so this can stay
   * short and stable. The district is derived from the street, never written
   * into the address: changing an address would rehash the building into a
   * different shape and break every row keyed on it.
   */
  address: string;
  number: number;
  street: string;
  /** Derived from the street, never stored. */
  district: string;
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
  /** URL-safe name: `willow-lane`. */
  slug: string;
  /** Slug of the district this street belongs to. */
  district: string;
  /** How many lots this street holds. */
  count: number;
  /** Main Street is the spine; the rest hang off it. */
  main: boolean;
  /**
   * For a side street, the index on Main Street it opens beside. Walking past
   * that point on Main Street, you can turn into this one.
   */
  joinsAfter?: number;
  /**
   * Which way the street runs when the town is seen from above.
   *
   * Nothing draws a plan view yet — the street views are side elevations, where
   * this is unused. It is recorded now because a map has to know the town's
   * shape, and inferring it later from an ordering would be guesswork.
   */
  direction: 'east' | 'south';
};

export type DistrictDef = {
  name: string;
  slug: string;
  standing: Standing;
  streets: StreetDef[];
};

/**
 * The city.
 *
 * Every street name is unique across all districts. That is load-bearing rather
 * than tidy: an address is "108 Willow Lane" with no district in it, so two
 * Willow Lanes would be the same lot — same primary key, same geometry hash.
 * `assertUniqueStreets` below enforces it, and a check in the renderer harness
 * enforces it again.
 *
 * A district is a spine street with side streets hanging off it, the same shape
 * downtown has always had. Standing is the second pricing axis: a corner in the
 * Wharf is not a corner on Main Street.
 */
export const DISTRICTS: readonly DistrictDef[] = [
  {
    name: 'Downtown',
    slug: 'downtown',
    standing: 'downtown',
    streets: [
      { name: 'Main Street', slug: 'main-street', district: 'downtown', count: 48, main: true, direction: 'east' },
      { name: 'Willow Lane', slug: 'willow-lane', district: 'downtown', count: 24, main: false, joinsAfter: 11, direction: 'south' },
      { name: 'Harbor Road', slug: 'harbor-road', district: 'downtown', count: 24, main: false, joinsAfter: 23, direction: 'south' },
      { name: 'Kiln Street', slug: 'kiln-street', district: 'downtown', count: 24, main: false, joinsAfter: 35, direction: 'south' },
    ],
  },
  {
    name: 'Old Town',
    slug: 'old-town',
    standing: 'central',
    streets: [
      { name: 'Cathedral Row', slug: 'cathedral-row', district: 'old-town', count: 56, main: true, direction: 'east' },
      { name: 'Chandler Walk', slug: 'chandler-walk', district: 'old-town', count: 44, main: false, joinsAfter: 11, direction: 'south' },
      { name: 'Vellum Street', slug: 'vellum-street', district: 'old-town', count: 44, main: false, joinsAfter: 23, direction: 'south' },
      { name: 'Almsgate', slug: 'almsgate', district: 'old-town', count: 44, main: false, joinsAfter: 35, direction: 'south' },
      { name: 'Pilgrim Yard', slug: 'pilgrim-yard', district: 'old-town', count: 44, main: false, joinsAfter: 47, direction: 'south' },
    ],
  },
  {
    name: 'The Wharf',
    slug: 'the-wharf',
    standing: 'central',
    streets: [
      { name: 'Dockside', slug: 'dockside', district: 'the-wharf', count: 56, main: true, direction: 'east' },
      { name: 'Netmaker Lane', slug: 'netmaker-lane', district: 'the-wharf', count: 40, main: false, joinsAfter: 11, direction: 'south' },
      { name: 'Saltings Way', slug: 'saltings-way', district: 'the-wharf', count: 40, main: false, joinsAfter: 23, direction: 'south' },
      { name: 'Capstan Row', slug: 'capstan-row', district: 'the-wharf', count: 40, main: false, joinsAfter: 35, direction: 'south' },
      { name: 'Tidewater Street', slug: 'tidewater-street', district: 'the-wharf', count: 40, main: false, joinsAfter: 47, direction: 'south' },
    ],
  },
  {
    name: 'Foundry District',
    slug: 'foundry-district',
    standing: 'outer',
    streets: [
      { name: 'Forge Street', slug: 'forge-street', district: 'foundry-district', count: 56, main: true, direction: 'east' },
      { name: 'Cinder Row', slug: 'cinder-row', district: 'foundry-district', count: 40, main: false, joinsAfter: 11, direction: 'south' },
      { name: 'Bellows Lane', slug: 'bellows-lane', district: 'foundry-district', count: 40, main: false, joinsAfter: 23, direction: 'south' },
      { name: 'Anvil Walk', slug: 'anvil-walk', district: 'foundry-district', count: 40, main: false, joinsAfter: 35, direction: 'south' },
      { name: 'Slagwell Street', slug: 'slagwell-street', district: 'foundry-district', count: 40, main: false, joinsAfter: 47, direction: 'south' },
    ],
  },
  {
    name: 'Garden Quarter',
    slug: 'garden-quarter',
    standing: 'outer',
    streets: [
      { name: 'Orchard Way', slug: 'orchard-way', district: 'garden-quarter', count: 56, main: true, direction: 'east' },
      { name: 'Beehive Row', slug: 'beehive-row', district: 'garden-quarter', count: 40, main: false, joinsAfter: 11, direction: 'south' },
      { name: 'Greenhouse Lane', slug: 'greenhouse-lane', district: 'garden-quarter', count: 40, main: false, joinsAfter: 23, direction: 'south' },
      { name: 'Trellis Street', slug: 'trellis-street', district: 'garden-quarter', count: 40, main: false, joinsAfter: 35, direction: 'south' },
      { name: 'Bramble Walk', slug: 'bramble-walk', district: 'garden-quarter', count: 40, main: false, joinsAfter: 47, direction: 'south' },
    ],
  },
];

/** Every street in the city, flattened. */
export const STREETS: readonly StreetDef[] = DISTRICTS.flatMap((d) => d.streets);

/**
 * Street names and slugs must be unique city-wide, because the address carries
 * no district. Thrown at module load rather than discovered when two lots turn
 * out to be the same lot.
 */
function assertUniqueStreets(streets: readonly StreetDef[]): void {
  const names = new Set<string>();
  const slugs = new Set<string>();
  for (const street of streets) {
    if (names.has(street.name)) throw new Error(`Duplicate street name: ${street.name}`);
    if (slugs.has(street.slug)) throw new Error(`Duplicate street slug: ${street.slug}`);
    names.add(street.name);
    slugs.add(street.slug);
  }
}
assertUniqueStreets(STREETS);

export function districtBySlug(slug: string): DistrictDef | undefined {
  return DISTRICTS.find((d) => d.slug === slug);
}

export function districtOf(street: StreetDef): DistrictDef | undefined {
  return districtBySlug(street.district);
}

/** Streets in the same district as this one. */
export function siblingStreets(street: StreetDef): readonly StreetDef[] {
  return districtOf(street)?.streets ?? [];
}

export function streetBySlug(slug: string): StreetDef | undefined {
  return STREETS.find((street) => street.slug === slug);
}

export function streetByName(name: string): StreetDef | undefined {
  return STREETS.find((street) => street.name === name);
}

/**
 * Side streets opening off `street`, in the order you meet them walking it.
 *
 * Scoped to the street's own district. Searching the whole city would hang
 * every district's side streets off every district's spine.
 */
export function junctionsOn(
  street: StreetDef,
  streets: readonly StreetDef[] = siblingStreets(street),
): { afterIndex: number; street: StreetDef }[] {
  if (!street.main) return [];
  return streets
    .filter((other) => other.joinsAfter !== undefined)
    .map((other) => ({ afterIndex: other.joinsAfter as number, street: other }))
    .sort((a, b) => a.afterIndex - b.afterIndex);
}

/** The spine a side street returns to — the one in its own district. */
export function parentStreet(
  street: StreetDef,
  streets: readonly StreetDef[] = siblingStreets(street),
) {
  return street.main ? undefined : streets.find((s) => s.main);
}

/**
 * Indices on a street that sit beside an intersection — a street end, or a
 * junction where a side street opens. These are the lots a visitor sees on a
 * corner, which is what makes the corner tier worth paying for.
 */
export function cornerIndices(
  street: StreetDef,
  streets: readonly StreetDef[] = siblingStreets(street),
): Set<number> {
  const corners = new Set<number>([0, street.count - 1]);
  if (street.main) {
    for (const other of streets) {
      if (other.joinsAfter === undefined) continue;
      corners.add(other.joinsAfter);
      corners.add(other.joinsAfter + 1);
    }
  }
  return corners;
}

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
  'ATELIER', 'STUDIO', 'CANTINA', 'LAUNDRY', 'FORGE', 'CREAMERY', 'BINDERY',
  'APOTHECARY', 'OUTFITTERS', 'PANTRY', 'ARCADE', 'ROASTERY', 'COBBLER',
  'MERCHANT', 'SUPPLY', 'WORKS', 'PARLOUR', 'EMPORIUM',
] as const;

/**
 * Sentence shapes for a shop name.
 *
 * Heads times tails alone gave a few hundred names, which was ample for 120
 * lots and visibly repetitive at a thousand — two shops on one street ended up
 * with the same sign. Patterns multiply the pool without inventing more words.
 */
const NAME_PATTERNS = [
  (head: string, tail: string) => `${head} ${tail}`,
  (head: string, tail: string) => `THE ${head} ${tail}`,
  (head: string, tail: string) => `${head} & ${tail}`,
  (head: string, tail: string) => `${head} ${tail} CO`,
] as const;

/*
 * The specialised pools are small by nature — there are only so many things a
 * warehouse is called. At a thousand lots that ran out and two warehouses on
 * one street ended up sharing a sign, so each carries an optional number the
 * way real yards and docks do.
 */
const TOWER_NAMES = [
  'MARLOW TOWER', 'THE STACKS', 'HIGH & DRY', 'BEACON WORKS', 'THE NARROWS',
  'CLOCKTOWER', 'UPPER OFFICES', 'THE SPINDLE', 'GRANITE HOUSE', 'THE PERCH',
  'THE PINNACLE', 'CHANDLER HOUSE', 'THE LOOKOUT', 'SIGNAL HOUSE', 'THE MAST',
  'CORNICE HOUSE', 'THE EYRIE', 'LEDGER HOUSE',
] as const;
const WAREHOUSE_NAMES = [
  'DOCK', 'THE DEPOT', 'FREIGHT & CO', 'COLD STORE', 'GRAIN HOUSE',
  'THE DRY DOCK', 'YARD', 'SALT WORKS', 'THE TANNERY', 'KILN YARD',
  'BONDED STORE', 'THE ICEHOUSE', 'ROPE WALK', 'THE GRANARY', 'COAL WHARF',
  'TIMBER YARD', 'THE MALTINGS', 'CASK STORE', 'HIDE HOUSE', 'THE SIDINGS',
] as const;
const CIVIC_NAMES = [
  'TOWN HALL', 'PUBLIC LIBRARY', 'THE ATHENAEUM', 'POST OFFICE',
  'COURT HOUSE', 'THE EXCHANGE', 'CIVIC ROOMS', 'CUSTOM HOUSE',
  'THE ASSEMBLY', 'WEIGH HOUSE', 'THE INSTITUTE', 'GUILD HALL',
  'THE ALMSHOUSE', 'RECORDS OFFICE', 'THE ROTUNDA', 'HARBOUR OFFICE',
] as const;

/**
 * "DOCK" becomes "DOCK NO. 7".
 *
 * Always numbered when it fits, not sometimes: names are derived per address
 * with no knowledge of the neighbours, so the only defence against two
 * warehouses on one street sharing a sign is a pool large enough that it does
 * not happen. Twenty bases times thirty-odd numbers is; twenty bases is not.
 */
function numbered(rng: ReturnType<typeof subRandom>, base: string): string {
  const n = rng.int(2, 44);
  // A long base cannot carry "NO." within the sign limit, and silently falling
  // back to the bare name is how two warehouses ended up sharing one.
  for (const candidate of [`${base} NO. ${n}`, `${base} ${n}`]) {
    if (candidate.length <= MAX_SIGN_CHARS) return candidate;
  }
  return base;
}

const MAX_SIGN_CHARS = 18;
/** How far back to look for a repeated sign. Matches the renderer check. */
const NAME_LOOKBACK = 8;

function seedSignText(address: string, type: BuildingType, attempt = 0): string {
  const rng = subRandom(address, attempt === 0 ? 'signText' : `signText:${attempt}`);
  let name: string;
  if (type === 'tower') name = rng.pick(TOWER_NAMES);
  else if (type === 'warehouse') name = numbered(rng, rng.pick(WAREHOUSE_NAMES));
  else if (type === 'civic') name = rng.pick(CIVIC_NAMES);
  else {
    const head = rng.pick(NAME_HEADS);
    const tail = rng.pick(NAME_TAILS);
    const shape = rng.pick(NAME_PATTERNS);
    name = shape(head, tail);
    // A pattern that overruns the sign board falls back to the plain form.
    if (name.length > MAX_SIGN_CHARS) name = `${head} ${tail}`;
  }
  return name.toUpperCase().slice(0, MAX_SIGN_CHARS);
}

function seedBuildingType(address: string, tier: Tier): BuildingType {
  const rng = subRandom(address, 'buildingType');
  const roll = rng.next();
  // Corners lean grand, but a street of nothing but town halls is not a town.
  if (tier === 'corner') {
    if (roll < 0.34) return 'civic';
    if (roll < 0.6) return 'tower';
    if (roll < 0.72) return 'warehouse';
    return 'storefront';
  }
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
    const corners = cornerIndices(street);
    for (let i = 0; i < street.count; i++) {
      const number = FIRST_NUMBER + i * NUMBER_STEP;
      const address = `${number} ${street.name}`;
      // The tier follows the drawing, not the other way round: a lot is a
      // corner when a visitor can see it on one. That means street ends and,
      // on Main Street, the lots either side of every junction.
      const tier: Tier = corners.has(i) ? 'corner' : street.main ? 'main' : 'side';
      const buildingType = seedBuildingType(address, tier);
      const { facadeColor, accentColor } = seedColors(address);

      /*
       * Guarantee a name is not repeated near itself, rather than hoping the
       * pool is large enough. Across the city there are roughly as many
       * neighbour pairs as there are possible names, so a clash is not unlucky,
       * it is expected — three rounds of enlarging the pools each moved the
       * collision somewhere else. Re-rolling with a salted seed stays fully
       * deterministic: the same inventory always produces the same names.
       */
      const recent = lots.slice(-NAME_LOOKBACK).filter((l) => l.street === street.name);
      let signText = seedSignText(address, buildingType);
      for (let attempt = 1; attempt <= 8 && recent.some((l) => l.signText === signText); attempt++) {
        signText = seedSignText(address, buildingType, attempt);
      }

      lots.push({
        id: address,
        address,
        number,
        street: street.name,
        district: street.district,
        tier,
        status: seedStatus(address, tier),
        buildingType,
        facadeColor,
        accentColor,
        signText,
      });
    }
  }

  return lots;
}

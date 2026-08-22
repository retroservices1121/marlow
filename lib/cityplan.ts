/**
 * Where everything in Marlow sits, seen from above.
 *
 * The street views are elevations: one street at a time, drawn as a row. A map
 * needs the other thing — a plan, with every district, street and building
 * placed relative to each other. This computes it, deterministically, from the
 * same lot data everything else reads.
 *
 * Plan coordinates: +x runs east, +y runs south. Nothing here knows how it will
 * be drawn, which is the point — the same plan feeds an isometric view, a flat
 * map, or anything later.
 */

import { deriveGeometry } from '@/components/Building';
import { DISTRICTS, junctionsOn, type DistrictDef, type Lot, type StreetDef } from './lots';

/** How far back a building runs from its frontage. */
export const DEPTH = 96;
/** Width of a carriageway plus its pavements. */
export const ROAD = 150;
/** Clear ground between one district and the next. */
export const DISTRICT_GAP = 700;

export type Facing = 'north' | 'east';

export type PlannedLot = {
  lot: Lot;
  /** North-west corner of the footprint. */
  x: number;
  y: number;
  /** Extent east and south. */
  w: number;
  d: number;
  height: number;
  facing: Facing;
};

export type PlannedRoad = { x: number; y: number; w: number; d: number };

export type PlannedDistrict = {
  district: DistrictDef;
  x: number;
  y: number;
  w: number;
  d: number;
};

export type CityPlan = {
  lots: PlannedLot[];
  roads: PlannedRoad[];
  districts: PlannedDistrict[];
  width: number;
  depth: number;
};

/** Frontage run of a street, in plan units. */
function streetLength(street: StreetDef, lots: readonly Lot[]): number {
  return lots
    .filter((lot) => lot.street === street.name)
    .reduce((total, lot) => total + deriveGeometry(lot.address, lot.buildingType).width, 0);
}

/**
 * One district: a spine running east, with side streets dropping south from it.
 *
 * The same L-shape the elevations imply, made explicit. Spine buildings sit
 * north of the spine road; a side street's buildings sit west of its road.
 */
function planDistrict(
  district: DistrictDef,
  lots: readonly Lot[],
  originX: number,
  originY: number,
): { lots: PlannedLot[]; roads: PlannedRoad[]; width: number; depth: number } {
  const placed: PlannedLot[] = [];
  const roads: PlannedRoad[] = [];

  const spine = district.streets.find((s) => s.main);
  if (!spine) return { lots: placed, roads, width: 0, depth: 0 };

  const spineLots = lots.filter((lot) => lot.street === spine.name);
  const junctions = junctionsOn(spine);

  /* Where along the spine each side street opens. */
  const junctionAt = new Map<string, number>();
  let cursor = originX;
  spineLots.forEach((lot, i) => {
    const geo = deriveGeometry(lot.address, lot.buildingType);
    placed.push({
      lot,
      x: cursor,
      y: originY,
      w: geo.width,
      d: DEPTH,
      height: geo.height,
      facing: 'north',
    });
    cursor += geo.width;

    const junction = junctions.find((j) => j.afterIndex === i);
    if (junction) {
      junctionAt.set(junction.street.slug, cursor);
      cursor += ROAD;
    }
  });

  const spineWidth = cursor - originX;
  const spineRoadY = originY + DEPTH;
  roads.push({ x: originX, y: spineRoadY, w: spineWidth, d: ROAD });

  /* Each side street drops south from its junction. */
  let deepest = spineRoadY + ROAD;
  for (const junction of junctions) {
    const sideLots = lots.filter((lot) => lot.street === junction.street.name);
    const x = junctionAt.get(junction.street.slug) ?? originX;
    let y = spineRoadY + ROAD;

    for (const lot of sideLots) {
      const geo = deriveGeometry(lot.address, lot.buildingType);
      placed.push({
        lot,
        x: x - DEPTH,
        y,
        w: DEPTH,
        d: geo.width,
        height: geo.height,
        facing: 'east',
      });
      y += geo.width;
    }

    roads.push({ x, y: spineRoadY + ROAD, w: ROAD, d: y - (spineRoadY + ROAD) });
    deepest = Math.max(deepest, y);
  }

  return {
    lots: placed,
    roads,
    width: spineWidth,
    depth: deepest - originY,
  };
}

/**
 * The whole city.
 *
 * Districts are laid out on a coarse grid rather than modelled as real
 * geography — the point of the map is seeing everything at once and comparing
 * one position against another, not cartographic truth.
 */
export function planCity(lots: readonly Lot[], columns = 2): CityPlan {
  const planned: PlannedLot[] = [];
  const roads: PlannedRoad[] = [];
  const districts: PlannedDistrict[] = [];

  /* Measure every district first, so rows can be sized before anything is placed. */
  const measured = DISTRICTS.map((district) => {
    const trial = planDistrict(district, lots, 0, 0);
    return { district, width: trial.width, depth: trial.depth };
  });

  let y = 0;
  for (let row = 0; row * columns < measured.length; row++) {
    const inRow = measured.slice(row * columns, row * columns + columns);
    let x = 0;
    let tallest = 0;

    for (const entry of inRow) {
      const result = planDistrict(entry.district, lots, x, y);
      planned.push(...result.lots);
      roads.push(...result.roads);
      districts.push({
        district: entry.district,
        x,
        y,
        w: result.width,
        d: result.depth,
      });
      x += result.width + DISTRICT_GAP;
      tallest = Math.max(tallest, result.depth);
    }

    y += tallest + DISTRICT_GAP;
  }

  const width = Math.max(...districts.map((d) => d.x + d.w), 1);
  const depth = Math.max(...districts.map((d) => d.y + d.d), 1);
  return { lots: planned, roads, districts, width, depth };
}

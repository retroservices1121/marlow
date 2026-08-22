/**
 * Laying the town out in three dimensions.
 *
 * The point of this file is how little it does. Every dimension a building has
 * — its frontage, its height, its roof, its window grid, where its door sits —
 * already comes from `deriveGeometry`, hashed from the address. None of that is
 * about how the town is drawn, so the 3D town is the same town: same addresses,
 * same shapes, same deterministic result. Only the projection changes.
 */

import { deriveGeometry } from '@/components/Building';
import type { Lot } from './lots';

/** How far back a building runs from its frontage. */
export const BUILDING_DEPTH = 96;
export const PAVEMENT_WIDTH = 58;
export const ROAD_WIDTH = 128;
/** Eye height of somebody walking. */
export const EYE_HEIGHT = 64;
/** The opening where a side street meets the main one. */
export const JUNCTION_WIDTH = 230;

export type Placed3D = {
  lot: Lot;
  /** Centre of the frontage, in world units. */
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  /** Radians. 0 faces the main street; -PI/2 faces down the side street. */
  rotation: number;
  roofType: string;
  roofHeight: number;
  windowCols: number;
  windowRows: number;
  hasAwning: boolean;
  doorX: number;
  doorWidth: number;
  groundFloor: number;
};

function place(lot: Lot, x: number, z: number, rotation: number): Placed3D {
  const geo = deriveGeometry(lot.address, lot.buildingType);
  return {
    lot,
    x,
    z,
    width: geo.width,
    height: geo.height,
    depth: BUILDING_DEPTH,
    rotation,
    roofType: geo.roofType,
    roofHeight: geo.roofHeight,
    windowCols: geo.windowCols,
    windowRows: geo.windowRows,
    hasAwning: geo.hasAwning,
    doorX: geo.doorX,
    doorWidth: geo.doorWidth,
    groundFloor: geo.groundFloor,
  };
}

export type Corner3D = {
  buildings: Placed3D[];
  /** Where the side street opens, along the main street. */
  junctionX: number;
  mainLength: number;
  sideLength: number;
};

/**
 * A corner: a run of main-street frontage with a side street opening off it.
 *
 * The main street runs along +X with its buildings facing -Z, so the pavement
 * and road lie in front of them. The side street runs away along +Z through the
 * gap, its two rows facing each other.
 */
export function layoutCorner(main: Lot[], side: Lot[], beforeJunction = 3): Corner3D {
  const buildings: Placed3D[] = [];

  let cursor = 0;
  let junctionX = 0;

  main.forEach((lot, i) => {
    if (i === beforeJunction) {
      junctionX = cursor + JUNCTION_WIDTH / 2;
      cursor += JUNCTION_WIDTH;
    }
    const geo = deriveGeometry(lot.address, lot.buildingType);
    buildings.push(place(lot, cursor + geo.width / 2, 0, 0));
    cursor += geo.width;
  });

  const mainLength = cursor;

  /*
   * The side street's two rows face each other across it. The near ends start
   * clear of the main pavement so the corner is a corner rather than a collision.
   */
  let near = PAVEMENT_WIDTH + 40;
  const half = side.length / 2;
  side.slice(0, Math.ceil(half)).forEach((lot) => {
    const geo = deriveGeometry(lot.address, lot.buildingType);
    buildings.push(
      place(lot, junctionX - JUNCTION_WIDTH / 2, near + geo.width / 2, Math.PI / 2),
    );
    near += geo.width;
  });

  let far = PAVEMENT_WIDTH + 40;
  side.slice(Math.ceil(half)).forEach((lot) => {
    const geo = deriveGeometry(lot.address, lot.buildingType);
    buildings.push(
      place(lot, junctionX + JUNCTION_WIDTH / 2, far + geo.width / 2, -Math.PI / 2),
    );
    far += geo.width;
  });

  return { buildings, junctionX, mainLength, sideLength: Math.max(near, far) };
}

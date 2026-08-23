'use client';

/**
 * The whole city, seen at once.
 *
 * This is the surface the place is really sold from. Seeing every lot together
 * is what makes the scarcity legible — how much is taken, how much is left, and
 * why a Downtown corner is worth more than a Garden Quarter side street. A
 * street view can never show that; you can only ever see six shops at a time.
 *
 * One thousand buildings drawn as a single instanced mesh, so the whole city is
 * one draw call. In SVG this many buildings would be tens of thousands of DOM
 * nodes and a multi-megabyte document.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OwnedLot } from '@/lib/inventory';
import { planCity, type PlannedLot } from '@/lib/cityplan';
import { DISTRICTS } from '@/lib/lots';
import { TIME_PALETTES, applyTimeTint, shade, type TimeOfDay } from '@/lib/palette';
import { subRandom } from '@/lib/hash';
import LotPreview from './LotPreview';

/*
 * An empty plot has to be clearly not-ground and clearly not-a-shop. Pale and
 * low against a darker ground reads as available; a taken lot stands up in its
 * owner's colour. That contrast is the whole point of the map.
 */
const UNSOLD = '#EDE8DA';
/*
 * Tall enough to aim at. At 58 an empty plot was a much smaller target than a
 * taken one, which is backwards — the lots for sale are the ones a visitor most
 * needs to be able to click. Still well below a real building, so the contrast
 * that shows how full the city is survives.
 */
/** A four-sided cone is a pyramid, but points at a corner until it is turned. */
const ROOF_TURN = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  Math.PI / 4,
);

type Hover = { lot: OwnedLot; screenX: number; screenY: number } | null;

function Buildings({
  planned,
  timeOfDay,
  onHover,
  onSelect,
}: {
  planned: PlannedLot[];
  timeOfDay: TimeOfDay;
  onHover: (hover: Hover) => void;
  onSelect: (lot: OwnedLot) => void;
}) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const roofs = useRef<THREE.InstancedMesh>(null);
  const fronts = useRef<THREE.InstancedMesh>(null);
  const palette = TIME_PALETTES[timeOfDay];

  /*
   * Three meshes rather than one, and it is the difference between a town and a
   * bar chart.
   *
   * The map used to draw every lot as a plain box, which threw away the only
   * thing Marlow has that a grid of plots does not: these are shopfronts, with
   * roofs and doors and a colour over the window. A cube says "a quantity". A
   * cube with a pitched roof and a bright band along its front says "a shop",
   * from four hundred units up, at a glance.
   *
   * Still three draw calls for a thousand buildings, because each is one
   * instanced mesh.
   *
   * Unsold lots are built too, at their full height and with their own roof,
   * just unpainted. A town with 997 empty plots looked like a car park with
   * three shops in it, and no amount of detail on the sold ones fixes a map
   * that is mostly gravel. Built-but-unpainted reads as a town from the first
   * day, and colour still says what is taken: an owner's facade and the bright
   * band of their shopfront against a street of bare stone.
   */
  useEffect(() => {
    const body = bodies.current;
    const roof = roofs.current;
    const front = fronts.current;
    if (!body || !roof || !front) return;

    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    const hidden = new THREE.Vector3(0, 0, 0);
    const nowhere = new THREE.Vector3(0, -100000, 0);
    const flat = new THREE.Quaternion();

    planned.forEach((item, i) => {
      const lot = item.lot as OwnedLot;
      const taken = lot.claimed;
      const height = item.height;
      const cx = item.x + item.w / 2;
      const cz = item.y + item.d / 2;

      matrix.compose(
        new THREE.Vector3(cx, height / 2, cz),
        flat,
        new THREE.Vector3(item.w, height, item.d),
      );
      body.setMatrixAt(i, matrix);
      body.setColorAt(i, colour.set(taken ? lot.facadeColor : UNSOLD));

      /*
       * A roof, on the kinds of building that have one. Towers and warehouses
       * are flat-topped in the street view too, so giving them a point here
       * would make the map disagree with the place it is a map of.
       *
       * Unsold buildings get theirs as well. The silhouette is what makes a
       * skyline; withholding it was what made the empty half look like rubble.
       */
      const pitched = lot.buildingType === 'storefront' || lot.buildingType === 'civic';
      if (pitched) {
        const rise = Math.min(item.w, item.d) * 0.42;
        matrix.compose(
          new THREE.Vector3(cx, height + rise / 2, cz),
          ROOF_TURN,
          new THREE.Vector3(Math.max(item.w, item.d) * 0.78, rise, Math.max(item.w, item.d) * 0.78),
        );
        roof.setMatrixAt(i, matrix);
        // A shade darker than its walls either way, so the roof reads as a roof
        // rather than melting into the building under it.
        roof.setColorAt(i, colour.set(shade(taken ? lot.facadeColor : UNSOLD, 0.14)));
      } else {
        matrix.compose(nowhere, flat, hidden);
        roof.setMatrixAt(i, matrix);
        roof.setColorAt(i, colour.set(UNSOLD));
      }

      /*
       * The shopfront: a band of the owner's accent colour along the ground
       * floor, standing very slightly proud so it catches the light rather than
       * fighting the wall for the same pixels.
       */
      if (taken) {
        const bandHeight = Math.min(height * 0.34, 78);
        matrix.compose(
          new THREE.Vector3(cx, bandHeight / 2, cz),
          flat,
          new THREE.Vector3(item.w * 1.035, bandHeight, item.d * 1.035),
        );
        front.setMatrixAt(i, matrix);
        front.setColorAt(i, colour.set(lot.accentColor));
      } else {
        matrix.compose(nowhere, flat, hidden);
        front.setMatrixAt(i, matrix);
        front.setColorAt(i, colour.set(UNSOLD));
      }
    });

    for (const mesh of [body, roof, front]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      /*
       * Raycasting and frustum culling both test the bounding sphere before
       * looking at any instance. Left at the unit box the geometry was built
       * from, every pointer ray misses the whole city.
       */
      mesh.computeBoundingSphere();
    }
  }, [planned, palette]);

  return (
    <>
      <instancedMesh
        ref={bodies}
        args={[undefined, undefined, planned.length]}
        castShadow
        receiveShadow
        onPointerMove={(e) => {
          e.stopPropagation();
          if (e.instanceId === undefined) return;
          onHover({
            lot: planned[e.instanceId].lot as OwnedLot,
            screenX: e.nativeEvent.offsetX,
            screenY: e.nativeEvent.offsetY,
          });
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId === undefined) return;
          onSelect(planned[e.instanceId].lot as OwnedLot);
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>

      {/* Roofs and shopfronts are scenery: pointer events belong to the body,
          so a click means the same thing wherever on a building it lands. */}
      <instancedMesh
        ref={roofs}
        args={[undefined, undefined, planned.length]}
        castShadow
        raycast={() => null}
      >
        <coneGeometry args={[0.72, 1, 4]} />
        <meshLambertMaterial />
      </instancedMesh>

      <instancedMesh
        ref={fronts}
        args={[undefined, undefined, planned.length]}
        castShadow
        receiveShadow
        raycast={() => null}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>
    </>
  );
}

/**
 * Lot lines.
 *
 * The parcel is the thing being sold, so once you are close enough to consider
 * one you should be able to see where it begins and ends. Every footprint is
 * one geometry of line segments — a thousand outlines in a single draw call —
 * hidden while zoomed out, where they would collapse into noise.
 */
function ParcelLines({ planned, zoom }: { planned: PlannedLot[]; zoom: React.RefObject<number> }) {
  const lines = useRef<THREE.LineSegments>(null);

  const geometry = useMemo(() => {
    const points: number[] = [];
    for (const item of planned) {
      const { x, y, w, d } = item;
      const corners: [number, number][] = [
        [x, y],
        [x + w, y],
        [x + w, y + d],
        [x, y + d],
      ];
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i];
        const [bx, bz] = corners[(i + 1) % 4];
        points.push(ax, 1, az, bx, 1, bz);
      }
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return buffer;
  }, [planned]);

  useFrame(() => {
    if (lines.current) lines.current.visible = (zoom.current ?? 1) > 2.6;
  });

  return (
    <lineSegments ref={lines} geometry={geometry} visible={false}>
      <lineBasicMaterial color="#1A1A1A" />
    </lineSegments>
  );
}

/* ---- The land the town is standing on ---------------------------------- */

const GRASS = '#7BA84F';
const SAND = '#E6D5A4';
const WATER = '#4A90C4';
const FOLIAGE = '#568B42';
const TRUNK = '#8C6E4F';

/** How far the countryside runs past the last building. */
const COUNTRY = 1.7;

/**
 * Where the sea goes.
 *
 * The Wharf has been a wharf with nothing to be a wharf of since the day it was
 * laid out. The water belongs against whichever edge of the city that district
 * actually sits nearest, rather than an edge picked once and left to be wrong
 * the moment the districts are re-ordered.
 */
function shoreline(plan: ReturnType<typeof planCity>) {
  const wharf = plan.districts.find((d) => d.district.slug === 'the-wharf');
  if (!wharf) return null;

  const cx = wharf.x + wharf.w / 2;
  const cz = wharf.y + wharf.d / 2;
  const edges = [
    { side: 'west' as const, distance: cx },
    { side: 'east' as const, distance: plan.width - cx },
    { side: 'north' as const, distance: cz },
    { side: 'south' as const, distance: plan.depth - cz },
  ];
  return edges.reduce((nearest, edge) => (edge.distance < nearest.distance ? edge : nearest));
}

/**
 * Grass, a beach, the sea, and trees in every gap the streets left.
 *
 * A town on a bare grey slab reads as a diagram of a town. The same buildings
 * standing in open country with water at one end read as somewhere — and the
 * cost is three planes and two instanced meshes, whatever the size of the city.
 *
 * Every tree is placed by the same seeded generator the buildings use, so the
 * wood outside Garden Quarter is in the same place on every machine and after
 * every deploy. A landscape that reshuffled itself on each visit would make the
 * town feel like a screensaver.
 */
function Landscape({
  plan,
  timeOfDay,
}: {
  plan: ReturnType<typeof planCity>;
  timeOfDay: TimeOfDay;
}) {
  const palette = TIME_PALETTES[timeOfDay];
  const trunks = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);

  const shore = useMemo(() => shoreline(plan), [plan]);

  /*
   * Trees go anywhere the town is not: the countryside around it, and the wide
   * gaps between districts, which were the emptiest part of the map. Candidates
   * are tested against every footprint and every road rather than placed by
   * hand, so nothing ends up growing through a shopfront.
   */
  const trees = useMemo(() => {
    const spread = 0.5 * (COUNTRY - 1);
    const minX = -plan.width * spread;
    const minZ = -plan.depth * spread;
    const spanX = plan.width * COUNTRY;
    const spanZ = plan.depth * COUNTRY;

    const clear = 70;
    const placed: { x: number; z: number; scale: number }[] = [];

    for (let i = 0; i < 1600 && placed.length < 420; i++) {
      const rng = subRandom('marlow-landscape', `tree:${i}`);
      const x = minX + rng.range(0, spanX);
      const z = minZ + rng.range(0, spanZ);

      // Never in the sea, and never on the beach either.
      if (shore) {
        if (shore.side === 'west' && x < -60) continue;
        if (shore.side === 'east' && x > plan.width + 60) continue;
        if (shore.side === 'north' && z < -60) continue;
        if (shore.side === 'south' && z > plan.depth + 60) continue;
      }

      const onBuilding = plan.lots.some(
        (l) => x > l.x - clear && x < l.x + l.w + clear && z > l.y - clear && z < l.y + l.d + clear,
      );
      if (onBuilding) continue;

      const onRoad = plan.roads.some(
        (r) => x > r.x - 30 && x < r.x + r.w + 30 && z > r.y - 30 && z < r.y + r.d + 30,
      );
      if (onRoad) continue;

      placed.push({ x, z, scale: rng.range(0.72, 1.35) });
    }
    return placed;
  }, [plan, shore]);

  useEffect(() => {
    const trunk = trunks.current;
    const leaf = leaves.current;
    if (!trunk || !leaf) return;

    const matrix = new THREE.Matrix4();
    const flat = new THREE.Quaternion();

    trees.forEach((tree, i) => {
      const height = 150 * tree.scale;
      const stem = height * 0.34;

      matrix.compose(
        new THREE.Vector3(tree.x, stem / 2, tree.z),
        flat,
        new THREE.Vector3(14 * tree.scale, stem, 14 * tree.scale),
      );
      trunk.setMatrixAt(i, matrix);

      matrix.compose(
        new THREE.Vector3(tree.x, stem + (height - stem) / 2, tree.z),
        flat,
        new THREE.Vector3(78 * tree.scale, height - stem, 78 * tree.scale),
      );
      leaf.setMatrixAt(i, matrix);
    });

    trunk.instanceMatrix.needsUpdate = true;
    leaf.instanceMatrix.needsUpdate = true;
    trunk.computeBoundingSphere();
    leaf.computeBoundingSphere();
  }, [trees]);

  // The sea runs off past where anybody can see, so it has no far edge to give
  // the illusion away.
  const sea = Math.max(plan.width, plan.depth) * 2.2;
  const beach = 190;
  const acrossShore = shore?.side === 'west' || shore?.side === 'east';

  const seaX = !shore
    ? 0
    : shore.side === 'west'
      ? -beach - sea / 2
      : shore.side === 'east'
        ? plan.width + beach + sea / 2
        : plan.width / 2;
  const seaZ = !shore
    ? 0
    : shore.side === 'north'
      ? -beach - sea / 2
      : shore.side === 'south'
        ? plan.depth + beach + sea / 2
        : plan.depth / 2;

  const beachX = !shore
    ? 0
    : shore.side === 'west'
      ? -beach / 2
      : shore.side === 'east'
        ? plan.width + beach / 2
        : plan.width / 2;
  const beachZ = !shore
    ? 0
    : shore.side === 'north'
      ? -beach / 2
      : shore.side === 'south'
        ? plan.depth + beach / 2
        : plan.depth / 2;

  return (
    <group>
      {/* Open country, under everything. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[plan.width / 2, -2, plan.depth / 2]}
        receiveShadow
      >
        <planeGeometry args={[plan.width * COUNTRY * 2, plan.depth * COUNTRY * 2]} />
        <meshLambertMaterial color={applyTimeTint(GRASS, palette)} />
      </mesh>

      {shore && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[beachX, -1.4, beachZ]} receiveShadow>
            <planeGeometry
              args={[
                acrossShore ? beach : plan.width * COUNTRY * 2,
                acrossShore ? plan.depth * COUNTRY * 2 : beach,
              ]}
            />
            <meshLambertMaterial color={applyTimeTint(SAND, palette)} />
          </mesh>

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[seaX, -1.2, seaZ]}>
            <planeGeometry args={[acrossShore ? sea : sea * 2, acrossShore ? sea * 2 : sea]} />
            <meshLambertMaterial color={applyTimeTint(WATER, palette)} />
          </mesh>
        </>
      )}

      <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} raycast={() => null}>
        <cylinderGeometry args={[0.5, 0.5, 1, 5]} />
        <meshLambertMaterial color={applyTimeTint(TRUNK, palette)} />
      </instancedMesh>

      <instancedMesh
        ref={leaves}
        args={[undefined, undefined, trees.length]}
        castShadow
        raycast={() => null}
      >
        <coneGeometry args={[0.5, 1, 7]} />
        <meshLambertMaterial color={applyTimeTint(FOLIAGE, palette)} />
      </instancedMesh>
    </group>
  );
}

function Ground({
  plan,
  timeOfDay,
}: {
  plan: ReturnType<typeof planCity>;
  timeOfDay: TimeOfDay;
}) {
  const palette = TIME_PALETTES[timeOfDay];
  return (
    <group>
      {/* Pavement, only as far as the town goes — grass takes over beyond it. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[plan.width / 2, -1, plan.depth / 2]}
        receiveShadow
      >
        <planeGeometry args={[plan.width * 1.06, plan.depth * 1.06]} />
        <meshLambertMaterial color={shade(palette.sidewalk, 0.34)} />
      </mesh>

      {plan.roads.map((road, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[road.x + road.w / 2, 0, road.y + road.d / 2]}
          receiveShadow
        >
          <planeGeometry args={[road.w, road.d]} />
          <meshLambertMaterial color={shade(palette.road, 0.22)} />
        </mesh>
      ))}
    </group>
  );
}

export const MIN_ZOOM = 0.85;
export const MAX_ZOOM = 26;

/** Keys that walk the map. */
const MOVE_KEYS = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', 'a', 's', 'd'];

/**
 * Screen movement to movement across the plan, at whatever angle the camera
 * currently stands.
 *
 * The old version had the 45-degree case multiplied out into a pair of 0.7s,
 * which was right exactly once and silently wrong the moment the city could
 * turn. Dragging, zooming toward the cursor and walking with the keys all go
 * through here, so they cannot disagree about which way is left.
 */
function screenToPlan(sx: number, sy: number, azimuth: number): { x: number; z: number } {
  // Screen right and screen down, as directions across the ground.
  const rightX = Math.sin(azimuth);
  const rightZ = -Math.cos(azimuth);
  const downX = Math.cos(azimuth);
  const downZ = Math.sin(azimuth);
  return {
    x: sx * rightX + sy * downX,
    z: sx * rightZ + sy * downZ,
  };
}

/**
 * Moving about the city.
 *
 * Wheel and drag are the desktop half. The touch half matters more than it
 * sounds: at the zoom that fits the whole city onto a 390 pixel phone, a
 * building is under two pixels across, so without a way to zoom in, tapping one
 * is pure luck. Pinch, double tap and the on-screen buttons all exist for that
 * reason rather than for polish.
 */
function MapControls({
  plan,
  zoom,
  azimuth,
  azimuthWanted,
}: {
  plan: ReturnType<typeof planCity>;
  zoom: React.RefObject<number>;
  /** Where the camera is standing, in radians around the city. */
  azimuth: React.RefObject<number>;
  /** Where it is heading. Eased toward, so a turn reads as a turn. */
  azimuthWanted: React.RefObject<number>;
}) {
  const { camera, gl, size } = useThree();
  const held = useRef(new Set<string>());
  /*
   * Centred on the plan, so the opening shot frames the whole city rather than
   * hanging it off one corner. Arriving in empty ground when zooming was fixed
   * by closing the gaps between districts and by zooming toward the cursor,
   * not by looking somewhere else.
   */
  /*
   * The mean of the districts rather than the middle of the bounding box. Five
   * districts in two columns leave the last quadrant empty, so the box centre
   * sits in open ground and the city rides high in frame.
   */
  const centre = plan.districts.length
    ? plan.districts.reduce(
        (acc, d) => ({ x: acc.x + (d.x + d.w / 2) / plan.districts.length, z: acc.z + (d.y + d.d / 2) / plan.districts.length }),
        { x: 0, z: 0 },
      )
    : { x: plan.width / 2, z: plan.depth / 2 };
  const target = useRef(new THREE.Vector3(centre.x, 0, centre.z));
  const drag = useRef<{ x: number; y: number } | null>(null);
  /** Every finger currently down, so a second one can start a pinch. */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);

  /*
   * An orthographic camera in react-three-fiber takes its frustum from the
   * canvas size in pixels, so at zoom 1 it shows a 1280-unit window onto a
   * 20,000-unit city — a patch of pavement. Everything is scaled from the zoom
   * that fits the whole plan instead.
   */
  const fit = useMemo(() => {
    /*
     * The screen extent of an isometric plan, rather than a guess at it. Viewed
     * along the diagonal, a W by D plan spans (W+D)/root2 across; the camera
     * sits at height 0.85 of its horizontal reach, so the vertical is
     * compressed by the sine of that elevation.
     */
    const diagonal = (plan.width + plan.depth) / Math.SQRT2;
    const elevation = Math.atan(0.85 / Math.SQRT2);
    const margin = 1.06;
    return Math.min(
      size.width / (diagonal * margin),
      size.height / (diagonal * Math.sin(elevation) * margin),
    );
  }, [plan.width, plan.depth, size.width, size.height]);

  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    // Far enough back that nothing clips, high enough to read as a map.
    const reach = Math.max(plan.width, plan.depth);
    camera.position.set(
      target.current.x + reach,
      reach * 0.85,
      target.current.z + reach,
    );
    camera.lookAt(target.current);
    ortho.zoom = fit;
    ortho.updateProjectionMatrix();

    const canvas = gl.domElement;
    /**
     * Screen offset from the centre of the canvas, in plan units.
     *
     * The same mapping panning uses, so both agree about which way is which on
     * an isometric grid.
     */
    const planOffset = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left - rect.width / 2;
      const sy = clientY - rect.top - rect.height / 2;
      const perPixel = 1 / (fit * zoom.current);
      const moved = screenToPlan(sx, sy, azimuth.current ?? Math.PI / 4);
      return { x: moved.x * perPixel, z: moved.z * perPixel };
    };

    /** Zoom about a point, so whatever is under the cursor stays there. */
    const zoomAbout = (factor: number, clientX: number, clientY: number) => {
      const before = zoom.current;
      const after = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, before * factor));
      if (after === before) return;
      const offset = planOffset(clientX, clientY);
      const shift = 1 - before / after;
      target.current.x += offset.x * shift;
      target.current.z += offset.z * shift;
      zoom.current = after;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAbout(e.deltaY > 0 ? 0.88 : 1.14, e.clientX, e.clientY);
    };
    const spread = () => {
      const [a, b] = [...touches.current.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onDown = (e: PointerEvent) => {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        pinch.current = { distance: spread(), zoom: zoom.current };
        drag.current = null;
        return;
      }
      drag.current = { x: e.clientX, y: e.clientY };

      // Double tap zooms in, which is how anybody expects to get closer.
      const now = e.timeStamp;
      const previous = lastTap.current;
      if (
        previous &&
        now - previous.at < 320 &&
        Math.hypot(e.clientX - previous.x, e.clientY - previous.y) < 32
      ) {
        zoomAbout(2.1, e.clientX, e.clientY);
        lastTap.current = null;
      } else {
        lastTap.current = { at: now, x: e.clientX, y: e.clientY };
      }
    };

    const onMove = (e: PointerEvent) => {
      if (touches.current.has(e.pointerId)) {
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (pinch.current && touches.current.size === 2) {
        const [a, b] = [...touches.current.values()];
        const ratio = spread() / pinch.current.distance;
        const wanted = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.current.zoom * ratio));
        // Pinch about the midpoint between the fingers, as a map should.
        zoomAbout(wanted / zoom.current, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }

      const from = drag.current;
      if (!from) return;
      const scale = 1 / (fit * zoom.current);
      const moved = screenToPlan(
        (e.clientX - from.x) * scale,
        (e.clientY - from.y) * scale,
        azimuth.current ?? Math.PI / 4,
      );
      target.current.x -= moved.x;
      target.current.z -= moved.z;
      drag.current = { x: e.clientX, y: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2) pinch.current = null;
      drag.current = null;
    };

    /*
     * Keys, because a map you can only drag is a map somebody with a keyboard
     * cannot use. Arrows and WASD walk it; Q and E turn it.
     */
    const typing = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      const tag = node?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || node?.isContentEditable === true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'q' || key === 'e') {
        // Quarter-turns of the isometric grid, so the streets stay square to
        // the screen and the town never looks accidentally crooked.
        azimuthWanted.current += (key === 'q' ? -1 : 1) * (Math.PI / 4);
        e.preventDefault();
        return;
      }
      if (MOVE_KEYS.includes(key)) {
        held.current.add(key);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => held.current.delete(e.key.toLowerCase());
    const forgetKeys = () => held.current.clear();

    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    // A key held while the tab loses focus never sends its keyup.
    window.addEventListener('blur', forgetKeys);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', forgetKeys);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [camera, gl, plan, fit, zoom, azimuth, azimuthWanted]);

  useFrame((_, delta) => {
    const ortho = camera as THREE.OrthographicCamera;
    const reach = Math.max(plan.width, plan.depth);

    // Ease toward the wanted angle. A snap would be cheaper and would lose
    // which way the city just turned, which is the only thing a turn tells you.
    const drift = azimuthWanted.current - azimuth.current;
    azimuth.current += Math.abs(drift) < 1e-4 ? drift : drift * Math.min(1, delta * 7);
    const az = azimuth.current;

    if (held.current.size > 0) {
      const step = (reach * 0.45 * Math.min(delta, 0.05)) / zoom.current;
      let sx = 0;
      let sy = 0;
      for (const key of held.current) {
        if (key === 'arrowleft' || key === 'a') sx -= 1;
        if (key === 'arrowright' || key === 'd') sx += 1;
        if (key === 'arrowup' || key === 'w') sy -= 1;
        if (key === 'arrowdown' || key === 's') sy += 1;
      }
      if (sx !== 0 || sy !== 0) {
        // Walking moves the city the way the keys point, which is the opposite
        // of dragging it — hence the sign, and no, they are not the same thing.
        const moved = screenToPlan(sx * step, sy * step, az);
        target.current.x += moved.x;
        target.current.z += moved.z;
      }
    }

    /*
     * The camera stands on a circle around whatever it is looking at, at the
     * same height and distance whatever the angle, so turning is a turn rather
     * than a swoop.
     */
    const radius = reach * Math.SQRT2;
    camera.position.set(
      target.current.x + radius * Math.cos(az),
      reach * 0.85,
      target.current.z + radius * Math.sin(az),
    );
    camera.lookAt(target.current);
    const wanted = fit * zoom.current;
    if (Math.abs(ortho.zoom - wanted) > 1e-6) {
      ortho.zoom = wanted;
      ortho.updateProjectionMatrix();
    }
  });

  return null;
}

export default function CityMap({
  lots,
  timeOfDay = 'day',
}: {
  lots: OwnedLot[];
  timeOfDay?: TimeOfDay;
}) {
  const plan = useMemo(() => planCity(lots), [lots]);
  const palette = TIME_PALETTES[timeOfDay];
  const [hover, setHover] = useState<Hover>(null);
  /** Multiplier on the zoom that just fits the city; 1 shows the whole thing. */
  const zoom = useRef(1);
  const nudgeZoom = useCallback((factor: number) => {
    zoom.current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.current * factor));
  }, []);

  /*
   * Where the camera stands, and where it is going. Quarter-turns only: the
   * streets are laid out on a square grid, and any other angle leaves the whole
   * town looking as though it were hung crooked.
   */
  const azimuth = useRef(Math.PI / 4);
  const azimuthWanted = useRef(Math.PI / 4);
  const turn = useCallback((quarters: number) => {
    azimuthWanted.current += quarters * (Math.PI / 4);
  }, []);

  const [selected, setSelected] = useState<OwnedLot | null>(null);
  /*
   * Clicking shows the building rather than leaving for its page. A visitor
   * deciding whether to buy needs to see the shopfront, and pushing them out of
   * the map to find that out loses the thing the map is for.
   */
  const select = useCallback((lot: OwnedLot) => setSelected(lot), []);

  const reach = Math.max(plan.width, plan.depth);

  return (
    <>
      <Canvas
        shadows
        orthographic
        camera={{ near: -reach * 4, far: reach * 6, zoom: 1 }}
        style={{ background: palette.sky, position: 'absolute', inset: 0 }}
        dpr={[1, 2]}
      >
        {/*
          * Less fill, more sun. At 0.78 ambient the light reached every face
          * almost equally, so a thousand boxes had no form and the city read
          * flat however it was turned. Shape comes from the difference between
          * the side the sun is on and the side it is not.
          */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[reach, reach * 1.4, reach * 0.4]}
          intensity={1.35}
          color="#FFF6E5"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-reach}
          shadow-camera-right={reach}
          shadow-camera-top={reach}
          shadow-camera-bottom={-reach}
        />
        <Landscape plan={plan} timeOfDay={timeOfDay} />
        <Ground plan={plan} timeOfDay={timeOfDay} />
        <ParcelLines planned={plan.lots} zoom={zoom} />
        <Buildings
          planned={plan.lots}
          timeOfDay={timeOfDay}
          onHover={setHover}
          onSelect={select}
        />
        <MapControls plan={plan} zoom={zoom} azimuth={azimuth} azimuthWanted={azimuthWanted} />
      </Canvas>

      {/*
        * Explicit zoom, because a first-time visitor on a phone has no reason to
        * guess that pinching works, and at the whole-city zoom the buildings are
        * too small to tap.
        */}
      <div className="mw-map-zoom">
        <button type="button" onClick={() => nudgeZoom(1.7)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => nudgeZoom(1 / 1.7)} aria-label="Zoom out">
          −
        </button>
        {/*
          * Turning the city is the difference between a picture of a place and
          * somewhere you are standing. Buttons as well as keys, because a phone
          * has no Q and E.
          */}
        <button type="button" onClick={() => turn(-1)} aria-label="Turn left">
          ↺
        </button>
        <button type="button" onClick={() => turn(1)} aria-label="Turn right">
          ↻
        </button>
      </div>

      {selected && <LotPreview lot={selected} onClose={() => setSelected(null)} />}

      {hover && !selected && (
        <div
          className="mw-map-tip"
          style={{ left: hover.screenX + 14, top: hover.screenY + 14 }}
          aria-hidden="true"
        >
          <strong>{hover.lot.claimed ? hover.lot.signText : 'For sale'}</strong>
          <small>
            {hover.lot.address} ·{' '}
            {DISTRICTS.find((d) => d.slug === hover.lot.district)?.name ?? hover.lot.district}
          </small>
        </div>
      )}
    </>
  );
}

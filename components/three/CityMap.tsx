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
import { TIME_PALETTES, shade, type TimeOfDay } from '@/lib/palette';
import LotPreview from './LotPreview';

/*
 * An empty plot has to be clearly not-ground and clearly not-a-shop. Pale and
 * low against a darker ground reads as available; a taken lot stands up in its
 * owner's colour. That contrast is the whole point of the map.
 */
const UNSOLD = '#EDE8DA';
const UNSOLD_HEIGHT = 58;

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
  const mesh = useRef<THREE.InstancedMesh>(null);
  const palette = TIME_PALETTES[timeOfDay];

  /*
   * Position, size and colour baked once. An empty lot is a low pale slab and a
   * taken one stands at its full height in its owner's colour, so how full the
   * city is reads instantly from across the whole map.
   */
  useEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();

    planned.forEach((item, i) => {
      const lot = item.lot as OwnedLot;
      const taken = lot.claimed;
      const height = taken ? item.height : UNSOLD_HEIGHT;

      matrix.compose(
        new THREE.Vector3(item.x + item.w / 2, height / 2, item.y + item.d / 2),
        new THREE.Quaternion(),
        new THREE.Vector3(item.w, height, item.d),
      );
      instanced.setMatrixAt(i, matrix);
      instanced.setColorAt(i, colour.set(taken ? lot.facadeColor : UNSOLD));
    });

    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    /*
     * Raycasting and frustum culling both test the instanced mesh's bounding
     * sphere before looking at any instance. Left at the unit box the geometry
     * was built from, every pointer ray misses the whole city.
     */
    instanced.computeBoundingSphere();
  }, [planned, palette]);

  return (
    <instancedMesh
      ref={mesh}
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
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[plan.width / 2, -1, plan.depth / 2]}
        receiveShadow
      >
        <planeGeometry args={[plan.width * 2.4, plan.depth * 2.4]} />
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
}: {
  plan: ReturnType<typeof planCity>;
  zoom: React.RefObject<number>;
}) {
  const { camera, gl, size } = useThree();
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
      return {
        x: (sx + sy) * 0.7 * perPixel,
        z: (sy - sx) * 0.7 * perPixel,
      };
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
      // Screen drag to plan movement, along the two isometric axes.
      const scale = 1 / (fit * zoom.current);
      const dx = (e.clientX - from.x) * scale;
      const dy = (e.clientY - from.y) * scale;
      target.current.x -= (dx + dy) * 0.7;
      target.current.z -= (dy - dx) * 0.7;
      drag.current = { x: e.clientX, y: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2) pinch.current = null;
      drag.current = null;
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [camera, gl, plan, fit, zoom]);

  useFrame(() => {
    const ortho = camera as THREE.OrthographicCamera;
    const reach = Math.max(plan.width, plan.depth);
    camera.position.set(
      target.current.x + reach,
      reach * 0.85,
      target.current.z + reach,
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
        <ambientLight intensity={0.78} />
        <directionalLight
          position={[reach, reach * 1.4, reach * 0.4]}
          intensity={0.95}
          color="#FFF6E5"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-reach}
          shadow-camera-right={reach}
          shadow-camera-top={reach}
          shadow-camera-bottom={-reach}
        />
        <Ground plan={plan} timeOfDay={timeOfDay} />
        <ParcelLines planned={plan.lots} zoom={zoom} />
        <Buildings
          planned={plan.lots}
          timeOfDay={timeOfDay}
          onHover={setHover}
          onSelect={select}
        />
        <MapControls plan={plan} zoom={zoom} />
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

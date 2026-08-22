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
import { TIME_PALETTES, mixHex, shade, type TimeOfDay } from '@/lib/palette';

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

/** Isometric camera with wheel zoom and drag to pan. */
function MapControls({ plan }: { plan: ReturnType<typeof planCity> }) {
  const { camera, gl, size } = useThree();
  const target = useRef(new THREE.Vector3(plan.width / 2, 0, plan.depth / 2));
  /** Multiplier on the zoom that just fits the city; 1 shows the whole thing. */
  const zoom = useRef(1);
  const drag = useRef<{ x: number; y: number } | null>(null);

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
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom.current = Math.min(26, Math.max(0.85, zoom.current * (e.deltaY > 0 ? 0.88 : 1.14)));
    };
    const onDown = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
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
    const onUp = () => {
      drag.current = null;
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl, plan, fit]);

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

  const select = useCallback((lot: OwnedLot) => {
    window.location.href = `/lots/${encodeURIComponent(lot.address)}`;
  }, []);

  const reach = Math.max(plan.width, plan.depth);

  return (
    <div className="mw-map-stage">
      <Canvas
        shadows
        orthographic
        camera={{ near: -reach * 4, far: reach * 6, zoom: 1 }}
        style={{ background: palette.sky }}
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
        <Buildings
          planned={plan.lots}
          timeOfDay={timeOfDay}
          onHover={setHover}
          onSelect={select}
        />
        <MapControls plan={plan} />
      </Canvas>

      {hover && (
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
    </div>
  );
}

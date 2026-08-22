'use client';

/**
 * A walkable corner of Marlow, in three dimensions.
 *
 * A prototype: one junction, procedurally built, no models and no textures
 * beyond the shop signs. It exists to answer one question — whether a town
 * generated entirely from address hashes reads well in 3D, before anybody
 * spends money on art.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Building3D from './Building3D';
import {
  EYE_HEIGHT,
  JUNCTION_WIDTH,
  PAVEMENT_WIDTH,
  ROAD_WIDTH,
  layoutCorner,
} from '@/lib/town3d';
import type { Lot } from '@/lib/lots';
import { TIME_PALETTES, shade, type TimeOfDay } from '@/lib/palette';

/** Units per second on foot. */
const WALK_SPEED = 260;

function Ground({ corner, timeOfDay }: { corner: ReturnType<typeof layoutCorner>; timeOfDay: TimeOfDay }) {
  const palette = TIME_PALETTES[timeOfDay];
  // Long enough to run past wherever anybody can walk.
  const length = corner.mainLength + 2400;
  const sideLength = corner.sideLength + 200;

  return (
    <group>
      {/* A base under everything, so the town is not an island floating in sky */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[corner.junctionX, -0.4, 400]} receiveShadow>
        <planeGeometry args={[8000, 8000]} />
        <meshLambertMaterial color={shade(palette.sidewalk, 0.12)} />
      </mesh>

      {/* Main street: pavement in front of the frontage, road beyond it */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[length / 2 - 1200, 0.1, -PAVEMENT_WIDTH / 2]} receiveShadow>
        <planeGeometry args={[length, PAVEMENT_WIDTH]} />
        <meshLambertMaterial color={palette.sidewalk} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[length / 2 - 1200, 0, -PAVEMENT_WIDTH - ROAD_WIDTH / 2]}
        receiveShadow
      >
        <planeGeometry args={[length, ROAD_WIDTH]} />
        <meshLambertMaterial color={palette.road} />
      </mesh>

      {/* The side street running away between the two rows */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[corner.junctionX, 0.05, sideLength / 2]}
        receiveShadow
      >
        <planeGeometry args={[JUNCTION_WIDTH, sideLength]} />
        <meshLambertMaterial color={palette.road} />
      </mesh>
    </group>
  );
}

/** Walk with the arrow keys or WASD; drag to look about. */
function Walker() {
  const { camera, gl } = useThree();
  const held = useRef(new Set<string>());
  const yaw = useRef(0);
  const dragging = useRef<{ x: number; yaw: number } | null>(null);

  useEffect(() => {
    /*
     * Standing on the pavement looking along the street, shops on the right.
     * A camera in three.js looks down -Z at rest, so facing +X is a yaw of
     * -PI/2 and the forward vector is (-sin, 0, -cos) rather than (sin, cos).
     */
    /*
     * Standing in the road facing the shopfronts, because that is the view the
     * whole place is about — a storefront is what somebody is buying. Walking
     * left and right moves along the parade; the side street opens as you go.
     */
    camera.position.set(320, EYE_HEIGHT * 2.1, -PAVEMENT_WIDTH - ROAD_WIDTH * 3.2);
    yaw.current = Math.PI;

    const down = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      held.current.add(e.key.toLowerCase());
      if (e.key.startsWith('Arrow')) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => held.current.delete(e.key.toLowerCase());
    const blur = () => held.current.clear();

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);

    const canvas = gl.domElement;
    const pointerDown = (e: PointerEvent) => {
      dragging.current = { x: e.clientX, yaw: yaw.current };
    };
    const pointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      yaw.current = dragging.current.yaw - (e.clientX - dragging.current.x) * 0.004;
    };
    const pointerUp = () => {
      dragging.current = null;
    };
    canvas.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      canvas.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    const keys = held.current;
    const forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const strafe = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);

    if (forward || strafe) {
      const step = WALK_SPEED * delta;
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);
      camera.position.x += (-sin * forward + cos * strafe) * step;
      camera.position.z += (-cos * forward - sin * strafe) * step;
    }

    /*
     * Lifted and tilted a little rather than at true standing height. A road is
     * only so wide, and from the far kerb at eye level a three-storey shopfront
     * fills the whole frame — you cannot see the shop you came to look at.
     */
    camera.position.y = EYE_HEIGHT * 2.1;
    camera.rotation.set(-0.13, yaw.current, 0, 'YXZ');
  });

  return null;
}

export default function TownScene({
  main,
  side,
  timeOfDay,
}: {
  main: Lot[];
  side: Lot[];
  timeOfDay: TimeOfDay;
}) {
  const corner = useMemo(() => layoutCorner(main, side), [main, side]);
  const palette = TIME_PALETTES[timeOfDay];
  const night = timeOfDay === 'night';

  return (
    <Canvas
      shadows
      camera={{ fov: 62, near: 1, far: 6000 }}
      style={{ background: palette.sky }}
      dpr={[1, 2]}
    >
      <fog attach="fog" args={[palette.sky, 1400, 3600]} />
      <ambientLight intensity={night ? 0.45 : 0.85} color={night ? '#8FA0D0' : '#FFFFFF'} />
      <directionalLight
        position={[600, 900, -400]}
        intensity={night ? 0.25 : 1.05}
        color={night ? '#93A4D8' : '#FFF6E5'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-1200}
        shadow-camera-right={1200}
        shadow-camera-top={1200}
        shadow-camera-bottom={-1200}
      />
      <Ground corner={corner} timeOfDay={timeOfDay} />
      {corner.buildings.map((placed) => (
        <Building3D key={placed.lot.address} placed={placed} timeOfDay={timeOfDay} />
      ))}
      <Walker />
    </Canvas>
  );
}

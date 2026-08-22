'use client';

/**
 * One building, in three dimensions.
 *
 * Built entirely from geometry the address already implies — no models, no
 * textures beyond the sign, nothing bought or drawn by hand. The facade, roof,
 * window grid and doorway are the same derived numbers the flat renderer uses;
 * only the projection differs.
 *
 * Every detail plane is turned to face the street. A plane in three.js faces
 * +Z by default, which here points into the building — leave them alone and the
 * shopfronts are drawn on the inside of the back wall, and every building reads
 * as a blank slab.
 *
 * The sign is the exception and the point: it is a canvas texture carrying the
 * shop's real name, which is the thing an owner is paying for. In the flat town
 * a logo could never go on the street, because 120 inline images would be
 * megabytes. Here it is one small texture per shop.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { Placed3D } from '@/lib/town3d';
import { LIT_WINDOW, applyTimeTint, shade, tint, type TimeOfDay, TIME_PALETTES } from '@/lib/palette';

/** Text drawn to a canvas, so a sign reads as a sign rather than a coloured bar. */
function useSignTexture(text: string, board: string, ink: string) {
  return useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = board;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shrink to fit, the same rule the flat sign board follows.
    let size = 76;
    do {
      ctx.font = `600 ${size}px Fredoka, "Trebuchet MS", sans-serif`;
      size -= 2;
    } while (ctx.measureText(text).width > canvas.width * 0.9 && size > 16);

    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }, [text, board, ink]);
}

/** Roof geometry per type, extruded across the building's depth. */
function useRoof(type: string, width: number, depth: number, height: number) {
  return useMemo(() => {
    const shape = new THREE.Shape();
    if (type === 'pitched') {
      shape.moveTo(-width / 2, 0);
      shape.lineTo(0, height);
      shape.lineTo(width / 2, 0);
    } else if (type === 'curved') {
      shape.moveTo(-width / 2, 0);
      shape.quadraticCurveTo(0, height * 1.9, width / 2, 0);
    } else if (type === 'stepped') {
      shape.moveTo(-width / 2, 0);
      shape.lineTo(-width / 2, height * 0.45);
      shape.lineTo(-width * 0.26, height * 0.45);
      shape.lineTo(-width * 0.26, height);
      shape.lineTo(width * 0.26, height);
      shape.lineTo(width * 0.26, height * 0.45);
      shape.lineTo(width / 2, height * 0.45);
      shape.lineTo(width / 2, 0);
    } else {
      shape.moveTo(-width / 2, 0);
      shape.lineTo(-width / 2, height);
      shape.lineTo(width / 2, height);
      shape.lineTo(width / 2, 0);
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }, [type, width, depth, height]);
}

export default function Building3D({
  placed,
  timeOfDay,
}: {
  placed: Placed3D;
  timeOfDay: TimeOfDay;
}) {
  const { lot, width, height, depth, roofType, roofHeight } = placed;
  const palette = TIME_PALETTES[timeOfDay];
  const vacant = lot.status === 'vacant';

  const facade = applyTimeTint(vacant ? '#CFC9BE' : lot.facadeColor, palette);
  const accent = applyTimeTint(lot.accentColor, palette);
  const lit = palette.windowsLit !== 'none';

  const roof = useRoof(roofType, width, depth, roofHeight);
  const sign = useSignTexture(lot.signText, accent, '#1A1A1A');

  /* Window grid on the frontage, from the same derived rows and columns. */
  const windows = useMemo(() => {
    const out: { x: number; y: number; w: number; h: number }[] = [];
    if (vacant) return out;
    const margin = 20;
    const gap = 16;
    const w = (width - margin * 2 - gap * (placed.windowCols - 1)) / placed.windowCols;
    for (let row = 0; row < placed.windowRows; row++) {
      for (let col = 0; col < placed.windowCols; col++) {
        out.push({
          x: -width / 2 + margin + col * (w + gap) + w / 2,
          y: height - 46 - row * 62,
          w,
          h: 40,
        });
      }
    }
    return out;
  }, [vacant, width, height, placed.windowCols, placed.windowRows]);

  const openTop = placed.groundFloor - 56;

  return (
    <group position={[placed.x, 0, placed.z]} rotation={[0, placed.rotation, 0]}>
      {/* Facade block */}
      <mesh position={[0, height / 2, depth / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshLambertMaterial color={facade} />
      </mesh>

      {/* Roof */}
      <mesh geometry={roof} position={[0, height, depth / 2]} castShadow>
        <meshLambertMaterial color={shade(facade, 0.22)} />
      </mesh>

      {!vacant && (
        <>
          {/* Upper windows, sitting just proud of the frontage */}
          {windows.map((win, i) => (
            <mesh key={i} position={[win.x, win.y, -0.6]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[win.w, win.h]} />
              <meshBasicMaterial color={lit ? LIT_WINDOW : palette.glass} />
            </mesh>
          ))}

          {/* Shopfront glazing */}
          <mesh position={[0, openTop / 2 + 14, -0.6]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[width - 40, openTop - 20]} />
            <meshBasicMaterial color={lit ? LIT_WINDOW : palette.glass} />
          </mesh>

          {/* Door */}
          <mesh
            position={[-width / 2 + placed.doorX + placed.doorWidth / 2, openTop / 2, -1.2]}
            rotation={[0, Math.PI, 0]}
          >
            <planeGeometry args={[placed.doorWidth, openTop]} />
            <meshBasicMaterial color={accent} />
          </mesh>

          {/* Awning */}
          {placed.hasAwning && (
            <mesh position={[0, placed.groundFloor - 34, -14]} rotation={[-0.5, 0, 0]}>
              <boxGeometry args={[width - 26, 3, 30]} />
              <meshLambertMaterial color={tint(accent, 0.15)} />
            </mesh>
          )}

          {/* The sign: the thing an owner is actually buying */}
          {sign && (
            <mesh position={[0, placed.groundFloor + 6, -1.4]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[width * 0.72, width * 0.72 * 0.25]} />
              <meshBasicMaterial map={sign} toneMapped={false} />
            </mesh>
          )}
        </>
      )}

      {vacant && (
        <mesh position={[0, (height * 2) / 3 / 2, -1]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[width, (height * 2) / 3]} />
          <meshLambertMaterial color={applyTimeTint('#B49A76', palette)} />
        </mesh>
      )}
    </group>
  );
}

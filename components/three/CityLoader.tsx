'use client';

/**
 * Loads the city map only when somebody opens it.
 *
 * three.js cannot render on the server and is several hundred kilobytes, so no
 * other page pays for it.
 *
 * `children` sit beside the canvas rather than inside it, and deliberately so:
 * anything nested in a component imported with `ssr: false` never reaches the
 * server HTML, and the pitch has to be readable by a crawler.
 */

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import type { OwnedLot } from '@/lib/inventory';

const CityMap = dynamic(() => import('./CityMap'), {
  ssr: false,
  loading: () => <div className="mw-lab-loading">Drawing the city…</div>,
});

export default function CityLoader({
  lots,
  children,
}: {
  lots: OwnedLot[];
  children?: ReactNode;
}) {
  return (
    <div className="mw-map-stage">
      <CityMap lots={lots} />
      {children}
    </div>
  );
}

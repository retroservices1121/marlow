'use client';

/**
 * Loads the city map only when somebody opens it.
 *
 * three.js cannot render on the server and is several hundred kilobytes, so no
 * other page pays for it.
 */

import dynamic from 'next/dynamic';
import type { OwnedLot } from '@/lib/inventory';

const CityMap = dynamic(() => import('./CityMap'), {
  ssr: false,
  loading: () => <div className="mw-lab-loading">Drawing the city…</div>,
});

export default function CityLoader({ lots }: { lots: OwnedLot[] }) {
  return <CityMap lots={lots} />;
}

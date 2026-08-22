'use client';

/**
 * Client wrapper for the 3D prototype.
 *
 * three.js is several hundred kilobytes and cannot render on the server, so the
 * scene is loaded only when somebody opens this page. The flat town never pays
 * for it.
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { Lot } from '@/lib/lots';
import { TIMES_OF_DAY, type TimeOfDay } from '@/lib/palette';

const TownScene = dynamic(() => import('./TownScene'), {
  ssr: false,
  loading: () => <div className="mw-lab-loading">Building the street…</div>,
});

export default function TownLab({ main, side }: { main: Lot[]; side: Lot[] }) {
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');

  return (
    <>
      <div className="mw-controls" role="group" aria-label="Time of day">
        <p className="mw-legend">Time of day</p>
        {TIMES_OF_DAY.map((time) => (
          <button
            key={time}
            type="button"
            className="mw-chip"
            aria-pressed={timeOfDay === time}
            onClick={() => setTimeOfDay(time)}
          >
            {time}
          </button>
        ))}
      </div>

      <div className="mw-lab-stage">
        <TownScene main={main} side={side} timeOfDay={timeOfDay} />
      </div>
    </>
  );
}

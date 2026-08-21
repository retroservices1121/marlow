'use client';

/**
 * Demo page: the whole inventory rendered as one street, plus a manual
 * time-of-day override.
 *
 * The first render is always `day` so the server and the client agree; the
 * visitor's real local time is applied in an effect once mounted. Nothing is
 * persisted — reload and the street is byte-for-byte the same.
 */

import { useEffect, useMemo, useState } from 'react';
import Street from '@/components/Street';
import { generateLots } from '@/lib/lots';
import { TIMES_OF_DAY, currentTimeOfDay, type TimeOfDay } from '@/lib/palette';

type Mode = 'auto' | TimeOfDay;

const SSR_TIME: TimeOfDay = 'day';

export default function DemoPage() {
  const lots = useMemo(() => generateLots(), []);
  const [mode, setMode] = useState<Mode>('auto');
  const [clockTime, setClockTime] = useState<TimeOfDay>(SSR_TIME);

  useEffect(() => {
    setClockTime(currentTimeOfDay());
    // Re-check on the minute so a street left open rolls over into dusk.
    const timer = window.setInterval(() => setClockTime(currentTimeOfDay()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const timeOfDay: TimeOfDay = mode === 'auto' ? clockTime : mode;

  const sold = lots.filter((lot) => lot.status === 'sold').length;

  return (
    <main className="mw-page">
      <header className="mw-header">
        <h1 className="mw-title">Marlow</h1>
        <p className="mw-sub">
          {lots.length} lots across four streets, rendered from one data array. Every dimension is
          derived from the address, so the town is identical on every reload and every device.
        </p>
      </header>

      <div className="mw-controls" role="group" aria-label="Time of day">
        <p className="mw-legend" id="mw-tod-legend">
          Time of day
        </p>
        <button
          type="button"
          className="mw-chip"
          aria-pressed={mode === 'auto'}
          onClick={() => setMode('auto')}
        >
          Auto ({clockTime})
        </button>
        {TIMES_OF_DAY.map((time) => (
          <button
            key={time}
            type="button"
            className="mw-chip"
            aria-pressed={mode === time}
            onClick={() => setMode(time)}
          >
            {time}
          </button>
        ))}
      </div>

      <div className="mw-scroll" tabIndex={0} role="region" aria-label="Marlow street, scrollable">
        <Street lots={lots} timeOfDay={timeOfDay} />
      </div>

      <p className="mw-meta">
        {sold} sold · {lots.length - sold} vacant · showing {timeOfDay}
        {mode === 'auto' ? ' (from your clock)' : ' (override)'} · scroll sideways to walk the street
      </p>
    </main>
  );
}

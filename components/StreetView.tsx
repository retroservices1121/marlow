'use client';

/**
 * The street plus its time-of-day control.
 *
 * Split out of the demo page so the page itself can stay a server component and
 * read the inventory from the database. Only the control needs to be a client
 * component; the drawing is the same pure renderer either way.
 */

import { useEffect, useMemo, useState } from 'react';
import Street from './Street';
import type { Lot } from '@/lib/lots';
import { TIMES_OF_DAY, currentTimeOfDay, type TimeOfDay } from '@/lib/palette';

type Mode = 'auto' | TimeOfDay;

/** First render is always `day` so the server and the client agree. */
const SSR_TIME: TimeOfDay = 'day';

export default function StreetView({ lots, linkBuildings = true }: { lots: Lot[]; linkBuildings?: boolean }) {
  const [mode, setMode] = useState<Mode>('auto');
  const [clockTime, setClockTime] = useState<TimeOfDay>(SSR_TIME);

  useEffect(() => {
    setClockTime(currentTimeOfDay());
    // Re-check on the minute so a street left open rolls over into dusk.
    const timer = window.setInterval(() => setClockTime(currentTimeOfDay()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const timeOfDay: TimeOfDay = mode === 'auto' ? clockTime : mode;
  const hrefForLot = useMemo(
    () => (linkBuildings ? (lot: Lot) => `/lots/${encodeURIComponent(lot.address)}` : undefined),
    [linkBuildings],
  );

  return (
    <>
      <div className="mw-controls" role="group" aria-label="Time of day">
        <p className="mw-legend">Time of day</p>
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
        <Street lots={lots} timeOfDay={timeOfDay} hrefForLot={hrefForLot} />
      </div>
    </>
  );
}

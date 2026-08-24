/**
 * How busy the town is, at the top of the page.
 *
 * Social proof only works upward. A live counter is a promise that there is
 * something going on, and one reading nought breaks that promise in the most
 * visible place on the site — so nothing is rendered at all until there is
 * somebody to count. bids.city currently shows "0 watching" on its front page,
 * which is a good demonstration of the failure.
 *
 * A server component: the numbers are already fetched on the server, cached for
 * a minute, and putting them in the HTML means they are there for the first
 * paint rather than arriving late and pushing the street down the page.
 */

import type { TownBusyness } from '@/lib/visitors';

export default function TownBusy({ busy }: { busy: TownBusyness | null }) {
  if (!busy) return null;

  const showOnline = busy.online > 0;
  const showWeek = busy.week > 0;
  if (!showOnline && !showWeek) return null;

  return (
    <p className="mw-busy" role="status">
      {showOnline && (
        <span className="mw-busy-live">
          <span className="mw-busy-dot" aria-hidden="true" />
          <strong>{busy.online.toLocaleString()}</strong>{' '}
          {busy.online === 1 ? 'person' : 'people'} in Marlow now
        </span>
      )}
      {showOnline && showWeek && <span className="mw-busy-sep"> · </span>}
      {showWeek && (
        <span>
          <strong>{busy.week.toLocaleString()}</strong>{' '}
          {busy.week === 1 ? 'visit' : 'visits'} this week
        </span>
      )}
    </p>
  );
}

/**
 * How many people are in the town, from DataFast.
 *
 * Read on the server with a website key that never reaches the browser. The
 * public tag in the page carries a website *id*, which is meant to be seen; the
 * key here reads private analytics and is a different kind of thing entirely.
 * Marlow has already published one of these by mistake, and the reason it
 * happened is that both start with "df" and only one is safe to show.
 *
 * Cached for a minute. The figure is decoration, and a decoration that costs a
 * third-party round trip on every page render would make the whole town slower
 * for everybody in order to tell them how many people are in it.
 *
 * Nothing here can break a page. A provider that is down, rate-limiting, or has
 * quietly changed its response shape returns null and the count is simply not
 * shown — which is also what happens when the number is zero, because a live
 * counter reading nought is worse than no counter at all.
 */

const API = 'https://datafa.st/api/v1';

/** How long a count is reused before asking again. */
const CACHE_SECONDS = 60;

export type TownBusyness = {
  /** People on the site right now. */
  online: number;
  /** People who have visited today. */
  today: number;
};

/**
 * Digs a number out of a response without insisting on its exact shape.
 *
 * The API's own documentation does not publish the field names, and guessing
 * one and hard-failing on the rest would mean a silent zero the first time they
 * rename anything. Any of the plausible spellings will do; none of them being
 * present is reported honestly as "no idea" rather than as "nobody here".
 */
function findCount(payload: unknown, keys: string[]): number | null {
  if (!payload || typeof payload !== 'object') return null;

  /*
   * Arrays first, because that is what actually comes back:
   * {"status":"success","data":[{"visitors":9}]}. An array is an object to
   * typeof, so without this the walk stepped into it, found no named field,
   * and reported "no idea" — rendering nothing, with real numbers sitting one
   * bracket away. Found by calling the API rather than by reading the code.
   */
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findCount(item, keys);
      if (found !== null) return found;
    }
    return null;
  }

  const record = payload as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }

  // One level down, for the common `{ status, data: { ... } }` envelope.
  for (const nested of ['data', 'result', 'analytics']) {
    const inner = record[nested];
    if (inner && typeof inner === 'object') {
      const found = findCount(inner, keys);
      if (found !== null) return found;
    }
  }
  return null;
}

async function ask(path: string): Promise<unknown | null> {
  const key = process.env.DATAFAST_API_KEY;
  if (!key) return null;

  try {
    const response = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: CACHE_SECONDS },
    });
    if (!response.ok) {
      const reason = (await response.text().catch(() => '')).slice(0, 200);
      console.error(`[visitors] ${path} refused: HTTP ${response.status} ${reason}`);
      return null;
    }
    return await response.json();
  } catch (e) {
    console.error('[visitors] request failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Today, in UTC — one town, one clock. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The two numbers worth showing, or null if neither can be had.
 *
 * Null rather than zeroes, deliberately: "nobody is here" and "we could not
 * ask" look identical to a visitor and mean opposite things to us.
 */
export async function townBusyness(): Promise<TownBusyness | null> {
  if (!process.env.DATAFAST_API_KEY) return null;

  const day = today();
  const [live, overview] = await Promise.all([
    ask('/analytics/realtime'),
    ask(`/analytics/overview?startAt=${day}&endAt=${day}`),
  ]);

  const online = findCount(live, ['visitors', 'activeVisitors', 'active_visitors', 'count', 'realtime']);
  const visitors = findCount(overview, ['visitors', 'uniqueVisitors', 'unique_visitors', 'count']);

  if (online === null && visitors === null) return null;

  return {
    online: Math.max(0, online ?? 0),
    today: Math.max(0, visitors ?? 0),
  };
}

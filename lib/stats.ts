/**
 * How a shopfront is doing.
 *
 * The numbers an owner actually wants: how many people opened their building,
 * how many went on to their site, and which social link is doing the work.
 * That last one is the useful one — it is the difference between "people like
 * my shop" and "people click through to Instagram and never to my website".
 *
 * Deliberately counters and nothing else. No visitor is identified, stored or
 * followed between pages; there is nothing here that could tell an owner *who*
 * looked, only how many times somebody did. That is all the question needs, and
 * a public town collecting more than it needs is how a nice idea turns nasty.
 */

import { getDb } from './db';
import { isRealAddress } from './lot-store';
import { SOCIAL_PLATFORMS, type SocialKey } from './store-profile';

export const STAT_KINDS = ['view', 'link', 'social'] as const;
export type StatKind = (typeof STAT_KINDS)[number];

/** The window an owner is shown. Long enough to have a shape, short enough to mean now. */
export const STAT_DAYS = 30;

export type LotStats = {
  /** Opens of the storefront page. */
  views: number;
  /** Click-throughs to the owner's own site. */
  linkClicks: number;
  /** Click-throughs per social platform, busiest first. */
  socialClicks: { key: SocialKey; label: string; clicks: number }[];
  /** Every social click added together. */
  socialTotal: number;
  days: number;
};

function isKind(value: unknown): value is StatKind {
  return typeof value === 'string' && (STAT_KINDS as readonly string[]).includes(value);
}

/**
 * Records one thing happening.
 *
 * Returns quietly on anything it does not recognise rather than throwing: this
 * is called from a beacon nobody is waiting on, and a bad request should cost a
 * page nothing. An invented address would also plant a row for a lot that does
 * not exist, which the foreign key would refuse anyway — better to not ask.
 */
export async function recordStat(
  address: string,
  kind: unknown,
  target?: unknown,
): Promise<boolean> {
  if (!isKind(kind) || !isRealAddress(address)) return false;

  // Only a real platform key may be a target, so the column cannot be filled
  // with whatever a caller felt like sending.
  let column = '';
  if (kind === 'social') {
    const key = typeof target === 'string' ? target : '';
    if (!SOCIAL_PLATFORMS.some((p) => p.key === key)) return false;
    column = key;
  }

  const db = await getDb();
  await db.query(
    `insert into lot_stats (address, day, kind, target, count)
          values ($1, (now() at time zone 'utc')::date, $2, $3, 1)
     on conflict (address, day, kind, target)
            do update set count = lot_stats.count + 1`,
    [address, kind, column],
  );
  return true;
}

/** The last `days` days for one shop. */
export async function statsFor(address: string, days = STAT_DAYS): Promise<LotStats> {
  const db = await getDb();
  const rows = await db.query<{ kind: string; target: string; total: string }>(
    `select kind, target, sum(count) as total
       from lot_stats
      where address = $1
        and day > (now() at time zone 'utc')::date - $2::int
      group by kind, target`,
    [address, days],
  );

  const total = (kind: string, target = '') =>
    Number(rows.find((r) => r.kind === kind && r.target === target)?.total ?? 0);

  const socialClicks = SOCIAL_PLATFORMS.map((platform) => ({
    key: platform.key as SocialKey,
    label: platform.label,
    clicks: total('social', platform.key),
  }))
    .filter((s) => s.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks);

  return {
    views: total('view'),
    linkClicks: total('link'),
    socialClicks,
    socialTotal: socialClicks.reduce((n, s) => n + s.clicks, 0),
    days,
  };
}

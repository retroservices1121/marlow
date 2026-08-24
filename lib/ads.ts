/**
 * The three vehicles, and who is riding on them.
 *
 * Four of them: a blimp over the town and three vehicles on the road.
 *
 * Kept apart from lots on purpose. A shopfront is bought once and cannot be
 * taken away; a vehicle panel is rented from whoever pays most, and its holder
 * can be displaced. Those are opposite promises, and the surest way to keep
 * both is never to let one borrow the other's code.
 */

import { createHash, randomUUID } from 'crypto';
import { getDb } from './db';
import type { VehicleKind } from '@/components/Vehicle';
import {
  isAllowedLogoType,
  logoProblem,
  normalizeUrl,
  sniffImageType,
} from './store-profile';

/** In the order they are offered: highest and most visible first. */
export const VEHICLE_KINDS: VehicleKind[] = ['blimp', 'led', 'pickup', 'van'];

/** What each vehicle is called where somebody has to read it. */
export const VEHICLE_LABEL: Record<VehicleKind, string> = {
  blimp: 'The blimp',
  led: 'The screen truck',
  pickup: 'The pickup',
  van: 'The van',
};

export type AdSlot = {
  kind: VehicleKind;
  /** Floor price, in whole cents. */
  minBidCents: number;
  /** What the standing holder paid. Zero when nobody has bid. */
  bidCents: number;
  /** Whether anybody's artwork is on it at all. */
  taken: boolean;
  url: string | null;
  /** Served from our own origin; null while the panel is empty. */
  adUrl: string | null;
  /**
   * The smallest bid that would take this vehicle, worked out here.
   *
   * Carried on the slot rather than computed where it is drawn, because the
   * street is a client component: importing the function that knows this would
   * pull this module, and the database driver behind it, into the browser
   * bundle. It did, and the build said so — `Can't resolve 'dns'`.
   */
  nextCents: number;
};

function isKind(value: unknown): value is VehicleKind {
  return VEHICLE_KINDS.includes(value as VehicleKind);
}

/** A bid moves in whole dollars. */
export const BID_STEP_CENTS = 100;

/**
 * What the smallest winning bid would be, in whole cents.
 *
 * A whole dollar more than the standing bid, not a penny more. A one-cent
 * increment turns an auction into a typing contest — the winner is whoever is
 * willing to sit there adding pennies, and every bid is worth almost exactly
 * what the last one was. A dollar makes each bid mean something and keeps the
 * numbers on the page readable.
 *
 * Below the floor nothing counts at all.
 */
export function nextBidCents(slot: AdSlot): number {
  return Math.max(slot.minBidCents, slot.bidCents + BID_STEP_CENTS);
}

/** All three vehicles, in the order they drive. */
export async function adSlots(): Promise<AdSlot[]> {
  const db = await getDb();
  const rows = await db.query<{
    kind: string;
    min_bid_cents: number;
    bid_cents: number;
    url: string | null;
    image_hash: string | null;
  }>('select kind, min_bid_cents, bid_cents, url, image_hash from ad_slots');

  const byKind = new Map(rows.filter((r) => isKind(r.kind)).map((r) => [r.kind as VehicleKind, r]));

  return VEHICLE_KINDS.map((kind) => {
    const row = byKind.get(kind);
    const minBidCents = Number(row?.min_bid_cents ?? 0);
    const bidCents = Number(row?.bid_cents ?? 0);
    return {
      kind,
      minBidCents,
      bidCents,
      nextCents: Math.max(minBidCents, bidCents + BID_STEP_CENTS),
      taken: Boolean(row?.image_hash),
      // Re-validated on the way out: a row written before a rule tightened must
      // not reach an href unchecked.
      url: normalizeUrl(row?.url),
      adUrl: row?.image_hash ? `/api/ad/${kind}?v=${row.image_hash}` : null,
    };
  });
}

export type StoredAdImage = { bytes: Buffer; contentType: string; hash: string };

export async function adImage(kind: string): Promise<StoredAdImage | null> {
  if (!isKind(kind)) return null;
  const db = await getDb();
  const row = await db.one<{ bytes: Uint8Array; content_type: string; hash: string }>(
    'select bytes, content_type, hash from ad_images where kind = $1',
    [kind],
  );
  if (!row) return null;
  return {
    // node-postgres hands back a Buffer, PGlite a Uint8Array.
    bytes: Buffer.from(row.bytes),
    contentType: row.content_type,
    hash: row.hash,
  };
}

/* ---- Bidding ----------------------------------------------------------- */

export type BidResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** What Polar is told to charge, and what comes back on the webhook. */
export type PendingBid = { id: string; kind: VehicleKind; cents: number };

/**
 * Records an intention to bid, with the artwork it would put up.
 *
 * Nothing is awarded here and no money has moved: this is the row a payment
 * will later point at. It is written before the checkout so that the moment a
 * payment settles there is a picture ready to go up, rather than a won slot
 * driving round blank while its owner is asked for one.
 *
 * The amount is checked here and fixed on the checkout, so the number somebody
 * agreed to is the number they are charged.
 */
export async function openBid(input: {
  kind: string;
  cents: number;
  email: string;
  url: unknown;
  artwork: Uint8Array;
}): Promise<BidResult<PendingBid>> {
  if (!isKind(input.kind)) return { ok: false, error: 'No such vehicle.' };

  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) return { ok: false, error: 'An email is required.' };

  const url = normalizeUrl(input.url);
  if (!url) return { ok: false, error: 'A working web address is required.' };

  const problem = logoProblem(input.artwork);
  if (problem) return { ok: false, error: problem };
  const contentType = sniffImageType(input.artwork);
  if (!contentType || !isAllowedLogoType(contentType)) {
    return { ok: false, error: 'Artwork must be a PNG, JPEG or WebP image.' };
  }

  const slots = await adSlots();
  const slot = slots.find((s) => s.kind === input.kind);
  if (!slot) return { ok: false, error: 'No such vehicle.' };

  const needed = nextBidCents(slot);
  if (!Number.isInteger(input.cents) || input.cents < needed) {
    return { ok: false, error: `That vehicle needs at least ${(needed / 100).toFixed(2)}.` };
  }

  const bytes = Buffer.from(input.artwork);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  const id = randomUUID();

  const db = await getDb();
  await db.query(
    `insert into ad_bids (id, kind, email, cents, won, url, bytes, content_type, hash)
          values ($1, $2, $3, $4, false, $5, $6, $7, $8)`,
    [id, input.kind, email, input.cents, url, bytes, contentType, hash],
  );

  return { ok: true, value: { id, kind: input.kind, cents: input.cents } };
}

/**
 * A bid has been paid for. Decide whether it wins the vehicle.
 *
 * Called only from the payment webhook, and written so that calling it twice
 * with the same bid changes nothing the second time — Polar sends both
 * `order.paid` and `checkout.updated` for a single sale, and a slot that
 * changed hands twice on one payment would be a slot somebody paid once for.
 *
 * A losing bid keeps its money. That is the rule this auction is run under and
 * it is stated plainly wherever anybody can bid; what it must never do is lose
 * the record, which is why the row is kept either way.
 */
export async function settleBid(bidId: string): Promise<
  BidResult<{
    kind: VehicleKind;
    won: boolean;
    cents: number;
    email: string;
    /** Whoever this bid pushed off the vehicle, if it pushed anybody off. */
    displaced: string | null;
    /**
     * Whether this call is the one that settled it.
     *
     * Polar sends two events for a single sale. Both reach here, and the second
     * must be able to say "already done" — otherwise the winner is congratulated
     * twice and the loser is told twice that they lost, which is worse.
     */
    fresh: boolean;
  }>
> {
  const db = await getDb();

  const bid = await db.one<{
    id: string;
    kind: string;
    email: string;
    cents: number;
    paid: boolean;
    won: boolean;
    url: string | null;
    bytes: Uint8Array | null;
    content_type: string | null;
    hash: string | null;
  }>('select * from ad_bids where id = $1', [bidId]);

  if (!bid) return { ok: false, error: 'No such bid.' };
  if (!isKind(bid.kind)) return { ok: false, error: 'No such vehicle.' };

  /*
   * Already settled: report what happened rather than doing it again, and
   * report nobody displaced. Polar sends two events for one sale, and telling
   * somebody twice that they lost their slot is its own small cruelty.
   */
  if (bid.paid) {
    return {
      ok: true,
      value: {
        kind: bid.kind,
        won: bid.won,
        cents: Number(bid.cents),
        email: bid.email,
        displaced: null,
        fresh: false,
      },
    };
  }

  const slot = await db.one<{ bid_cents: number; min_bid_cents: number; holder_email: string | null }>(
    'select bid_cents, min_bid_cents, holder_email from ad_slots where kind = $1',
    [bid.kind],
  );
  const standing = Number(slot?.bid_cents ?? 0);
  const heldBy = slot?.holder_email ?? null;
  const floor = Number(slot?.min_bid_cents ?? 0);
  const cents = Number(bid.cents);
  const won = cents >= floor && cents > standing;

  await db.query(
    'update ad_bids set paid = true, paid_at = now(), won = $2, beaten_cents = $3 where id = $1',
    [bidId, won, standing],
  );

  if (won && bid.bytes && bid.content_type && bid.hash) {
    await db.query(
      `insert into ad_images (kind, bytes, content_type, hash, updated_at)
            values ($1, $2, $3, $4, now())
       on conflict (kind) do update
              set bytes = excluded.bytes,
                  content_type = excluded.content_type,
                  hash = excluded.hash,
                  updated_at = now()`,
      [bid.kind, Buffer.from(bid.bytes), bid.content_type, bid.hash],
    );
    await db.query(
      `update ad_slots
          set bid_cents = $2, holder_email = $3, url = $4, image_hash = $5,
              since = now(), updated_at = now()
        where kind = $1`,
      [bid.kind, cents, bid.email, bid.url, bid.hash],
    );
  }

  /*
   * Only somebody who actually lost something is displaced: not the winner
   * outbidding themselves, and not the empty seat on a vehicle nobody held.
   */
  const displaced =
    won && heldBy && heldBy.toLowerCase() !== bid.email.toLowerCase() ? heldBy : null;

  return { ok: true, value: { kind: bid.kind, won, cents, email: bid.email, displaced, fresh: true } };
}

/** Who held a vehicle before a given moment — the person to tell they lost it. */
export async function previousHolder(kind: VehicleKind): Promise<string | null> {
  const db = await getDb();
  const row = await db.one<{ holder_email: string | null }>(
    'select holder_email from ad_slots where kind = $1',
    [kind],
  );
  return row?.holder_email ?? null;
}

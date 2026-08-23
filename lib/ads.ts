/**
 * The three vehicles, and who is riding on them.
 *
 * Kept apart from lots on purpose. A shopfront is bought once and cannot be
 * taken away; a vehicle panel is rented from whoever pays most, and its holder
 * can be displaced. Those are opposite promises, and the surest way to keep
 * both is never to let one borrow the other's code.
 */

import { getDb } from './db';
import type { VehicleKind } from '@/components/Vehicle';
import { normalizeUrl } from './store-profile';

export const VEHICLE_KINDS: VehicleKind[] = ['led', 'pickup', 'van'];

/** What each vehicle is called where somebody has to read it. */
export const VEHICLE_LABEL: Record<VehicleKind, string> = {
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
};

function isKind(value: unknown): value is VehicleKind {
  return VEHICLE_KINDS.includes(value as VehicleKind);
}

/**
 * What the smallest winning bid would be, in whole cents.
 *
 * A bid has to beat the standing one outright — equalling it does nothing, and
 * a slot that changed hands on a tie would be decided by whoever refreshed
 * fastest. Below the floor nothing counts at all.
 */
export function nextBidCents(slot: AdSlot): number {
  return Math.max(slot.minBidCents, slot.bidCents + 1);
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
    return {
      kind,
      minBidCents: Number(row?.min_bid_cents ?? 0),
      bidCents: Number(row?.bid_cents ?? 0),
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

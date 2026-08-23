/**
 * Polar's webhook: money settled, so hand over the lot.
 *
 * This is the paid twin of `npm run grant`. Both end at the same call —
 * `purchaseLotForEmail` — because a bought lot and a given lot are the same
 * thing to everything downstream: held against an email until whoever owns that
 * address signs in and claims it. That path is already proven end to end, so
 * the only new risk lives in this file: trusting a request that says it is
 * Polar, and finding the address in what it sends.
 *
 * Verification is done by hand against the Standard Webhooks spec rather than
 * by pulling in Polar's SDK. It is thirty lines of HMAC, and every dependency
 * added here has to clear Railway's CVE gate on each deploy — the last one cost
 * a day and an upgrade of Next.
 *
 * Nothing here trusts the body until the signature over it checks out, and the
 * signature is computed over the exact bytes received, which is why the body is
 * read as text and never as JSON first.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { purchaseLotForEmail } from '@/lib/lot-store';
import { settleBid } from '@/lib/ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Polar retries a 5xx and gives up on a 2xx, which decides every return here. */
const OK = () => new Response(null, { status: 204 });

/** How far out of date a signed timestamp may be, in seconds. */
const TOLERANCE = 5 * 60;

/**
 * The signing key, as bytes — every reading of the secret that is in use.
 *
 * This cost a real customer their lot. Standard Webhooks says the secret is
 * base64 behind a `whsec_` prefix, so the first version stripped the prefix and
 * tried the bytes both ways. Polar signs with something else, and every genuine
 * delivery was rejected while my own hand-rolled test signatures passed — which
 * is exactly the shape of bug that testing against yourself cannot find.
 *
 * So all four readings are tried and whichever verifies wins. This gives away
 * nothing: an attacker still has to possess the secret, and which encoding of
 * it they possess was never the thing keeping them out. A webhook that
 * *quietly* refuses real money is far more dangerous than one that accepts a
 * correctly-signed request under a spelling it did not expect.
 *
 * `matchedKey` records which one worked so the mystery is answered in the logs
 * rather than guessed at again later.
 */
export const KEY_READINGS = ['raw', 'raw-bare', 'base64', 'base64-bare'] as const;
export type KeyReading = (typeof KEY_READINGS)[number];

function candidateKeys(secret: string): { reading: KeyReading; key: Buffer }[] {
  const full = secret.trim();
  const bare = full.startsWith('whsec_') ? full.slice(6) : full;
  const all: { reading: KeyReading; key: Buffer }[] = [
    { reading: 'raw', key: Buffer.from(full, 'utf8') },
    { reading: 'raw-bare', key: Buffer.from(bare, 'utf8') },
    { reading: 'base64', key: Buffer.from(full, 'base64') },
    { reading: 'base64-bare', key: Buffer.from(bare, 'base64') },
  ];
  return all.filter((c) => c.key.length > 0);
}

function signaturesMatch(expected: Buffer, header: string): boolean {
  // `v1,<base64>` entries, space separated — there may be several during a
  // secret rotation, and any one of them matching is a pass.
  for (const part of header.split(' ')) {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) continue;
    const given = Buffer.from(value, 'base64');
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

/** Which reading of the secret verified, or null if none did. */
function verify(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  header: string,
): KeyReading | null {
  const signed = `${id}.${timestamp}.${body}`;
  for (const { reading, key } of candidateKeys(secret)) {
    if (signaturesMatch(createHmac('sha256', key).update(signed).digest(), header)) return reading;
  }
  return null;
}

/* ---- Finding the two things that matter in the payload ---- */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

/**
 * The lot being bought.
 *
 * Polar copies checkout metadata onto the order, but which object carries it
 * depends on the event, so every place it can legitimately appear is checked
 * rather than guessing one and failing silently after taking somebody's money.
 */
/**
 * The bid a payment is for, if it is for a bid at all.
 *
 * Ads and lots come through the same webhook and are told apart by which piece
 * of metadata is present. A payment carrying neither is money that arrived with
 * no idea what it bought, and is logged rather than guessed at.
 */
function bidIn(data: Json): string | null {
  const sources = [obj(data.metadata), obj(obj(data.checkout)?.metadata), obj(obj(data.order)?.metadata)];
  for (const source of sources) {
    const found = source && str(source.bid_id);
    if (found) return found;
  }
  return null;
}

function addressIn(data: Json): string | null {
  const sources = [
    obj(data.metadata),
    obj(obj(data.checkout)?.metadata),
    obj(obj(data.subscription)?.metadata),
    obj(obj(data.order)?.metadata),
  ];
  for (const source of sources) {
    const found = source && (str(source.address) ?? str(source.lot) ?? str(source.lot_address));
    if (found) return found;
  }
  return null;
}

/** The buyer's email — the only handle on them until they sign in. */
function emailIn(data: Json): string | null {
  return (
    str(obj(data.customer)?.email) ??
    str(data.customer_email) ??
    str(obj(data.checkout)?.customer_email) ??
    str(obj(data.user)?.email) ??
    null
  );
}

/** Events that mean the money is actually settled. */
function isPaid(type: string, data: Json): boolean {
  if (type === 'order.paid') return true;
  // Belt and braces if the instance is configured to send checkout events
  // instead. `purchaseLotForEmail` is idempotent for the same buyer, so
  // handling both cannot double-sell a lot.
  if (type === 'checkout.updated') return str(data.status) === 'succeeded';
  return false;
}

export async function POST(req: Request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[polar] POLAR_WEBHOOK_SECRET is not set; refusing the delivery');
    return new Response('not configured', { status: 503 });
  }

  const id = req.headers.get('webhook-id');
  const timestamp = req.headers.get('webhook-timestamp');
  const signature = req.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) {
    return new Response('missing signature headers', { status: 400 });
  }

  // A replayed delivery is still correctly signed; the timestamp is what stops
  // one being useful days later.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE) {
    return new Response('stale timestamp', { status: 400 });
  }

  const body = await req.text();
  const reading = verify(secret, id, timestamp, body, signature);
  if (!reading) {
    // The id is logged so a rejected delivery can be found in Polar's dashboard
    // and redelivered once the cause is understood.
    console.error(`[polar] signature did not verify; delivery ${id} rejected`);
    return new Response('bad signature', { status: 401 });
  }

  let event: Json;
  try {
    event = JSON.parse(body) as Json;
  } catch {
    return new Response('unparseable body', { status: 400 });
  }

  const type = str(event.type) ?? '';
  const data = obj(event.data) ?? {};

  if (!isPaid(type, data)) return OK();

  /*
   * An ad bid settles on its own terms: it may win the vehicle or it may lose
   * it, and losing is not a failure to be retried — the money is kept and the
   * bid is recorded either way, which is the rule the auction is run under and
   * stated plainly wherever anybody can bid.
   */
  const bidId = bidIn(data);
  if (bidId) {
    const settled = await settleBid(bidId);
    if (!settled.ok) {
      console.error(`[polar] PAID BUT UNFULFILLED ${type} bid=${bidId} — ${settled.error}`);
      return OK();
    }
    const { kind, won, cents, email: bidder } = settled.value;
    console.log(
      `[polar] bid ${bidId} on ${kind} for ${(cents / 100).toFixed(2)} by ${bidder}: ${won ? 'WON' : 'outbid already'} (${type}, key=${reading})`,
    );
    return OK();
  }

  const address = addressIn(data);
  const email = emailIn(data);

  /*
   * Past this point the money is real. Nothing below returns 5xx: a retry
   * cannot supply a missing address or free a taken lot, so a failure here
   * needs a person, not another delivery. It is logged loudly with the Polar
   * id so it can be found and refunded.
   */
  if (!address || !email) {
    console.error(
      `[polar] PAID BUT UNFULFILLED ${type} id=${str(data.id) ?? '?'} — ` +
        `address=${address ?? 'MISSING'} email=${email ? 'present' : 'MISSING'}`,
    );
    return OK();
  }

  const result = await purchaseLotForEmail(address, email, 'purchase');
  if (!result.ok) {
    console.error(
      `[polar] PAID BUT UNFULFILLED ${type} id=${str(data.id) ?? '?'} — ` +
        `${address} for ${email}: ${result.error}`,
    );
    return OK();
  }

  console.log(`[polar] ${address} sold to ${email} (${type}, key=${reading})`);
  return OK();
}

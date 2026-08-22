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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Polar retries a 5xx and gives up on a 2xx, which decides every return here. */
const OK = () => new Response(null, { status: 204 });

/** How far out of date a signed timestamp may be, in seconds. */
const TOLERANCE = 5 * 60;

/**
 * The signing key, as bytes.
 *
 * Standard Webhooks secrets are base64 behind a `whsec_` prefix, but Polar has
 * shown them both ways. Both readings are derived from the same secret, so
 * accepting either costs nothing an attacker could use — they would still need
 * the secret — and spares a silent, total verification failure that looks
 * exactly like a wrong URL.
 */
function candidateKeys(secret: string): Buffer[] {
  const bare = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keys = [Buffer.from(bare, 'utf8')];
  try {
    const decoded = Buffer.from(bare, 'base64');
    if (decoded.length > 0) keys.push(decoded);
  } catch {
    /* not base64; the utf8 reading stands alone */
  }
  return keys;
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

function verify(secret: string, id: string, timestamp: string, body: string, header: string) {
  const signed = `${id}.${timestamp}.${body}`;
  return candidateKeys(secret).some((key) =>
    signaturesMatch(createHmac('sha256', key).update(signed).digest(), header),
  );
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
  if (!verify(secret, id, timestamp, body, signature)) {
    console.error('[polar] signature did not verify; delivery rejected');
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

  console.log(`[polar] ${address} sold to ${email} (${type})`);
  return OK();
}

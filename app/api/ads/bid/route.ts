/**
 * Take a bid for one of the vehicles, and send the bidder to pay for it.
 *
 * A POST with the artwork attached, so the picture is captured before any money
 * moves. Paying first and asking for the picture afterwards leaves a won
 * vehicle driving past everybody blank for as long as it takes the winner to
 * come back.
 *
 * No account needed, exactly as with a lot: the slot is held against the email
 * given here, and that address is also how somebody is told when they lose it.
 */

import { openBid } from '@/lib/ads';
import { createAdCheckout, SITE } from '@/lib/polar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Codes, never text: a query string must not put words of its own on our page. */
export type BidProblem =
  | 'bad-vehicle'
  | 'bad-email'
  | 'bad-url'
  | 'bad-artwork'
  | 'too-low'
  | 'checkout-failed';

function back(problem: BidProblem, detail?: string) {
  const query = detail ? `?problem=${problem}&at=${encodeURIComponent(detail)}` : `?problem=${problem}`;
  return Response.redirect(new URL(`/ads${query}`, SITE), 303);
}

export async function POST(req: Request) {
  const form = await req.formData();

  const kind = String(form.get('kind') ?? '');
  const email = String(form.get('email') ?? '');
  const url = form.get('url');
  const dollars = Number(form.get('amount'));
  const file = form.get('artwork');

  if (!(file instanceof File) || file.size === 0) return back('bad-artwork', kind);
  if (!Number.isFinite(dollars)) return back('too-low', kind);

  // Whole cents, never floats: a third of a penny is how rounding errors get
  // into an auction where the difference between winning and losing is a cent.
  const cents = Math.round(dollars * 100);
  const artwork = new Uint8Array(await file.arrayBuffer());

  const bid = await openBid({ kind, cents, email, url, artwork });
  if (!bid.ok) {
    // The message is already written for a person; the page maps the code, so
    // only the shape of the failure crosses the query string.
    if (bid.error.includes('vehicle')) return back('bad-vehicle', kind);
    if (bid.error.includes('email')) return back('bad-email', kind);
    if (bid.error.includes('web address')) return back('bad-url', kind);
    if (bid.error.includes('at least')) return back('too-low', kind);
    return back('bad-artwork', kind);
  }

  const checkout = await createAdCheckout(bid.value);
  if (!checkout.ok) return back('checkout-failed', kind);

  return Response.redirect(checkout.url, 303);
}

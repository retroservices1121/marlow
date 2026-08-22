/**
 * Start a checkout for one lot.
 *
 * A POST rather than a link, because a GET that creates a checkout session is a
 * thing every crawler that finds the page will do — several hundred times.
 *
 * No account is needed to get here. Buying before signing in is deliberate: the
 * lot is held against whatever email is given at checkout, and becomes editable
 * when somebody proves they own that address. Requiring an account first would
 * put a signup between a visitor and their money.
 */

import { buildInventory } from '@/lib/inventory';
import { getOverrides, isRealAddress } from '@/lib/lot-store';
import { addressSlug } from '@/lib/lots';
import { createCheckout, SITE } from '@/lib/polar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Back to the lot with a reason, so a refusal is never a blank page.
 *
 * A code, never a message. The lot page turns it into words. Reflecting text
 * straight from the query string would let anyone hand out a marlow.town link
 * that displays whatever sentence they liked on our own page.
 */
export type Problem = 'unknown-address' | 'already-taken' | 'checkout-failed';

function back(address: string | null, problem: Problem) {
  const to = address
    ? `/${addressSlug(address)}?problem=${problem}`
    : `/street/main-street?problem=${problem}`;
  return Response.redirect(new URL(to, SITE), 303);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const address = String(form.get('address') ?? '').trim();

  if (!address || !isRealAddress(address)) return back(null, 'unknown-address');

  // Re-read the lot rather than trusting the form: the page may have been open
  // for an hour, and taking money for a lot that sold in the meantime is the
  // one failure with no clean fix afterwards.
  const lot = buildInventory(await getOverrides()).find((l) => l.address === address);
  if (!lot) return back(null, 'unknown-address');
  if (lot.claimed || lot.awaitingOwner) return back(address, 'already-taken');

  const checkout = await createCheckout(lot);
  if (!checkout.ok) return back(address, 'checkout-failed');

  return Response.redirect(checkout.url, 303);
}

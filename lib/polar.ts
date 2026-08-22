/**
 * Polar: turning a lot into a checkout.
 *
 * The price of a lot lives in `pricing.ts` and is what a visitor is shown. What
 * they are actually charged lives in Polar, in a product created by hand in a
 * dashboard. Those are two systems that can drift apart, and the way they drift
 * is the worst kind: the town advertising a $200 corner while Polar quietly
 * charges $15 for it. Nothing else in the codebase would notice.
 *
 * So the mapping is checked in here, next to nothing else, and `verifyProducts`
 * asks Polar what each product really costs and refuses to agree unless every
 * one matches `priceFor`. That check is worth more than the mapping.
 *
 * Nine products for nine kinds of lot, mirroring the `PRICES` table exactly.
 * Two of them cost the same $40 — a corner in a cheap district is worth about a
 * mid-street address in a good one — and they are still separate products,
 * because which one sells is a thing worth being able to see.
 */

import { DISTRICTS, addressSlug, type Standing, type Tier } from './lots';
import { priceFor, standingOf } from './pricing';

const API = 'https://api.polar.sh';

/** Where Polar sends a buyer back to. */
export const SITE = process.env.MARLOW_URL ?? 'https://marlow.town';

/**
 * (standing, tier) → Polar product.
 *
 * Checked in rather than spread across nine environment variables: nine env
 * vars is nine chances at a silent typo with nothing reviewing it, and a wrong
 * id here takes money for the wrong lot.
 */
export const PRODUCTS: Record<Standing, Record<Tier, string>> = {
  downtown: {
    corner: 'c74bc0f9-a6a7-4282-994d-8f3afb4d20e8', // $200
    main: '7ed9e4ca-081b-4120-9617-7a5625ff7056', // $120
    side: 'e70ae8a3-4207-423d-a868-87c993d5ae64', // $75
  },
  central: {
    corner: 'e61350d3-a444-41cb-bc17-db53cb4cdefa', // $100
    main: 'f25b9ee3-6ba3-458b-b41d-93558a6197b8', // $60
    side: 'b28d5872-c84a-448a-a26f-e7c90deaf580', // $40
  },
  outer: {
    corner: 'ce2ea90b-1d6a-4e5e-828b-3771e1b046ec', // $40
    main: 'c18afc94-88ec-4ac7-b49c-2f170dc376c0', // $25
    side: '45a65635-2c5b-463e-b8af-03808940aa8b', // $15
  },
};

export type Sellable = { address: string; tier: Tier; district: string };

export function productFor(lot: Sellable): string {
  return PRODUCTS[standingOf(lot.district)][lot.tier];
}

/** Whether selling is switched on at all. */
export function salesEnabled(): boolean {
  return Boolean(process.env.POLAR_ACCESS_TOKEN);
}

type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * A checkout for exactly one lot.
 *
 * The address travels as metadata, and that is the only thread tying the
 * payment back to what was bought — the webhook has nothing else to go on. If
 * it is ever dropped here, the money arrives with no idea what it was for.
 */
export async function createCheckout(lot: Sellable): Promise<CheckoutResult> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'Buying is not switched on yet.' };

  let response: Response;
  try {
    response = await fetch(`${API}/v1/checkouts/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        products: [productFor(lot)],
        success_url: `${SITE}/${addressSlug(lot.address)}?bought=1`,
        metadata: { address: lot.address },
      }),
    });
  } catch (e) {
    console.error('[polar] checkout request failed:', e instanceof Error ? e.message : e);
    return { ok: false, error: 'Could not reach the checkout. Try again in a moment.' };
  }

  if (!response.ok) {
    console.error(`[polar] checkout refused for ${lot.address}: HTTP ${response.status}`);
    return { ok: false, error: 'Could not start the checkout.' };
  }

  const body = (await response.json()) as { url?: unknown };
  return typeof body.url === 'string'
    ? { ok: true, url: body.url }
    : { ok: false, error: 'Checkout came back without a link.' };
}

/* ---- The check that matters ---- */

export type ProductCheck = {
  standing: Standing;
  tier: Tier;
  productId: string;
  expected: number;
  actual: number | null;
  name: string | null;
  ok: boolean;
};

/**
 * Asks Polar what each product really costs and compares it with ours.
 *
 * Run by `npm run verify:polar`. A mismatch is not a warning — it means the
 * price on the page is a lie, in one direction or the other.
 */
export async function verifyProducts(): Promise<ProductCheck[]> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) throw new Error('POLAR_ACCESS_TOKEN is not set');

  const res = await fetch(`${API}/v1/products/?limit=100&is_archived=false`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Polar returned HTTP ${res.status} listing products`);

  const body = (await res.json()) as {
    items?: { id: string; name: string; prices?: { price_amount?: number }[] }[];
  };
  const byId = new Map((body.items ?? []).map((p) => [p.id, p]));

  const checks: ProductCheck[] = [];
  for (const standing of ['downtown', 'central', 'outer'] as Standing[]) {
    for (const tier of ['corner', 'main', 'side'] as Tier[]) {
      const productId = PRODUCTS[standing][tier];
      const product = byId.get(productId);
      // Any district with this standing prices the same, so the first will do.
      const district = DISTRICTS.find((d) => d.standing === standing);
      const expected = priceFor({ tier, district: district?.slug ?? '' });
      const actual = product?.prices?.[0]?.price_amount ?? null;
      checks.push({
        standing,
        tier,
        productId,
        expected,
        actual,
        name: product?.name ?? null,
        ok: actual === expected,
      });
    }
  }
  return checks;
}

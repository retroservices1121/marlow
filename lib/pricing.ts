/**
 * What a lot costs.
 *
 * The ends were set deliberately: $100 for the best address in the city, $15
 * for the cheapest. The top was $200 at first, which asked somebody to trust an
 * unproven town with a week's lunch money before a single shop had opened on
 * it. A ceiling can go back up once the streets have people on them; a price
 * nobody pays teaches you nothing. Everything between is a business decision, so it is written
 * as an explicit table rather than derived from multipliers — multipliers were
 * producing prices like $37.50, and nobody sets a price that way.
 *
 * Two axes, and deliberately the two a visitor can already see before paying:
 *
 *   standing   which district it is in — Downtown, central, outer
 *   tier       where on the street it sits — corner, main, side
 *
 * A price nobody can see the reason for is arbitrary, and a corner is only
 * worth more if you can tell it is a corner.
 *
 * Money is in whole cents throughout. Prices are never floats — a third of a
 * penny is how rounding errors get into invoices.
 */

import { DISTRICTS, type Standing, type Tier } from './lots';

export const CURRENCY = 'USD';

/**
 * What each kind of lot costs, in whole cents.
 *
 * Change a number here and it moves everywhere: the map card, the lot page and
 * whatever checkout is wired up later. Every row must fall left to right and
 * every column must fall top to bottom, and there are checks that say so.
 */
const PRICES: Record<Standing, Record<Tier, number>> = {
  downtown: { corner: 10_000, main: 6_000, side: 4_000 },
  central: { corner: 5_000, main: 3_000, side: 2_000 },
  outer: { corner: 2_500, main: 2_000, side: 1_500 },
};

export type Priced = { tier: Tier; district: string };

export function standingOf(districtSlug: string): Standing {
  return DISTRICTS.find((d) => d.slug === districtSlug)?.standing ?? 'outer';
}

/** Price in whole cents. */
export function priceFor(lot: Priced): number {
  return PRICES[standingOf(lot.district)][lot.tier];
}

/** "$200" — trailing zeroes dropped, because every price here is whole dollars. */
export function formatPrice(cents: number): string {
  const whole = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: whole % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(whole);
}

export function priceLabel(lot: Priced): string {
  return formatPrice(priceFor(lot));
}

/** Every distinct price in the city, cheapest first — for a pricing table. */
export function priceRange(): { standing: Standing; tier: Tier; cents: number }[] {
  const rows: { standing: Standing; tier: Tier; cents: number }[] = [];
  for (const standing of ['downtown', 'central', 'outer'] as Standing[]) {
    for (const tier of ['corner', 'main', 'side'] as Tier[]) {
      rows.push({ standing, tier, cents: PRICES[standing][tier] });
    }
  }
  return rows.sort((a, b) => a.cents - b.cents);
}

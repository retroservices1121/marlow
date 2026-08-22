/**
 * What a lot costs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE NUMBERS BELOW ARE PROVISIONAL. They were chosen to make the shape of the
 * model visible, not because anybody decided them. Change `BASE` and
 * `TIER_MULTIPLIER` and every price in the product follows.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two axes, because that is what a visitor can actually see on the map:
 *
 *   standing   which district it is in — Downtown, central, outer
 *   tier       where on the street it sits — corner, main, side
 *
 * Both are visible before anyone pays. That matters: a price nobody can see the
 * reason for is arbitrary, and a corner is only worth more if you can tell it
 * is a corner.
 *
 * Money is in whole cents throughout. Prices are never floats — a third of a
 * penny is how rounding errors get into invoices.
 */

import { DISTRICTS, type Standing, type Tier } from './lots';

export const CURRENCY = 'USD';

/** Cents, per district standing. */
const BASE: Record<Standing, number> = {
  downtown: 12_000,
  central: 6_000,
  outer: 3_000,
};

/** Applied to the base for where the lot sits on its street. */
const TIER_MULTIPLIER: Record<Tier, number> = {
  corner: 2.5,
  main: 1.5,
  side: 1,
};

export type Priced = { tier: Tier; district: string };

export function standingOf(districtSlug: string): Standing {
  return DISTRICTS.find((d) => d.slug === districtSlug)?.standing ?? 'outer';
}

/** Price in whole cents. */
export function priceFor(lot: Priced): number {
  return Math.round(BASE[standingOf(lot.district)] * TIER_MULTIPLIER[lot.tier]);
}

/** "$300" — trailing zeroes dropped, because every price here is whole dollars. */
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
      rows.push({ standing, tier, cents: Math.round(BASE[standing] * TIER_MULTIPLIER[tier]) });
    }
  }
  return rows.sort((a, b) => a.cents - b.cents);
}

/**
 * Every address in Marlow, and the way you find one you can afford.
 *
 * The street itself is 33 phone screens end to end, so walking it is not a way
 * to shop. Worse, walking starts on Main Street, which is Downtown — so the
 * first thing anybody sees is the most expensive stock in the town, and the 304
 * lots at $15 are twenty minutes of scrolling away in a district they have no
 * reason to visit.
 *
 * So: pick a price, get the lots at that price, click one. The price is on
 * every tile too, because having to open a building to find out what it costs
 * is the same problem in miniature.
 *
 * Filtering is a query parameter and a set of links, not client state. It works
 * with JavaScript off, every filtered view is linkable, and the unfiltered page
 * stays exactly what it was: the complete, crawlable index of the town.
 */

import Link from 'next/link';
import { buildInventory, type OwnedLot } from '@/lib/inventory';
import { getOverrides } from '@/lib/lot-store';
import { currentUser } from '@/lib/session';
import { DISTRICTS, addressSlug } from '@/lib/lots';
import { formatPrice, priceFor, priceRange } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

/** The distinct prices in the town, cheapest first, deduplicated. */
function pricePoints(): number[] {
  return [...new Set(priceRange().map((r) => r.cents))].sort((a, b) => a - b);
}

/** "15" → 1500 cents, but only if it is a price something actually costs. */
function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const cents = Math.round(Number(raw) * 100);
  return Number.isFinite(cents) && pricePoints().includes(cents) ? cents : null;
}

function href(price: number | null, showTaken: boolean): string {
  const parts: string[] = [];
  if (price !== null) parts.push(`price=${price / 100}`);
  if (showTaken) parts.push('show=all');
  return parts.length > 0 ? `/streets?${parts.join('&')}` : '/streets';
}

export default async function StreetsPage({
  searchParams,
}: {
  searchParams: Promise<{ price?: string; show?: string }>;
}) {
  const [user, overrides, query] = await Promise.all([
    currentUser(),
    getOverrides(),
    searchParams,
  ]);

  const all = buildInventory(overrides);
  const price = parsePrice(query.price);
  // Picking a price is shopping, so sold lots get out of the way unless asked
  // for. With no price chosen this stays the full index of the town.
  const showTaken = price === null || query.show === 'all';

  const matches = (lot: OwnedLot) =>
    (price === null || priceFor(lot) === price) && (showTaken || !lot.claimed);

  const shown = all.filter(matches);
  const forSaleHere = shown.filter((l) => !l.claimed).length;

  return (
    <main className="mw-page mw-narrow">
      <h1 className="mw-title">Every address</h1>
      <p className="mw-sub">
        {all.length} lots across {DISTRICTS.length} districts.{' '}
        {all.filter((l) => !l.claimed).length} still for sale.{' '}
        <Link href="/city">See the whole city</Link>.
      </p>

      <nav className="mw-filter" aria-label="Filter by price">
        <span className="mw-filter-label">Price</span>
        <Link
          className="mw-filter-chip"
          href={href(null, false)}
          aria-current={price === null ? 'true' : undefined}
        >
          Any
        </Link>
        {pricePoints().map((cents) => (
          <Link
            key={cents}
            className="mw-filter-chip"
            href={href(cents, false)}
            aria-current={price === cents ? 'true' : undefined}
          >
            {formatPrice(cents)}
          </Link>
        ))}
      </nav>

      {price !== null && (
        <p className="mw-sub">
          <strong>
            {forSaleHere} {forSaleHere === 1 ? 'lot' : 'lots'} for sale at {formatPrice(price)}
          </strong>
          {' · '}
          {showTaken ? (
            <Link href={href(price, false)}>Hide the ones already taken</Link>
          ) : (
            <Link href={href(price, true)}>Show the ones already taken too</Link>
          )}
        </p>
      )}

      {shown.length === 0 && (
        <p className="mw-sub">
          Nothing left at that price. <Link href={href(null, false)}>Look at everything</Link>.
        </p>
      )}

      {DISTRICTS.map((district) => {
        const inDistrict = shown.filter((l) => l.district === district.slug);
        if (inDistrict.length === 0) return null;

        return (
          <section key={district.slug}>
            <h2 className="mw-district-heading">
              {district.name}
              <small>{district.standing}</small>
            </h2>

            {district.streets.map((street) => {
              const run = inDistrict.filter((l) => l.street === street.name);
              if (run.length === 0) return null;
              const available = run.filter((l) => !l.claimed).length;

              return (
                <section key={street.name} className="mw-street-section">
                  <h2 className="mw-street-heading">
                    {street.name}
                    <small>
                      {available} of {run.length} for sale
                    </small>
                  </h2>
                  <ul className="mw-address-grid">
                    {run.map((lot) => {
                      const mine = user !== null && lot.ownerId === user.id;
                      const state = mine ? 'yours' : lot.claimed ? 'taken' : 'for sale';
                      return (
                        <li key={lot.address}>
                          <Link
                            href={`/${addressSlug(lot.address)}`}
                            className={`mw-address mw-address-${state.replace(' ', '-')}`}
                          >
                            <span className="mw-address-no">{lot.number}</span>
                            <span className="mw-address-name">
                              {lot.claimed ? lot.signText : 'For sale'}
                            </span>
                            {/* What it costs, without having to open it. */}
                            {!lot.claimed && (
                              <span className="mw-address-price">{formatPrice(priceFor(lot))}</span>
                            )}
                            {lot.claimed && lot.tier === 'corner' && (
                              <span className="mw-address-tier">corner</span>
                            )}
                          </Link>
                          <Link
                            className="mw-address-locate"
                            href={`/street/${street.slug}?lot=${encodeURIComponent(lot.address)}`}
                            aria-label={`Show ${lot.address} on the street`}
                          >
                            show
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </section>
        );
      })}
    </main>
  );
}

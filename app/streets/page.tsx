/**
 * Every address in Marlow, by street.
 *
 * The street itself is 33 phone screens end to end, so browsing it is not a way
 * to find anything. This is: what exists, what is still for sale, and a link
 * straight to each building's place on the street.
 */

import Link from 'next/link';
import { buildInventory } from '@/lib/inventory';
import { getOverrides } from '@/lib/lot-store';
import { currentUser } from '@/lib/session';
import { STREETS } from '@/lib/lots';

export const dynamic = 'force-dynamic';

export default async function StreetsPage() {
  const [user, overrides] = await Promise.all([currentUser(), getOverrides()]);
  const lots = buildInventory(overrides);
  const forSale = lots.filter((l) => !l.claimed).length;

  return (
    <main className="mw-page mw-narrow">
      <h1 className="mw-title">Every address</h1>
      <p className="mw-sub">
        {lots.length} lots across {STREETS.length} streets. {forSale} still for sale.{' '}
        <Link href="/demo">Walk the street instead</Link>.
      </p>

      {STREETS.map((street) => {
        const run = lots.filter((l) => l.street === street.name);
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
                      href={`/lots/${encodeURIComponent(lot.address)}`}
                      className={`mw-address mw-address-${state.replace(' ', '-')}`}
                    >
                      <span className="mw-address-no">{lot.number}</span>
                      <span className="mw-address-name">
                        {lot.claimed ? lot.signText : 'For sale'}
                      </span>
                      {lot.tier === 'corner' && <span className="mw-address-tier">corner</span>}
                    </Link>
                    <Link
                      className="mw-address-locate"
                      href={`/demo?lot=${encodeURIComponent(lot.address)}`}
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
    </main>
  );
}

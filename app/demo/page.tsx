/**
 * The street.
 *
 * A server component: it reads whatever owners have saved and lays it over the
 * generated inventory. With an empty database this renders exactly the town the
 * renderer shipped with, which is the property the whole storage layer is built
 * to preserve.
 */

import Link from 'next/link';
import StreetView from '@/components/StreetView';
import { buildInventory } from '@/lib/inventory';
import { getOverrides } from '@/lib/lot-store';

export const dynamic = 'force-dynamic';

export default async function DemoPage() {
  const lots = buildInventory(await getOverrides());
  const claimed = lots.filter((lot) => lot.claimed).length;
  const forSale = lots.filter((lot) => lot.status === 'vacant').length;

  return (
    <main className="mw-page">
      <header className="mw-header">
        <h1 className="mw-title">Marlow</h1>
        <p className="mw-sub">
          {lots.length} lots across four streets, rendered from one data array. Every dimension is
          derived from the address, so the town is identical on every reload and every device — only
          the colours, signs and lit windows ever change.
        </p>
        <p className="mw-sub">
          Click any building to see its lot. <Link href="/register">Take an empty one</Link> and
          decide what gets built there.
        </p>
      </header>

      <StreetView lots={lots} />

      <p className="mw-meta">
        {claimed} claimed · {forSale} for sale · scroll sideways to walk the street
      </p>
    </main>
  );
}

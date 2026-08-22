/**
 * The whole city at once.
 *
 * The surface Marlow is really sold from: every lot visible together, so how
 * much is taken and how much is left reads at a glance, and one position can be
 * compared against another. A street view can never do that.
 */

import Link from 'next/link';
import CityLoader from '@/components/three/CityLoader';
import { buildInventory } from '@/lib/inventory';
import { getOverrides } from '@/lib/lot-store';
import { DISTRICTS } from '@/lib/lots';

export const dynamic = 'force-dynamic';

export default async function CityPage() {
  const lots = buildInventory(await getOverrides());
  const taken = lots.filter((lot) => lot.claimed).length;
  const share = Math.round((taken / lots.length) * 100);

  return (
    <main className="mw-page">
      <header className="mw-header">
        <h1 className="mw-title">Marlow</h1>
        <p className="mw-sub">
          {lots.length} addresses across {DISTRICTS.length} districts.{' '}
          <strong>
            {taken} taken · {lots.length - taken} still for sale
          </strong>
          . Drag to move, scroll to zoom, click a building to see its lot — or{' '}
          <Link href="/street/main-street">walk a street</Link> instead.
        </p>
        <div className="mw-fill" role="img" aria-label={`${share} per cent of Marlow is taken`}>
          <span style={{ width: `${Math.max(share, 1)}%` }} />
        </div>
      </header>

      <CityLoader lots={lots} />

      <p className="mw-meta">
        Tall and coloured is taken; low and pale is for sale.{' '}
        <Link href="/streets">Browse every address</Link>.
      </p>
    </main>
  );
}

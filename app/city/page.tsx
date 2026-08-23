/**
 * The whole city at once.
 *
 * The surface Marlow is really sold from: every lot visible together, so how
 * much is taken and how much is left reads at a glance, and one position can be
 * compared against another. A street view can never do that.
 */

import Link from 'next/link';
import CityLoader from '@/components/three/CityLoader';
import MarlowIntro from '@/components/MarlowIntro';
import { buildInventory } from '@/lib/inventory';
import { getOverrides } from '@/lib/lot-store';
import { DISTRICTS } from '@/lib/lots';

export const dynamic = 'force-dynamic';

export default async function CityPage() {
  const lots = buildInventory(await getOverrides());
  const taken = lots.filter((lot) => lot.claimed).length;

  return (
    <main className="mw-page mw-page-flush">
      {/* Kept for crawlers and for anyone arriving with the canvas unpainted. */}
      <h1 className="mw-visually-hidden">
        Marlow — {lots.length} shopfronts across {DISTRICTS.length} districts, {lots.length - taken}{' '}
        still for sale
      </h1>

      <CityLoader lots={lots}>
        <MarlowIntro total={lots.length} taken={taken} districts={DISTRICTS.length} />
      </CityLoader>

      <p className="mw-meta">
        Painted is taken; bare stone is still for sale.{' '}
        <Link href="/streets">Browse every address</Link> or{' '}
        <Link href="/street/main-street">walk a street</Link>.
      </p>
    </main>
  );
}

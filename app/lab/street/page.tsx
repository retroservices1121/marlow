/**
 * Prototype: a walkable corner of Marlow in three dimensions.
 *
 * Deliberately off to one side at /lab. The flat town stays exactly as it is
 * while this answers one question — whether a town generated entirely from
 * address hashes reads well in 3D, before anybody spends money on art.
 */

import Link from 'next/link';
import TownLab from '@/components/three/TownLab';
import { buildInventory } from '@/lib/inventory';
import { getOverrides } from '@/lib/lot-store';

export const dynamic = 'force-dynamic';

export default async function StreetLabPage() {
  const lots = buildInventory(await getOverrides());
  const main = lots.filter((l) => l.street === 'Main Street').slice(0, 7);
  const side = lots.filter((l) => l.street === 'Willow Lane').slice(0, 6);

  return (
    <main className="mw-page">
      <header className="mw-header">
        <h1 className="mw-title">Marlow in 3D</h1>
        <p className="mw-sub">
          A prototype of one corner. Every building here is the same address, the same frontage and
          the same roof as on <Link href="/street/main-street">the flat street</Link> — the shapes
          come from the address hash, so only the projection has changed. No models, no textures,
          nothing bought: it is all generated.
        </p>
        <p className="mw-sub">
          <strong>W A S D</strong> or the arrow keys to walk, drag to look around.
        </p>
      </header>

      <TownLab main={main} side={side} />
    </main>
  );
}

/** Everything the signed-in user owns. */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildInventory } from '@/lib/inventory';
import { getOverrides } from '@/lib/lot-store';
import { addressSlug } from '@/lib/lots';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function LotsPage() {
  const user = await currentUser();
  if (!user) redirect('/login?next=%2Flots');

  const mine = buildInventory(await getOverrides()).filter((lot) => lot.ownerId === user.id);

  return (
    <main className="mw-page mw-narrow">
      <h1 className="mw-title">Your lots</h1>
      <p className="mw-sub">Signed in as {user.email}.</p>

      <p className="mw-sub">
        One free lot per account while Marlow is finding its feet. Anything given to you or bought
        is on top of that.
      </p>

      {mine.length === 0 ? (
        <p className="mw-sub">
          You do not own anything yet. <Link href="/demo">Walk the street</Link> and pick an empty
          lot — the boarded-up ones are for sale.
        </p>
      ) : (
        <ul className="mw-lot-list">
          {mine.map((lot) => (
            <li key={lot.address}>
              <Link href={`/${addressSlug(lot.address)}`}>
                <span
                  className="mw-lot-chip"
                  style={{ background: lot.facadeColor, borderColor: lot.accentColor }}
                  aria-hidden="true"
                />
                <strong>{lot.signText}</strong>
                <small>{lot.address}</small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

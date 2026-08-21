/**
 * One lot: its details, and — if you own it — the editor.
 *
 * Three states. Yours: edit it. Someone else's: look at it. Unclaimed: take it.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import LotEditor from '@/components/LotEditor';
import ClaimButton from '@/components/ClaimButton';
import { saveAction } from '@/app/actions';
import { buildInventory } from '@/lib/inventory';
import { getOverrides, isRealAddress } from '@/lib/lot-store';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const TIER_LABEL: Record<string, string> = {
  corner: 'Main Street corner',
  main: 'Main Street',
  side: 'Side street',
};

export default async function LotPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = await params;
  const address = decodeURIComponent(raw);
  if (!isRealAddress(address)) notFound();

  const [user, overrides] = await Promise.all([currentUser(), getOverrides()]);
  const lot = buildInventory(overrides).find((l) => l.address === address);
  if (!lot) notFound();

  const isMine = user !== null && lot.ownerId === user.id;

  return (
    <main className="mw-page mw-narrow">
      <p className="mw-crumb">
        <Link href="/demo">← Back to the street</Link>
      </p>

      <h1 className="mw-title">{lot.address}</h1>
      <p className="mw-sub">
        {TIER_LABEL[lot.tier] ?? lot.tier} ·{' '}
        {lot.claimed ? (isMine ? 'Yours' : 'Taken') : 'For sale'}
      </p>

      {isMine ? (
        <>
          <p className="mw-sub">
            Changes go live on the street as soon as you save. The shape of the building comes from
            the address itself, so it stays recognisably this lot whatever you choose.
          </p>
          <LotEditor lot={lot} action={saveAction} />
        </>
      ) : lot.claimed ? (
        <p className="mw-sub">
          <strong>{lot.signText}</strong> trades here. This lot already has an owner.
        </p>
      ) : (
        <>
          <p className="mw-sub">
            Nothing is built here yet. Claim it and you choose the sign, the colours and what kind
            of building goes up.
          </p>
          <ClaimButton address={lot.address} signedIn={user !== null} />
        </>
      )}
    </main>
  );
}

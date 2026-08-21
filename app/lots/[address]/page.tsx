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
import { FREE_LOTS_PER_ACCOUNT, freeClaimCount, getOverrides, isRealAddress } from '@/lib/lot-store';
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
  // Say up front that the allowance is spent, rather than refusing after a click.
  const allowanceSpent =
    user !== null && !isMine && (await freeClaimCount(user.id)) >= FREE_LOTS_PER_ACCOUNT;

  return (
    <main className="mw-page mw-narrow">
      <p className="mw-crumb">
        <Link href="/demo">← Back to the street</Link>
      </p>

      <h1 className="mw-title">{lot.address}</h1>
      <p className="mw-sub">
        {TIER_LABEL[lot.tier] ?? lot.tier} ·{' '}
        {isMine ? 'Yours' : lot.awaitingOwner ? 'Sold' : lot.claimed ? 'Taken' : 'For sale'}
      </p>

      {isMine ? (
        <>
          <p className="mw-sub">
            Changes go live on the street as soon as you save. The shape of the building comes from
            the address itself, so it stays recognisably this lot whatever you choose.
          </p>
          <LotEditor lot={lot} action={saveAction} />
        </>
      ) : lot.awaitingOwner ? (
        <p className="mw-sub">
          This lot has been bought but its owner has not signed in yet. Nothing is built here until
          they do — sign in with the email used at checkout to take it over.
        </p>
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
          {allowanceSpent ? (
            <p className="mw-sub">
              You already have your free lot on Marlow. <Link href="/lots">Release it</Link> if you
              would rather have this one instead.
            </p>
          ) : (
            <ClaimButton address={lot.address} signedIn={user !== null} />
          )}
        </>
      )}
    </main>
  );
}

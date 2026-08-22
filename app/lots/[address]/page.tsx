/**
 * A building's page: what it is, who trades there, and what you can do about it.
 *
 * This is where a click on the street lands, so it has to be worth arriving at —
 * the actual building, the owner's name, and the state of the lot.
 *
 * The owner's email is never shown. Anyone can read this page.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import BuildingPortrait from '@/components/BuildingPortrait';
import LotEditor from '@/components/LotEditor';
import ClaimButton from '@/components/ClaimButton';
import StoreProfileForm from '@/components/StoreProfileForm';
import { saveAction, saveProfileAction } from '@/app/actions';
import { SOCIAL_PLATFORMS, displayUrl, socialUrl } from '@/lib/store-profile';
import { priceLabel } from '@/lib/pricing';
import { buildInventory } from '@/lib/inventory';
import {
  FREE_LOTS_PER_ACCOUNT,
  freeClaimCount,
  getStoreProfile,
  getOverrides,
  isRealAddress,
  logoHash,
} from '@/lib/lot-store';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Every block has corners now, not just Main Street, so the tier describes the
// position and the address supplies the street.
const TIER_LABEL: Record<string, string> = {
  corner: 'Corner plot',
  main: 'Main Street',
  side: 'Side street',
};

const TYPE_LABEL: Record<string, string> = {
  storefront: 'Storefront',
  tower: 'Tower',
  warehouse: 'Warehouse',
  civic: 'Civic building',
};

export default async function LotPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = await params;
  const address = decodeURIComponent(raw);
  if (!isRealAddress(address)) notFound();

  const [user, overrides] = await Promise.all([currentUser(), getOverrides()]);
  const lot = buildInventory(overrides).find((l) => l.address === address);
  if (!lot) notFound();

  const isMine = user !== null && lot.ownerId === user.id;
  const [profile, logo] = await Promise.all([getStoreProfile(address), logoHash(address)]);
  const logoUrl = logo ? `/api/logo/${encodeURIComponent(address)}?v=${logo}` : null;
  const allowanceSpent =
    user !== null && !isMine && (await freeClaimCount(user.id)) >= FREE_LOTS_PER_ACCOUNT;

  const state = isMine ? 'Yours' : lot.awaitingOwner ? 'Sold' : lot.claimed ? 'Taken' : 'For sale';

  return (
    <main className="mw-page mw-narrow">
      <p className="mw-crumb">
        <Link href={`/demo?lot=${encodeURIComponent(lot.address)}`}>← Show it on the street</Link>
      </p>

      <div className="mw-storefront">
        <BuildingPortrait
          address={lot.address}
          number={lot.number}
          street={lot.street}
          status={lot.status}
          buildingType={lot.buildingType}
          facadeColor={lot.facadeColor}
          accentColor={lot.accentColor}
          signText={lot.signText}
        />

        <div className="mw-storefront-facts">
          <div className="mw-storefront-name">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="mw-storefront-logo" src={logoUrl} alt="" width={56} height={56} />
            )}
            <h1 className="mw-title">{lot.claimed ? lot.signText : 'Nothing built yet'}</h1>
          </div>
          <p className="mw-card-state" data-state={state.toLowerCase().replace(' ', '-')}>
            {state}
          </p>

          <dl className="mw-facts">
            <dt>Address</dt>
            <dd>{lot.address}</dd>
            <dt>Position</dt>
            <dd>{TIER_LABEL[lot.tier] ?? lot.tier}</dd>
            <dt>Building</dt>
            <dd>{TYPE_LABEL[lot.buildingType] ?? lot.buildingType}</dd>
            {!lot.claimed && (
              <>
                <dt>Price</dt>
                <dd>
                  <strong>{priceLabel(lot)}</strong> once, yours to keep
                </dd>
              </>
            )}
          </dl>

          {profile?.bio && <p className="mw-storefront-bio">{profile.bio}</p>}

          {profile?.url && (
            <p className="mw-storefront-link">
              {/*
                Outbound links are owner-supplied and this page is public, so
                they carry nofollow to stop the town becoming an SEO farm, and
                noopener/noreferrer so the destination learns nothing.
              */}
              <a href={profile.url} rel="nofollow noopener noreferrer" target="_blank">
                {displayUrl(profile.url)} ↗
              </a>
            </p>
          )}

          {profile && Object.keys(profile.socials).length > 0 && (
            <ul className="mw-socials">
              {SOCIAL_PLATFORMS.filter((p) => profile.socials[p.key]).map((platform) => (
                <li key={platform.key}>
                  <a
                    href={socialUrl(platform.key, profile.socials[platform.key] as string)}
                    rel="nofollow noopener noreferrer"
                    target="_blank"
                  >
                    {platform.label}
                    <small>@{profile.socials[platform.key]}</small>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {isMine ? (
        <>
          <h2 className="mw-street-heading">Change your shop</h2>
          <p className="mw-sub">
            Changes go live on the street as soon as you save. The shape of the building comes from
            the address itself, so it stays recognisably this lot whatever you choose.
          </p>
          <LotEditor lot={lot} action={saveAction} />

          <h2 className="mw-street-heading">Your shop details</h2>
          <p className="mw-sub">
            What visitors see when they open your building. Your email is never shown here.
          </p>
          <StoreProfileForm
            address={lot.address}
            profile={profile ?? { url: null, bio: null, socials: {}, hasLogo: false }}
            logoUrl={logoUrl}
            action={saveProfileAction}
          />
        </>
      ) : lot.awaitingOwner ? (
        <p className="mw-sub">
          This lot has been bought but its owner has not signed in yet. Sign in with the email used
          at checkout to take it over.
        </p>
      ) : lot.claimed ? null : (
        <>
          <p className="mw-sub">
            Nothing is built here yet. Claim it and you choose the sign, the colours and what kind of
            building goes up.
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

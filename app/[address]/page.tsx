/**
 * A building's page: what it is, who trades there, and what you can do about it.
 *
 * Lives at the root — marlow.town/102-cinder-row — because the address is the
 * product. An owner puts it in a bio, a message, a printed card, and it has to
 * survive all three. `/lots/102%20Cinder%20Row` does not: longer, unreadable
 * once encoded, and mangled by half the places people paste links.
 *
 * Safe as a top-level route because every address starts with a house number,
 * so no lot can ever collide with /city, /streets or /login.
 *
 * The owner's email is never shown. Anyone can read this page.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import BuildingPortrait from '@/components/BuildingPortrait';
import LotEditor from '@/components/LotEditor';
import ClaimButton from '@/components/ClaimButton';
import StoreStats from '@/components/StoreStats';
import BuyButton from '@/components/BuyButton';
import StoreProfileForm from '@/components/StoreProfileForm';
import { saveAction, saveProfileAction } from '@/app/actions';
import { SOCIAL_PLATFORMS, displayUrl, socialUrl } from '@/lib/store-profile';
import { priceLabel } from '@/lib/pricing';
import { addressFromSlug, streetByName } from '@/lib/lots';
import { buildInventory } from '@/lib/inventory';
import {
  FREE_LOTS_PER_ACCOUNT,
  freeClaimCount,
  getStoreProfile,
  getOverrides,
  logoHash,
} from '@/lib/lot-store';
import { currentUser } from '@/lib/session';
import { statsFor } from '@/lib/stats';

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

/**
 * What the checkout route can send somebody back with. Codes rather than text,
 * so a crafted link cannot put words of its own choosing on this page.
 */
const PROBLEMS: Record<string, string> = {
  'unknown-address': 'There is no such address in Marlow.',
  'already-taken': 'Somebody took that lot first. Nothing has been charged.',
  'checkout-failed': 'The checkout would not start. Nothing has been charged — try again.',
};

/**
 * Selling is off until it is switched on deliberately.
 *
 * Marlow gave lots away to get started, and having both a free claim and a
 * price on the same page says neither is real. Flipping MARLOW_SALES to `paid`
 * is the moment the town starts charging; `npm run grant` keeps working either
 * way, so deliberate giveaways are unaffected.
 */
function sellingLots(): boolean {
  return process.env.MARLOW_SALES === 'paid';
}

export default async function LotPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ bought?: string; problem?: string }>;
}) {
  const [{ address: slug }, query] = await Promise.all([params, searchParams]);
  // Anything that is not an address falls through to a 404, which is what makes
  // a catch-all at the root harmless.
  const address = addressFromSlug(slug);
  if (!address) notFound();

  const [user, overrides] = await Promise.all([currentUser(), getOverrides()]);
  const lot = buildInventory(overrides).find((l) => l.address === address);
  if (!lot) notFound();

  const isMine = user !== null && lot.ownerId === user.id;
  const [profile, logo] = await Promise.all([getStoreProfile(address), logoHash(address)]);
  const logoUrl = logo ? `/api/logo/${encodeURIComponent(address)}?v=${logo}` : null;
  const stats = isMine ? await statsFor(address) : null;
  const allowanceSpent =
    user !== null && !isMine && (await freeClaimCount(user.id)) >= FREE_LOTS_PER_ACCOUNT;

  /*
   * Who to send your email to, once you have registered.
   *
   * An env var rather than a constant so the giveaway can be run from whichever
   * account is running it that week, without a deploy. With none set the copy
   * still makes sense, it just cannot say where to send it.
   */
  const giveawayHandle = process.env.NEXT_PUBLIC_GIVEAWAY_HANDLE;

  const state = isMine
    ? 'Yours'
    : lot.reserved
      ? 'Giveaway'
      : lot.awaitingOwner
        ? 'Sold'
        : lot.claimed
          ? 'Taken'
          : 'For sale';

  return (
    <main className="mw-page mw-narrow">
      <p className="mw-crumb">
        <Link
          href={`/street/${streetByName(lot.street)?.slug ?? 'main-street'}?lot=${encodeURIComponent(lot.address)}`}
        >
          ← Show it on {lot.street}
        </Link>
      </p>

      <StoreStats address={lot.address} />

      {query.problem && PROBLEMS[query.problem] && (
        <p className="mw-error" role="alert">
          {PROBLEMS[query.problem]}
        </p>
      )}

      {query.bought && lot.awaitingOwner && (
        <p className="mw-bought" role="status">
          <strong>{lot.address} is yours.</strong> Sign in with the email you used at checkout to
          choose your sign, your colours and what gets built here.
        </p>
      )}

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
              <a
                href={profile.url}
                rel="nofollow noopener noreferrer"
                target="_blank"
                data-stat="link"
              >
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
                    data-stat="social"
                    data-stat-target={platform.key}
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
          {stats && (
            <>
              <h2 className="mw-street-heading">
                Your shop, last {stats.days} days
              </h2>
              <ul className="mw-stats">
                <li>
                  <strong>{stats.views.toLocaleString()}</strong>
                  <span>opened your shop</span>
                </li>
                <li>
                  <strong>{stats.linkClicks.toLocaleString()}</strong>
                  <span>went on to your site</span>
                </li>
                <li>
                  <strong>{stats.socialTotal.toLocaleString()}</strong>
                  <span>clicked a social link</span>
                </li>
              </ul>

              {stats.socialClicks.length > 0 && (
                <ul className="mw-stat-breakdown">
                  {stats.socialClicks.map((social) => (
                    <li key={social.key}>
                      {social.label} <strong>{social.clicks.toLocaleString()}</strong>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mw-hint">
                Counts only, never who. Marlow records nothing about the people who visit.
              </p>
            </>
          )}

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
      ) : lot.reserved ? (
        <>
          <h2 className="mw-street-heading">This address is being given away</h2>
          <p className="mw-sub">
            {lot.address} is not for sale — it is held back as a prize. Create an account, then send
            the email address you signed up with
            {giveawayHandle ? ` to ${giveawayHandle} on X` : ' to whoever is running the giveaway'},
            and the deed is transferred to you. The shop is then yours to name, colour and fill.
          </p>
          <p className="mw-sub">
            <Link className="mw-chip mw-chip-primary" href="/register">
              Create an account
            </Link>
          </p>
        </>
      ) : lot.awaitingOwner ? (
        <p className="mw-sub">
          This lot has been bought but its owner has not signed in yet. Sign in with the email used
          at checkout to take it over.
        </p>
      ) : lot.claimed ? null : sellingLots() ? (
        <>
          <p className="mw-sub">
            Nothing is built here yet. Take it and you choose the sign, the colours and what kind of
            building goes up — and it stays yours.
          </p>
          <BuyButton address={lot.address} price={priceLabel(lot)} />
        </>
      ) : (
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

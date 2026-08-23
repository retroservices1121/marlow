/**
 * The three vehicles, what it costs to ride them, and how to take one.
 *
 * Deliberately the plainest page in Marlow. Everywhere else the town is selling
 * something permanent and can afford to be charming about it; this is an
 * auction with no refunds, and the only way to run one of those honestly is to
 * say so in the largest type on the page, before anybody has typed a number.
 *
 * Each vehicle is drawn rather than described, at the size it actually is, so
 * what somebody is bidding on is the thing they can see driving past.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import Vehicle, { VEHICLE_SIZE } from '@/components/Vehicle';
import { adSlots, nextBidCents, VEHICLE_LABEL } from '@/lib/ads';
import { formatPrice } from '@/lib/pricing';
import { TIME_PALETTES } from '@/lib/palette';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Advertise in Marlow',
  description:
    'Three vehicles drive every street in Marlow. Bid to put your ad on one — highest bid rides.',
};

/** What the checkout route can send somebody back with. Codes, never text. */
const PROBLEMS: Record<string, string> = {
  'bad-vehicle': 'There is no such vehicle.',
  'bad-email': 'That email does not look right, and it is how you would be told if you lost the slot.',
  'bad-url': 'That web address does not look right. Where should the ad send people?',
  'bad-artwork': 'The artwork must be a PNG, JPEG or WebP image under 256KB.',
  'too-low': 'That bid is under what the vehicle currently costs. Nothing has been charged.',
  'checkout-failed': 'The checkout would not start. Nothing has been charged — try again.',
};

const BODY: Record<string, string> = {
  led: '#E8544B',
  pickup: '#4FA382',
  van: '#4A90C4',
};

const WHAT_IT_IS: Record<string, string> = {
  led: 'The biggest panel in town, on a screen truck that leads the convoy.',
  pickup: 'A panel along the bed of the pickup, second in the convoy.',
  van: 'The wrapped side of the van, bringing up the rear.',
};

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string; bid?: string }>;
}) {
  const [slots, query] = await Promise.all([adSlots(), searchParams]);
  const palette = TIME_PALETTES.day;

  return (
    <main className="mw-page mw-narrow">
      <h1 className="mw-title">Advertise in Marlow</h1>
      <p className="mw-sub">
        Three vehicles drive every street in the town, all day, in front of every shop.{' '}
        <Link href="/street/main-street">Watch them go past</Link>.
      </p>

      {query.problem && PROBLEMS[query.problem] && (
        <p className="mw-error" role="alert">
          {PROBLEMS[query.problem]}
        </p>
      )}

      {query.bid && (
        <p className="mw-bought" role="status">
          <strong>Your bid is in.</strong> If it beat the standing bid, your ad is on the road now —
          go and look. If somebody got there first, the bid stands as recorded and the vehicle keeps
          its rider.
        </p>
      )}

      {/*
        * The rule, before the forms rather than after them. An auction where
        * the losing money is kept is not unusual, but finding that out
        * afterwards is what makes people angry, and they would be right.
        */}
      <div className="mw-rules">
        <h2>How this works</h2>
        <ul>
          <li>
            <strong>The highest bid rides.</strong> Beat what a vehicle currently costs and your ad
            goes up immediately.
          </li>
          <li>
            <strong>Anybody can outbid you, at any time.</strong> There is no minimum run. If
            somebody pays more, your ad comes down and theirs goes up.
          </li>
          <li>
            <strong>Bids are final. There are no refunds</strong> — including if you are outbid five
            minutes later, and including if your bid arrives under the standing price.
          </li>
          <li>
            A shopfront is not like this. <Link href="/streets">A lot is bought once</Link>, at a
            fixed price, and nobody can take it from you.
          </li>
        </ul>
      </div>

      {slots.map((slot) => {
        const size = VEHICLE_SIZE[slot.kind];
        const needed = nextBidCents(slot);
        const pad = 14;

        return (
          <section key={slot.kind} className="mw-ad-slot">
            <h2 className="mw-street-heading">
              {VEHICLE_LABEL[slot.kind]}
              {/*
                * "held at $0" is what a seeded vehicle said, which reads as a
                * fault rather than as a founding shop riding free. Three states,
                * because there are three: paid for, lent out, and empty.
                */}
              <small>
                {!slot.taken
                  ? 'nobody riding'
                  : slot.bidCents > 0
                    ? `held at ${formatPrice(slot.bidCents)}`
                    : 'riding free · any bid takes it'}
              </small>
            </h2>

            <svg
              className="mw-ad-vehicle"
              viewBox={`${-pad} ${-size.height - pad} ${size.width + pad * 2} ${size.height + pad * 2}`}
              role="img"
              aria-label={VEHICLE_LABEL[slot.kind]}
            >
              <Vehicle
                kind={slot.kind}
                adUrl={slot.adUrl}
                body={BODY[slot.kind]}
                stroke={palette.stroke}
                id={`ads-page-${slot.kind}`}
              />
            </svg>

            <p className="mw-sub">{WHAT_IT_IS[slot.kind]}</p>

            <form className="mw-bid" method="post" action="/api/ads/bid" encType="multipart/form-data">
              <input type="hidden" name="kind" value={slot.kind} />

              <label className="mw-field">
                <span>Your bid</span>
                <input
                  name="amount"
                  type="number"
                  min={(needed / 100).toFixed(2)}
                  step="0.01"
                  defaultValue={(needed / 100).toFixed(2)}
                  required
                />
                <small>At least {formatPrice(needed)} to take this one.</small>
              </label>

              <label className="mw-field">
                <span>Where it sends people</span>
                <input name="url" type="text" placeholder="yoursite.com" required />
              </label>

              <label className="mw-field">
                <span>Your email</span>
                <input name="email" type="email" placeholder="you@example.com" required />
                <small>Only used to tell you if you are outbid. Never shown.</small>
              </label>

              <label className="mw-field">
                <span>Artwork</span>
                <input name="artwork" type="file" accept="image/png,image/jpeg,image/webp" required />
                <small>
                  PNG, JPEG or WebP, under 256KB. Best at about {size.width * 4}×
                  {Math.round(size.height * 2.4)}, landscape.
                </small>
              </label>

              <button type="submit" className="mw-chip mw-chip-primary">
                Bid {formatPrice(needed)} or more
              </button>
            </form>
          </section>
        );
      })}
    </main>
  );
}

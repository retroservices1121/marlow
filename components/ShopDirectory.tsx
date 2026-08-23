/**
 * Every open shop in Marlow, on the front page, drawn.
 *
 * Only Main Street is visible from the front door, so an owner on Netmaker Lane
 * was paying for an address nobody would ever walk past. That is a bad deal in
 * itself, and it is worse than that: the cheap streets are most of the
 * inventory, so the lots hardest to sell were also the ones with least to
 * offer. This is the fix — buy anywhere in the town and your shop appears on
 * the busiest page in it.
 *
 * Drawn rather than listed. A row of addresses is a phone book; the building is
 * what somebody bought, and it is the only part that makes a stranger curious
 * enough to click. Same renderer as the street, so the shop here is the shop
 * they find when they arrive.
 *
 * Grouped by street and ordered by the town's own layout, so the directory
 * reads like a walk rather than a database.
 */

import Link from 'next/link';
import BuildingPortrait from './BuildingPortrait';
import DirectoryStats from './DirectoryStats';
import type { OwnedLot } from '@/lib/inventory';
import type { OpenShop } from '@/lib/lot-store';
import { DISTRICTS, addressSlug } from '@/lib/lots';
import { displayUrl } from '@/lib/store-profile';

export default function ShopDirectory({
  lots,
  shops,
}: {
  /** Every lot in the town; the open ones are picked out here. */
  lots: OwnedLot[];
  shops: Map<string, OpenShop>;
}) {
  const open = lots.filter((lot) => lot.claimed);
  if (open.length === 0) return null;

  // Street order comes from the town's own definition, so Main Street leads and
  // each district's streets stay together.
  const streets = DISTRICTS.flatMap((district) =>
    district.streets.map((street) => ({ street, district })),
  )
    .map(({ street, district }) => ({
      street,
      district,
      run: open.filter((lot) => lot.street === street.name),
    }))
    .filter((row) => row.run.length > 0);

  return (
    <section className="mw-directory">
      <DirectoryStats />

      <h2 className="mw-street-heading">
        Open in Marlow
        <small>
          {open.length} {open.length === 1 ? 'shop' : 'shops'}
        </small>
      </h2>
      <p className="mw-sub">
        Every shop in the town, wherever it stands. Buy a lot on any street and yours appears here.
      </p>

      {streets.map(({ street, district, run }) => (
        <div key={street.slug} className="mw-directory-street">
          <h3 className="mw-directory-heading">
            <Link href={`/street/${street.slug}`}>{street.name}</Link>
            <small>{district.name}</small>
          </h3>

          <ul className="mw-directory-row">
            {run.map((lot) => {
              const shop = shops.get(lot.address);
              const logoUrl = shop?.logoHash
                ? `/api/logo/${encodeURIComponent(lot.address)}?v=${shop.logoHash}`
                : null;

              return (
                <li key={lot.address} className="mw-shop">
                  <Link className="mw-shop-front" href={`/${addressSlug(lot.address)}`}>
                    <BuildingPortrait
                      address={lot.address}
                      number={lot.number}
                      street={lot.street}
                      status={lot.status}
                      buildingType={lot.buildingType}
                      facadeColor={lot.facadeColor}
                      accentColor={lot.accentColor}
                      signText={lot.signText}
                      className="mw-shop-portrait"
                    />
                  </Link>

                  <div className="mw-shop-card">
                    <div className="mw-shop-name">
                      {logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoUrl} alt="" width={30} height={30} />
                      )}
                      <Link href={`/${addressSlug(lot.address)}`}>{lot.signText}</Link>
                    </div>
                    <small>{lot.address}</small>

                    {shop?.bio && <p>{shop.bio}</p>}

                    {shop?.url && (
                      /*
                       * Owner-supplied and this page is public, so nofollow to
                       * stop the town becoming an SEO farm, and noopener so the
                       * destination learns nothing about where it came from.
                       *
                       * The address rides on the link because one page carries
                       * many shops, and a click has to be counted against the
                       * right one.
                       */
                      <a
                        href={shop.url}
                        rel="nofollow noopener noreferrer"
                        target="_blank"
                        data-stat="link"
                        data-stat-address={lot.address}
                      >
                        {displayUrl(shop.url)} ↗
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

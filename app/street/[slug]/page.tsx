/**
 * One street you can walk down.
 *
 * A street view is 24 to 48 buildings rather than all 120, which is what makes
 * walking practical: Main Street used to be 33 phone screens end to end with
 * the last address past 119 other buildings.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import StreetView from '@/components/StreetView';
import TownBusy from '@/components/TownBusy';
import ShopDirectory from '@/components/ShopDirectory';
import MarlowIntro from '@/components/MarlowIntro';
import { buildInventory } from '@/lib/inventory';
import { getOverrides, isRealAddress, logoHashesFor, openShops } from '@/lib/lot-store';
import { adSlots } from '@/lib/ads';
import { townBusyness } from '@/lib/visitors';
import { DISTRICTS, STREETS, junctionsOn, parentStreet, streetBySlug } from '@/lib/lots';

export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  return STREETS.map((street) => ({ slug: street.slug }));
}

export default async function StreetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lot?: string }>;
}) {
  const [{ slug }, { lot: requested }] = await Promise.all([params, searchParams]);
  const street = streetBySlug(slug);
  if (!street) notFound();

  const overrides = await getOverrides();
  const everywhere = buildInventory(overrides);
  /*
   * The directory of open shops, on the front page only. Every other street is
   * somewhere you have already chosen to be; this is the page strangers land
   * on, and it is the only place a shop on a side street can be seen without
   * being looked for.
   */
  const shops = street.main && street.slug === 'main-street' ? await openShops() : null;

  /*
   * The convoy drives every street, not just the front page. An advertiser is
   * paying for the whole town to see them, and a side street with a truck
   * going past is a side street that looks lived in.
   */
  const ads = await adSlots();
  const busy = await townBusyness();
  const lots = everywhere.filter((l) => l.street === street.name);
  const takenEverywhere = everywhere.filter((l) => l.claimed).length;

  // Only honour an address on this street, so a stray link lands somewhere real.
  const focusAddress =
    requested && isRealAddress(requested) && lots.some((l) => l.address === requested)
      ? requested
      : null;
  /*
   * Every owned shop's logo, not just the one somebody was linked to.
   *
   * A logo above the door is what an owner bought, so it hangs there whenever
   * anyone walks past. Only claimed lots can have one, so this is bounded by
   * how much of the street is sold rather than by its length.
   */
  const claimed = lots.filter((l) => l.claimed).map((l) => l.address);
  const hashes = await logoHashesFor(claimed);
  const logoUrls: Record<string, string> = {};
  for (const [address, hash] of hashes) {
    logoUrls[address] = `/api/logo/${encodeURIComponent(address)}?v=${hash}`;
  }

  const forSale = lots.filter((l) => !l.claimed).length;
  const turnings = street.main ? junctionsOn(street).map((j) => j.street) : [];
  const back = parentStreet(street);

  return (
    <main className="mw-page">
      <header className="mw-header">
        <TownBusy busy={busy} />
        <h1 className="mw-title">{street.name}</h1>
        <p className="mw-sub">
          {lots.length} addresses · {forSale} for sale.{' '}
          {street.main
            ? 'Walk along and turn into a side street where one opens.'
            : `Runs off ${back?.name ?? 'Main Street'} to a dead end.`}
        </p>
      </header>

      <StreetView
        lots={lots}
        focusAddress={focusAddress}
        logoUrls={logoUrls}
        ads={ads}
        action={
          <>
            <Link className="mw-chip mw-chip-ad" href="/ads">
              Advertise in Marlow
            </Link>
            <Link className="mw-chip" href="/streets">
              See every address
            </Link>
          </>
        }
        overlay={
          <MarlowIntro
            total={everywhere.length}
            taken={takenEverywhere}
            districts={DISTRICTS.length}
            hint="Drag the street or hold ← → to walk · click a shopfront to see it"
          />
        }
      />

      {shops && <ShopDirectory lots={everywhere} shops={shops} />}

      <p className="mw-meta">
        {back && (
          <>
            <Link href={`/street/${back.slug}`}>← Back to {back.name}</Link>
            {turnings.length > 0 && ' · '}
          </>
        )}
        {turnings.map((turn, i) => (
          <span key={turn.slug}>
            {i > 0 && ' · '}
            <Link href={`/street/${turn.slug}`}>{turn.name} →</Link>
          </span>
        ))}
      </p>
    </main>
  );
}

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
import MarlowIntro from '@/components/MarlowIntro';
import { buildInventory } from '@/lib/inventory';
import { getOverrides, isRealAddress, logoHash } from '@/lib/lot-store';
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
  const lots = everywhere.filter((l) => l.street === street.name);
  const takenEverywhere = everywhere.filter((l) => l.claimed).length;

  // Only honour an address on this street, so a stray link lands somewhere real.
  const focusAddress =
    requested && isRealAddress(requested) && lots.some((l) => l.address === requested)
      ? requested
      : null;
  const focusLogo = focusAddress ? await logoHash(focusAddress) : null;
  const focusLogoUrl = focusLogo
    ? `/api/logo/${encodeURIComponent(focusAddress as string)}?v=${focusLogo}`
    : null;

  const forSale = lots.filter((l) => !l.claimed).length;
  const turnings = street.main ? junctionsOn(street).map((j) => j.street) : [];
  const back = parentStreet(street);

  return (
    <main className="mw-page">
      <header className="mw-header">
        <h1 className="mw-title">{street.name}</h1>
        <p className="mw-sub">
          {lots.length} addresses · {forSale} for sale.{' '}
          {street.main
            ? 'Walk along and turn into a side street where one opens.'
            : `Runs off ${back?.name ?? 'Main Street'} to a dead end.`}{' '}
          <Link href="/streets">See every address</Link>.
        </p>
      </header>

      <StreetView
        lots={lots}
        focusAddress={focusAddress}
        focusLogoUrl={focusLogoUrl}
        overlay={
          <MarlowIntro
            total={everywhere.length}
            taken={takenEverywhere}
            districts={DISTRICTS.length}
            hint="Drag the street or hold ← → to walk · click a shopfront to see it"
          />
        }
      />

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

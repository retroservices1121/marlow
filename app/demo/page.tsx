/**
 * The street.
 *
 * A server component: it reads whatever owners have saved and lays it over the
 * generated inventory. With an empty database this renders exactly the town the
 * renderer shipped with, which is the property the whole storage layer is built
 * to preserve.
 */

import Link from 'next/link';
import StreetView from '@/components/StreetView';
import { buildInventory } from '@/lib/inventory';
import { getOverrides, isRealAddress, logoHash } from '@/lib/lot-store';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ lot?: string }>;
}) {
  const [{ lot: requested }, overrides, user] = await Promise.all([
    searchParams,
    getOverrides(),
    currentUser(),
  ]);
  // Only honour an address that exists, so a mangled link lands on the street
  // rather than pointing at nothing.
  const focusAddress = requested && isRealAddress(requested) ? requested : null;
  const lots = buildInventory(overrides);
  // The hash is in the URL, so a changed logo is a changed URL and the response
  // can be cached hard.
  const focusLogo = focusAddress ? await logoHash(focusAddress) : null;
  const focusLogoUrl = focusLogo
    ? `/api/logo/${encodeURIComponent(focusAddress as string)}?v=${focusLogo}`
    : null;
  const claimed = lots.filter((lot) => lot.claimed).length;
  const forSale = lots.filter((lot) => lot.status === 'vacant').length;

  return (
    <main className="mw-page">
      <header className="mw-header">
        <h1 className="mw-title">Marlow</h1>
        <p className="mw-sub">
          {lots.length} lots across four streets, rendered from one data array. Every dimension is
          derived from the address, so the town is identical on every reload and every device — only
          the colours, signs and lit windows ever change.
        </p>
        <p className="mw-sub">
          Walk along and click a storefront to see who trades there, or{' '}
          <Link href="/streets">browse every address</Link>.{' '}
          <Link href="/register">Take an empty lot</Link> and decide what gets built on it.
        </p>
      </header>

      <StreetView lots={lots} focusAddress={focusAddress} focusLogoUrl={focusLogoUrl} />

      <p className="mw-meta">
        {claimed} claimed · {forSale} for sale ·{' '}
        {focusAddress ? `showing ${focusAddress}` : 'scroll sideways to walk the street'}
      </p>
    </main>
  );
}

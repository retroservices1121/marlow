/**
 * The old entry point.
 *
 * The town is no longer one row, so `/demo` is Main Street. Existing links —
 * including `?lot=` links people have shared — are forwarded to whichever
 * street the address is actually on.
 */

import { redirect } from 'next/navigation';
import { isRealAddress } from '@/lib/lot-store';
import { STREETS, streetByName } from '@/lib/lots';
import { generateLots } from '@/lib/lots';

export const dynamic = 'force-dynamic';

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ lot?: string }>;
}) {
  const { lot } = await searchParams;
  const main = STREETS.find((s) => s.main) ?? STREETS[0];

  if (lot && isRealAddress(lot)) {
    const found = generateLots().find((l) => l.address === lot);
    const street = found ? streetByName(found.street) : undefined;
    if (street) redirect(`/street/${street.slug}?lot=${encodeURIComponent(lot)}`);
  }
  redirect(`/street/${main.slug}`);
}

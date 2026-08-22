/**
 * The old address of an address.
 *
 * Building pages moved to the root — marlow.town/102-cinder-row — but links to
 * `/lots/102%20Cinder%20Row` are already out in the world: in the emails Polar
 * sent buyers, and in whatever anybody pasted somewhere. A permanent redirect
 * keeps every one of them working and tells search engines which is the real
 * one, so the town does not end up indexed twice under two names.
 */

import { notFound, permanentRedirect } from 'next/navigation';
import { addressSlug } from '@/lib/lots';
import { isRealAddress } from '@/lib/lot-store';

export const dynamic = 'force-dynamic';

export default async function OldLotPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ address: raw }, query] = await Promise.all([params, searchParams]);
  const address = decodeURIComponent(raw);
  if (!isRealAddress(address)) notFound();

  // `?bought=1` arrives here from Polar's success page. Losing it would drop
  // somebody who has just paid onto a page that says nothing happened.
  const params_ = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') params_.set(key, value);
  }
  const suffix = params_.toString();

  permanentRedirect(`/${addressSlug(address)}${suffix ? `?${suffix}` : ''}`);
}

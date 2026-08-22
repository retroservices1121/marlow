/**
 * Serves a store's logo.
 *
 * These bytes are uploaded by owners and served from our own origin, so the
 * response is locked down: the content type comes from what we sniffed at
 * upload rather than anything a client claimed, `nosniff` stops a browser
 * second-guessing it, and a restrictive CSP means that even if something got
 * past the checks it has nothing to run with.
 */

import { getLogo } from '@/lib/lot-store';
import { isRealAddress } from '@/lib/lot-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await params;
  const address = decodeURIComponent(raw);
  if (!isRealAddress(address)) return new Response('Not found', { status: 404 });

  const logo = await getLogo(address);
  if (!logo) return new Response('Not found', { status: 404 });

  const etag = `"${logo.hash}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      'Content-Type': logo.contentType,
      'Content-Length': String(logo.bytes.length),
      ETag: etag,
      // Content is immutable for a given hash; the URL carries it, so a changed
      // logo is a changed URL and this can be cached hard.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

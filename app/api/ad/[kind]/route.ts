/**
 * Serves an advertiser's artwork from our own origin.
 *
 * Same shape as the logo route: the bytes are ours to serve, the content type
 * was sniffed from the file rather than trusted at upload, and the hash is the
 * ETag — the URL carries it, so a panel that has not changed is never fetched
 * twice and a panel that has changes immediately.
 */

import { adImage } from '@/lib/ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const image = await adImage(kind);
  if (!image) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      'content-type': image.contentType,
      etag: `"${image.hash}"`,
      // Immutable because the hash is in the URL: a new panel is a new address.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}

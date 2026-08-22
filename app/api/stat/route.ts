/**
 * The beacon a storefront page fires.
 *
 * Same-origin and tiny, which matters: a third-party analytics script is
 * blocked for a large minority of visitors, and an owner's numbers being
 * quietly wrong for a third of their traffic is worse than having none.
 *
 * Nothing is returned. The page is not waiting on this, and a click must not be
 * delayed by a millisecond of ours — the browser sends it and forgets it.
 */

import { recordStat } from '@/lib/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { address?: unknown; kind?: unknown; target?: unknown };
    if (typeof body.address === 'string') {
      await recordStat(body.address, body.kind, body.target);
    }
  } catch {
    /* A malformed beacon is not worth an error page nobody will read. */
  }
  // 204 whatever happened. This endpoint reports nothing back, including
  // whether an address exists — that is not a question it should answer.
  return new Response(null, { status: 204 });
}

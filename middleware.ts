/**
 * Clerk's middleware, plus which door you came in by.
 *
 * Deliberately does not protect anything by route. Marlow is a public town —
 * the city, the streets and every shop page must stay readable by anyone,
 * including a crawler, because the links owners are paying for are the product.
 * Ownership is enforced in `lib/lot-store.ts`, on the write, where it belongs.
 *
 * Two hostnames, on purpose:
 *
 *   marlow.lol   the front door. Shares well, and is the domain people are
 *                looking for; it serves the whole town.
 *   marlow.town  where accounts live, and the canonical address for search.
 *
 * The split exists because a session cookie belongs to exactly one domain.
 * Clerk's production instance is bound to marlow.town, so signing in anywhere
 * else cannot work — the cookie has nowhere to land. We learned that from
 * Railway's generated domain, which served a perfect copy of the site on which
 * nobody could ever sign in. Rather than run a second auth surface, anything
 * needing a session steps across to marlow.town and stays there.
 *
 * Everything else — browsing, buying, and the beacons that count a shop's
 * visits — works identically on both, so an owner's numbers do not depend on
 * which door their visitor used.
 */

import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const CANONICAL_HOST = 'marlow.town';

/** The front door, and its www form. */
const FRONT_DOOR = ['marlow.lol', 'www.marlow.lol'];

/**
 * Paths that need to know who you are.
 *
 * Kept as a list of prefixes rather than a guess at "anything under /api": the
 * stat beacon is an API route and must keep working on the front door, or every
 * visit arriving by marlow.lol would go uncounted.
 */
const NEEDS_A_SESSION = ['/login', '/register', '/lots'];

function hostOf(req: Request): string {
  return (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
}

function sendTo(host: string, req: Request) {
  const url = new URL(req.url);
  url.host = host;
  url.protocol = 'https:';
  url.port = '';
  // 308 rather than 302: the path, the query and the method all have to
  // survive, and none of this is a temporary state of affairs.
  return NextResponse.redirect(url, 308);
}

export default clerkMiddleware((_auth, req) => {
  const host = hostOf(req);

  // Railway serves the app on its own generated domain too. Nobody can sign in
  // there either, and it is a second copy of the town for search to find.
  if (host.endsWith('.up.railway.app')) return sendTo(CANONICAL_HOST, req);

  if (FRONT_DOOR.includes(host)) {
    const path = new URL(req.url).pathname;
    if (NEEDS_A_SESSION.some((p) => path === p || path.startsWith(`${p}/`))) {
      return sendTo(CANONICAL_HOST, req);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Everything except Next internals and files with an extension.
    '/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)',
    '/(api|trpc)(.*)',
  ],
};

/**
 * Clerk's middleware, plus the canonical host.
 *
 * Deliberately does not protect anything by route. Marlow is a public town —
 * the city, the streets and every shop page must stay readable by anyone,
 * including a crawler, because the links owners are paying for are the product.
 * Ownership is enforced in `lib/lot-store.ts`, on the write, where it belongs.
 *
 * What it does enforce is the hostname. Railway serves the same app on a
 * generated `*.up.railway.app` domain as well as on marlow.town, and that
 * second copy is not harmless: Clerk's production instance is bound to
 * marlow.town and sets its session cookie there, so signing in from the
 * Railway host silently cannot work — the cookie has nowhere to land. Every
 * in-app link is relative, so one arrival on the wrong host (Railway's own
 * dashboard links to it) keeps a visitor on it for the rest of the session.
 *
 * So: anything reaching us on a Railway domain is sent to marlow.town, once,
 * permanently. Only `.up.railway.app` is matched — localhost, the custom
 * domain and Railway's internal health probes are all left alone, because a
 * middleware that redirects a health check fails the deploy that adds it.
 */

import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const CANONICAL_HOST = 'marlow.town';

export default clerkMiddleware((_auth, req) => {
  const host = req.headers.get('host') ?? '';

  if (host.endsWith('.up.railway.app')) {
    const url = new URL(req.url);
    url.host = CANONICAL_HOST;
    url.protocol = 'https:';
    url.port = '';
    // 308 rather than 302: the path and method must survive, and this is not
    // a temporary state of affairs.
    return NextResponse.redirect(url, 308);
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

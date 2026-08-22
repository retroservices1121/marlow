/**
 * Clerk's middleware.
 *
 * Deliberately does not protect anything by route. Marlow is a public town —
 * the city, the streets and every shop page must stay readable by anyone,
 * including a crawler, because the links owners are paying for are the product.
 * Ownership is enforced in `lib/lot-store.ts`, on the write, where it belongs.
 */

import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    // Everything except Next internals and files with an extension.
    '/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)',
    '/(api|trpc)(.*)',
  ],
};

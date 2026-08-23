/**
 * Site header.
 *
 * A server component, so it reflects the real session rather than a guess, and
 * so the links are in the served HTML.
 */

import Link from 'next/link';
import { SignOutButton } from '@clerk/nextjs';
import { currentUser } from '@/lib/session';

export default async function Nav() {
  const user = await currentUser();

  return (
    <nav className="mw-nav">
      <Link href="/" className="mw-brand">
        Marlow
      </Link>
      <div className="mw-nav-right">
        {/*
          * Advertising is offered on the street itself, beside the other asks,
          * and by the empty panels driving past. Repeating it in the header
          * would be the same request twice within an inch of itself, and the
          * header is the one part of the town that is on every page.
          */}
        <Link href="/city" className="mw-nav-link">
          The city
        </Link>
        {user ? (
          <>
            <Link href="/lots" className="mw-nav-link">
              Your lots
            </Link>
            <SignOutButton redirectUrl="/">
              <button type="button" className="mw-chip mw-chip-small">
                Sign out
              </button>
            </SignOutButton>
          </>
        ) : (
          /*
           * Sign in, and nothing else.
           *
           * There was a "Take a lot" chip here pointing at /register, which
           * stopped being true the day the town started charging: a lot is
           * bought from its own page without an account, and signing up first
           * gets you nothing. It promised the main action and delivered a
           * signup form. Browsing lives on the street and on the city map,
           * both a click away, and every lot page carries its own buy button.
           */
          <Link href="/login" className="mw-nav-link">
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}

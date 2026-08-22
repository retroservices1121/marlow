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
          <>
            <Link href="/login" className="mw-nav-link">
              Sign in
            </Link>
            <Link href="/register" className="mw-chip mw-chip-small">
              Take a lot
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

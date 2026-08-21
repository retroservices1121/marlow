/** Site header. A server component, so it reflects the real session, not a guess. */

import Link from 'next/link';
import { logoutAction } from '@/app/actions';
import { currentUser } from '@/lib/session';

export default async function Nav() {
  const user = await currentUser();

  return (
    <nav className="mw-nav">
      <Link href="/demo" className="mw-brand">
        Marlow
      </Link>
      <div className="mw-nav-right">
        {user ? (
          <>
            <Link href="/lots" className="mw-nav-link">
              Your lots
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="mw-chip mw-chip-small">
                Sign out
              </button>
            </form>
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

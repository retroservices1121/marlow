/**
 * The cookie half of authentication.
 *
 * `lib/auth.ts` knows nothing about HTTP — it takes and returns tokens. This is
 * the only place that touches request cookies, which keeps the auth core
 * testable in plain Node.
 */

import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_DAYS, destroySession, userForToken, type User } from './auth';

/** The signed-in user for the current request, or null. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return userForToken(jar.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Railway terminates TLS in front of the app, so production is always https.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** Drops the server-side session first, then the cookie. */
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

/**
 * Who is signed in.
 *
 * Clerk owns identity — the password, the email verification, the session. This
 * is the seam between that and Marlow's own tables: a row per account keyed by
 * Clerk's user id, so `lots.owner_id` keeps real foreign-key integrity.
 *
 * The one rule that matters here is the verified email. A lot bought before its
 * buyer had an account is held against the address they gave at checkout, and
 * handing it over to whoever later types that address would let anybody take a
 * stranger's purchase. Only an address Clerk has verified is ever passed to
 * `linkLotsToUser`.
 */

import { auth, currentUser as clerkUser } from '@clerk/nextjs/server';
import { randomUUID } from 'crypto';
import { getDb } from './db';
import { linkLotsToUser } from './lot-store';

export type User = { id: string; email: string | null };

/**
 * The Marlow row for the signed-in Clerk account, created on first sight.
 *
 * Called on every request that needs an owner, so it is one upsert rather than
 * a read-then-write race between two tabs.
 */
async function syncUser(clerkId: string, email: string | null): Promise<User> {
  const db = await getDb();

  await db.query(
    `insert into users (id, clerk_id, email)
          values ($1, $2, $3)
     on conflict (clerk_id) do update
            set email = excluded.email`,
    [randomUUID(), clerkId, email],
  );

  const row = await db.one<{ id: string; email: string | null }>(
    'select id, email from users where clerk_id = $1',
    [clerkId],
  );
  return { id: row?.id ?? '', email: row?.email ?? null };
}

/**
 * The signed-in user, or null.
 *
 * Also the moment a purchase made without an account becomes editable: the
 * buyer signs in with the address they bought under, and the lots held against
 * it are handed over. `verifiedEmail` below is the whole safeguard.
 */
export async function currentUser(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const profile = await clerkUser();
  const email = verifiedEmail(profile);
  const user = await syncUser(userId, email);

  if (email) await linkLotsToUser(user.id, email);
  return user;
}

type ClerkEmail = { emailAddress: string; verification: { status: string | null } | null };
type ClerkProfile = {
  primaryEmailAddressId: string | null;
  emailAddresses: (ClerkEmail & { id: string })[];
} | null;

/**
 * The primary email, but only once Clerk says it is verified.
 *
 * Returning an unverified address here would be enough to let somebody sign up
 * with a buyer's email and inherit the lot they paid for.
 */
export function verifiedEmail(profile: ClerkProfile): string | null {
  if (!profile) return null;
  const primary = profile.emailAddresses.find((e) => e.id === profile.primaryEmailAddressId);
  if (!primary) return null;
  return primary.verification?.status === 'verified'
    ? primary.emailAddress.trim().toLowerCase()
    : null;
}

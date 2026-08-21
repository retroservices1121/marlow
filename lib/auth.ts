/**
 * Accounts and sessions.
 *
 * Deliberately small and dependency-free — `node:crypto` primitives, server-side
 * sessions, no JWTs. The rules it holds to:
 *
 *   - passwords are scrypt-hashed with a per-user random salt, never stored raw
 *   - comparisons are timing-safe
 *   - the session cookie holds a random token; the database stores only its
 *     SHA-256, so a leaked table does not hand anybody a live session
 *   - sessions expire server-side, and logout deletes the row rather than
 *     trusting the client to drop the cookie
 */

import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'crypto';
import { promisify } from 'util';
import { getDb } from './db';

// promisify loses the options overload, so the signature is restated here.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const SESSION_COOKIE = 'marlow_session';
export const SESSION_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 8;

export type User = { id: string; email: string };

/* ---- Passwords --------------------------------------------------------- */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString(
    'base64',
  )}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_PARAMS.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ---- Validation -------------------------------------------------------- */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const value = normalizeEmail(email);
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 200) return 'Password is too long.';
  return null;
}

/* ---- Accounts ---------------------------------------------------------- */

export type AuthResult = { ok: true; user: User } | { ok: false; error: string };

export async function registerUser(email: string, password: string): Promise<AuthResult> {
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.' };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };

  const db = await getDb();
  const normalized = normalizeEmail(email);
  const existing = await db.one('select id from users where lower(email) = $1', [normalized]);
  if (existing) return { ok: false, error: 'That email is already registered.' };

  const id = randomUUID();
  await db.query('insert into users (id, email, password_hash) values ($1, $2, $3)', [
    id,
    normalized,
    await hashPassword(password),
  ]);
  return { ok: true, user: { id, email: normalized } };
}

export async function authenticate(email: string, password: string): Promise<AuthResult> {
  const db = await getDb();
  const row = await db.one<{ id: string; email: string; password_hash: string }>(
    'select id, email, password_hash from users where lower(email) = $1',
    [normalizeEmail(email)],
  );
  // Same message either way, so this does not become an account-existence oracle.
  const wrong = { ok: false as const, error: 'Email or password is incorrect.' };
  if (!row) return wrong;
  return (await verifyPassword(password, row.password_hash))
    ? { ok: true, user: { id: row.id, email: row.email } }
    : wrong;
}

/* ---- Sessions ---------------------------------------------------------- */

function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Returns the raw token for the cookie. Only its digest reaches the database. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const db = await getDb();
  await db.query('insert into sessions (token, user_id, expires_at) values ($1, $2, $3)', [
    tokenDigest(token),
    userId,
    expires,
  ]);
  return token;
}

export async function userForToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const db = await getDb();
  const row = await db.one<{ id: string; email: string }>(
    `select u.id, u.email
       from sessions s
       join users u on u.id = s.user_id
      where s.token = $1 and s.expires_at > now()`,
    [tokenDigest(token)],
  );
  return row ? { id: row.id, email: row.email } : null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const db = await getDb();
  await db.query('delete from sessions where token = $1', [tokenDigest(token)]);
}

/** Housekeeping for expired rows. Safe to call whenever. */
export async function purgeExpiredSessions(): Promise<number> {
  const db = await getDb();
  const rows = await db.query('delete from sessions where expires_at <= now() returning token');
  return rows.length;
}

/**
 * Reading and writing the owner-chosen half of a lot.
 *
 * Ownership is enforced here rather than in the UI: every mutation takes the
 * acting user id and refuses if that user does not own the row. A server action
 * that forgets to check still cannot write to someone else's lot.
 */

import { getDb } from './db';
import {
  isBuildingType,
  normalizeColor,
  normalizeSignText,
  overridesByAddress,
  type LotOverride,
} from './inventory';
import { generateLots, type BuildingType } from './lots';
import {
  isAllowedLogoType,
  logoProblem,
  normalizeBio,
  normalizeHandle,
  normalizeUrl,
  sniffImageType,
  SOCIAL_PLATFORMS,
  type SocialKey,
  type StoreProfile,
} from './store-profile';
import { createHash } from 'crypto';

/** Addresses that actually exist in the inventory. Guards against invented lots. */
let validAddresses: Set<string> | null = null;
export function isRealAddress(address: string): boolean {
  if (!validAddresses) validAddresses = new Set(generateLots().map((lot) => lot.address));
  return validAddresses.has(address);
}

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** How a lot was acquired. Only `claim` is capped. */
export type AcquiredVia = 'claim' | 'grant' | 'purchase';

/** One free lot per account — the rest are given or bought. */
export const FREE_LOTS_PER_ACCOUNT = 1;

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

/** How many lots this account took from the street for free. */
export async function freeClaimCount(userId: string): Promise<number> {
  const db = await getDb();
  const row = await db.one<{ count: string }>(
    `select count(*) as count from lots where owner_id = $1 and acquired_via = 'claim'`,
    [userId],
  );
  return Number(row?.count ?? 0);
}

export async function getOverrides(): Promise<Map<string, LotOverride>> {
  const db = await getDb();
  const rows = await db.query('select * from lots');
  return overridesByAddress(rows);
}

export async function getOverride(address: string): Promise<LotOverride | null> {
  const db = await getDb();
  const row = await db.one('select * from lots where address = $1', [address]);
  return row ? overridesByAddress([row]).get(address) ?? null : null;
}

/**
 * Records a purchase made without an account.
 *
 * This is what a payment webhook calls: at checkout there is no user, only the
 * email the buyer gave the payment provider. The lot becomes theirs immediately
 * and shows on the street; it cannot be customised until someone signs in with
 * that email verified and `linkLotsToUser` hands it over.
 *
 * Idempotent for the same buyer, because payment providers retry webhooks.
 */
export async function purchaseLotForEmail(
  address: string,
  email: string,
  via: Exclude<AcquiredVia, 'claim'> = 'grant',
): Promise<StoreResult<LotOverride>> {
  if (!isRealAddress(address)) return { ok: false, error: 'No such address in Marlow.' };
  const buyer = email.trim().toLowerCase();
  if (!buyer.includes('@')) return { ok: false, error: 'A buyer email is required.' };

  const db = await getDb();
  await db.query(
    `insert into lots (address, owner_email, status, purchased_at, acquired_via)
          values ($1, $2, 'sold', now(), $3)
     on conflict (address) do update
            set owner_email = excluded.owner_email,
                status = 'sold',
                purchased_at = coalesce(lots.purchased_at, now()),
                acquired_via = excluded.acquired_via,
                updated_at = now()
          where lots.owner_id is null
            and (lots.owner_email is null or lower(lots.owner_email) = lower(excluded.owner_email))`,
    [address, buyer, via],
  );

  const stored = await getOverride(address);
  if (!stored) return { ok: false, error: 'Could not record that purchase.' };
  if (stored.ownerEmail !== buyer) return { ok: false, error: 'That lot is already taken.' };
  return { ok: true, value: stored };
}

/**
 * Moves a lot to somebody else's email, for a giveaway.
 *
 * Reserve a batch under your own address so nobody can buy them, then hand each
 * one over as you pick a winner. Unlike `purchaseLotForEmail` this deliberately
 * overwrites who holds the lot — that is the whole job — so it refuses outright
 * when somebody has already signed in and claimed it. Taking a shop off an
 * owner who is using it should never be a typo away.
 *
 * `owner_id` is cleared so the new holder's sign-in links it to them the same
 * way a purchase does. Whatever was built here stays; the new owner can change
 * all of it.
 */
export async function transferLot(
  address: string,
  email: string,
  force = false,
): Promise<StoreResult<LotOverride>> {
  if (!isRealAddress(address)) return { ok: false, error: 'No such address in Marlow.' };
  const holder = email.trim().toLowerCase();
  if (!holder.includes('@')) return { ok: false, error: 'An email is required.' };

  const existing = await getOverride(address);
  if (existing?.ownerId && !force) {
    return {
      ok: false,
      error: `${address} is claimed by a signed-in owner. Pass --force to take it anyway.`,
    };
  }

  const db = await getDb();
  await db.query(
    `insert into lots (address, owner_email, status, purchased_at, acquired_via)
          values ($1, $2, 'sold', now(), 'grant')
     on conflict (address) do update
            set owner_email = excluded.owner_email,
                owner_id = null,
                status = 'sold',
                purchased_at = coalesce(lots.purchased_at, now()),
                updated_at = now()`,
    [address, holder],
  );

  const stored = await getOverride(address);
  return stored
    ? { ok: true, value: stored }
    : { ok: false, error: 'Could not record that transfer.' };
}

/**
 * Hands over every lot bought with this email to the account that has now
 * proved it owns the address.
 *
 * The caller MUST pass an email the identity provider has verified. An
 * unverified address here would let anyone claim a stranger's purchase simply
 * by typing their email at sign-up, so the guard belongs at the call site and
 * is restated in that call site's own comment.
 */
export async function linkLotsToUser(userId: string, verifiedEmail: string): Promise<string[]> {
  const email = verifiedEmail.trim().toLowerCase();
  if (!email.includes('@')) return [];

  const db = await getDb();
  const rows = await db.query<{ address: string }>(
    `update lots
        set owner_id = $1, updated_at = now()
      where lower(owner_email) = $2
        and owner_id is null
      returning address`,
    [userId, email],
  );
  return rows.map((r) => r.address);
}

/* ---- Store profile ----------------------------------------------------- */

const SOCIAL_COLUMNS: Record<SocialKey, string> = {
  x: 'social_x',
  instagram: 'social_instagram',
  tiktok: 'social_tiktok',
  linkedin: 'social_linkedin',
  github: 'social_github',
  discord: 'social_discord',
};

type ProfileRow = Record<string, unknown> & { store_url?: unknown; store_bio?: unknown };

function rowToProfile(row: ProfileRow, hasLogo: boolean): StoreProfile {
  const socials: Partial<Record<SocialKey, string>> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    // Re-validated on the way out: a row written before a rule tightened, or by
    // hand, must not reach an href unchecked.
    const handle = normalizeHandle(row[SOCIAL_COLUMNS[platform.key]]);
    if (handle) socials[platform.key] = handle;
  }
  return {
    url: normalizeUrl(row.store_url),
    bio: normalizeBio(row.store_bio),
    socials,
    hasLogo,
  };
}

export async function getStoreProfile(address: string): Promise<StoreProfile | null> {
  const db = await getDb();
  const row = await db.one<ProfileRow>('select * from lots where address = $1', [address]);
  if (!row) return null;
  const logo = await db.one<{ hash: string }>('select hash from lot_logos where address = $1', [
    address,
  ]);
  return rowToProfile(row, logo !== null);
}

export type StoreProfileInput = {
  storeUrl?: unknown;
  storeBio?: unknown;
} & Partial<Record<SocialKey, unknown>>;

/**
 * Saves the public profile. Blank clears a field, which is the only way to take
 * something down, so an empty string is meaningful rather than ignored.
 */
export async function saveStoreProfile(
  address: string,
  userId: string,
  input: StoreProfileInput,
): Promise<StoreResult<StoreProfile>> {
  const stored = await getOverride(address);
  if (!stored) return { ok: false, error: 'Claim this lot before editing it.' };
  if (stored.ownerId !== userId) return { ok: false, error: 'You do not own that lot.' };

  const blank = (value: unknown) => typeof value === 'string' && value.trim().length === 0;

  let storeUrl: string | null = null;
  if (input.storeUrl !== undefined && !blank(input.storeUrl)) {
    storeUrl = normalizeUrl(input.storeUrl);
    if (!storeUrl) return { ok: false, error: 'That website address does not look right.' };
  }

  let storeBio: string | null = null;
  if (input.storeBio !== undefined && !blank(input.storeBio)) {
    storeBio = normalizeBio(input.storeBio);
  }

  const handles: Partial<Record<SocialKey, string | null>> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const raw = input[platform.key];
    if (raw === undefined || blank(raw)) {
      handles[platform.key] = null;
      continue;
    }
    const handle = normalizeHandle(raw);
    if (!handle) return { ok: false, error: `That ${platform.label} handle does not look right.` };
    handles[platform.key] = handle;
  }

  /*
   * Built from SOCIAL_PLATFORMS rather than written out, so adding a platform
   * is one line in one file. The hand-written version listed every column and
   * every parameter position twice, which meant adding Discord silently wrote
   * the owner id into a handle column until the numbering was fixed by hand.
   *
   * The column names come from SOCIAL_COLUMNS, a fixed constant — never from
   * anything a user supplied — so interpolating them is safe. Every value is
   * still a bound parameter.
   */
  const assignments = SOCIAL_PLATFORMS.map(
    (platform, i) => `${SOCIAL_COLUMNS[platform.key]} = $${i + 4}`,
  ).join(', ');
  const ownerParam = SOCIAL_PLATFORMS.length + 4;

  const db = await getDb();
  await db.query(
    `update lots
        set store_url = $2, store_bio = $3,
            ${assignments},
            updated_at = now()
      where address = $1 and owner_id = $${ownerParam}`,
    [
      address,
      storeUrl,
      storeBio,
      ...SOCIAL_PLATFORMS.map((platform) => handles[platform.key] ?? null),
      userId,
    ],
  );

  const profile = await getStoreProfile(address);
  return profile ? { ok: true, value: profile } : { ok: false, error: 'Could not save that.' };
}

/* ---- Logos ------------------------------------------------------------- */

export type StoredLogo = { bytes: Buffer; contentType: string; hash: string };

/**
 * Stores a logo, trusting the bytes rather than the browser.
 *
 * The declared content type is ignored in favour of the file's magic number:
 * these bytes get served back from our own origin, and a type we never verified
 * is how an "image" ends up being interpreted as something else.
 */
export async function saveLogo(
  address: string,
  userId: string,
  data: Uint8Array,
  _declaredType?: string,
): Promise<StoreResult<string>> {
  const stored = await getOverride(address);
  if (!stored) return { ok: false, error: 'Claim this lot before editing it.' };
  if (stored.ownerId !== userId) return { ok: false, error: 'You do not own that lot.' };

  const problem = logoProblem(data);
  if (problem) return { ok: false, error: problem };

  const contentType = sniffImageType(data);
  if (!contentType || !isAllowedLogoType(contentType)) {
    return { ok: false, error: 'Logos must be a PNG, JPEG or WebP image.' };
  }

  const bytes = Buffer.from(data);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 32);

  const db = await getDb();
  await db.query(
    `insert into lot_logos (address, bytes, content_type, hash, updated_at)
          values ($1, $2, $3, $4, now())
     on conflict (address) do update
            set bytes = excluded.bytes,
                content_type = excluded.content_type,
                hash = excluded.hash,
                updated_at = now()`,
    [address, bytes, contentType, hash],
  );
  return { ok: true, value: hash };
}

export async function getLogo(address: string): Promise<StoredLogo | null> {
  const db = await getDb();
  const row = await db.one<{ bytes: Uint8Array; content_type: string; hash: string }>(
    'select bytes, content_type, hash from lot_logos where address = $1',
    [address],
  );
  if (!row) return null;
  return {
    // node-postgres hands back a Buffer, PGlite a Uint8Array.
    bytes: Buffer.from(row.bytes),
    contentType: row.content_type,
    hash: row.hash,
  };
}

/** Just the hash, for deciding whether to render a logo without loading it. */
export async function logoHash(address: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.one<{ hash: string }>('select hash from lot_logos where address = $1', [
    address,
  ]);
  return row?.hash ?? null;
}

/**
 * Logo hashes for a whole street at once.
 *
 * A street is up to 48 buildings, and asking per building is 48 round trips to
 * render one page. Addresses not in the result simply have no logo.
 */
export async function logoHashesFor(addresses: string[]): Promise<Map<string, string>> {
  if (addresses.length === 0) return new Map();
  const db = await getDb();
  const rows = await db.query<{ address: string; hash: string }>(
    'select address, hash from lot_logos where address = any($1)',
    [addresses],
  );
  return new Map(rows.map((r) => [r.address, r.hash]));
}

export async function deleteLogo(address: string, userId: string): Promise<StoreResult<null>> {
  const db = await getDb();
  const rows = await db.query(
    `delete from lot_logos
      where address = $1
        and exists (select 1 from lots where address = $1 and owner_id = $2)
      returning address`,
    [address, userId],
  );
  return rows.length > 0 ? { ok: true, value: null } : { ok: false, error: 'You do not own that lot.' };
}

export async function lotsOwnedBy(userId: string): Promise<LotOverride[]> {
  const db = await getDb();
  const rows = await db.query('select * from lots where owner_id = $1 order by address', [userId]);
  return [...overridesByAddress(rows).values()];
}

/**
 * Takes an unclaimed lot. Idempotent for the current owner, refused for anyone
 * else — the insert only fires when no row exists, and the guarded update only
 * fires when the existing row has no owner.
 */
export async function claimLot(address: string, userId: string): Promise<StoreResult<LotOverride>> {
  if (!isRealAddress(address)) return { ok: false, error: 'No such address in Marlow.' };
  const db = await getDb();

  // Already yours? Say so without spending the allowance twice.
  const existing = await getOverride(address);
  if (existing?.ownerId === userId) return { ok: true, value: existing };

  const capMessage =
    'You already have your free lot on Marlow. Release it first if you would rather have a different one.';
  if ((await freeClaimCount(userId)) >= FREE_LOTS_PER_ACCOUNT) {
    return { ok: false, error: capMessage };
  }

  try {
    await db.query(
      `insert into lots (address, owner_id, status, acquired_via)
            values ($1, $2, 'sold', 'claim')
       on conflict (address) do update
              set owner_id = excluded.owner_id,
                  status = 'sold',
                  acquired_via = 'claim',
                  updated_at = now()
            where lots.owner_id is null
              and lots.owner_email is null`,
      [address, userId],
    );
  } catch (error) {
    // The partial unique index is the real guarantee; the count above is only
    // there to produce a decent message. Two simultaneous claims land here.
    if (isUniqueViolation(error)) return { ok: false, error: capMessage };
    throw error;
  }

  const stored = await getOverride(address);
  if (!stored) return { ok: false, error: 'Could not claim that lot.' };
  if (stored.ownerId !== userId) return { ok: false, error: 'That lot is already taken.' };
  return { ok: true, value: stored };
}

export type LotChoices = {
  buildingType?: unknown;
  facadeColor?: unknown;
  accentColor?: unknown;
  signText?: unknown;
};

/**
 * Saves an owner's choices. Unrecognised values are rejected outright rather
 * than silently coerced, so a bad request is a visible error, not a surprise
 * building.
 */
export async function saveLotChoices(
  address: string,
  userId: string,
  choices: LotChoices,
): Promise<StoreResult<LotOverride>> {
  const stored = await getOverride(address);
  if (!stored) return { ok: false, error: 'Claim this lot before editing it.' };
  if (stored.ownerId !== userId) return { ok: false, error: 'You do not own that lot.' };

  const patch: { buildingType?: BuildingType; facadeColor?: string; accentColor?: string; signText?: string } = {};

  if (choices.buildingType !== undefined) {
    if (!isBuildingType(choices.buildingType)) return { ok: false, error: 'Unknown building type.' };
    patch.buildingType = choices.buildingType;
  }
  if (choices.facadeColor !== undefined) {
    const color = normalizeColor(choices.facadeColor);
    if (!color) return { ok: false, error: 'Facade colour must come from the Marlow palette.' };
    patch.facadeColor = color;
  }
  if (choices.accentColor !== undefined) {
    const color = normalizeColor(choices.accentColor);
    if (!color) return { ok: false, error: 'Accent colour must come from the Marlow palette.' };
    patch.accentColor = color;
  }
  if (choices.signText !== undefined) {
    const text = normalizeSignText(choices.signText);
    if (!text) return { ok: false, error: 'Sign text needs at least one letter or number.' };
    patch.signText = text;
  }

  const db = await getDb();
  await db.query(
    `update lots
        set building_type = coalesce($2, building_type),
            facade_color  = coalesce($3, facade_color),
            accent_color  = coalesce($4, accent_color),
            sign_text     = coalesce($5, sign_text),
            updated_at    = now()
      where address = $1 and owner_id = $6`,
    [
      address,
      patch.buildingType ?? null,
      patch.facadeColor ?? null,
      patch.accentColor ?? null,
      patch.signText ?? null,
      userId,
    ],
  );

  const updated = await getOverride(address);
  return updated ? { ok: true, value: updated } : { ok: false, error: 'Could not save those changes.' };
}

/** Gives a lot back. The choices go with it, so the next owner starts fresh. */
export async function releaseLot(address: string, userId: string): Promise<StoreResult<null>> {
  const db = await getDb();
  const rows = await db.query('delete from lots where address = $1 and owner_id = $2 returning address', [
    address,
    userId,
  ]);
  return rows.length > 0
    ? { ok: true, value: null }
    : { ok: false, error: 'You do not own that lot.' };
}

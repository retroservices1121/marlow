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

/** Addresses that actually exist in the inventory. Guards against invented lots. */
let validAddresses: Set<string> | null = null;
export function isRealAddress(address: string): boolean {
  if (!validAddresses) validAddresses = new Set(generateLots().map((lot) => lot.address));
  return validAddresses.has(address);
}

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: string };

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
): Promise<StoreResult<LotOverride>> {
  if (!isRealAddress(address)) return { ok: false, error: 'No such address in Marlow.' };
  const buyer = email.trim().toLowerCase();
  if (!buyer.includes('@')) return { ok: false, error: 'A buyer email is required.' };

  const db = await getDb();
  await db.query(
    `insert into lots (address, owner_email, status, purchased_at)
          values ($1, $2, 'sold', now())
     on conflict (address) do update
            set owner_email = excluded.owner_email,
                status = 'sold',
                purchased_at = coalesce(lots.purchased_at, now()),
                updated_at = now()
          where lots.owner_id is null
            and (lots.owner_email is null or lower(lots.owner_email) = lower(excluded.owner_email))`,
    [address, buyer],
  );

  const stored = await getOverride(address);
  if (!stored) return { ok: false, error: 'Could not record that purchase.' };
  if (stored.ownerEmail !== buyer) return { ok: false, error: 'That lot is already taken.' };
  return { ok: true, value: stored };
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

  await db.query(
    `insert into lots (address, owner_id, status)
          values ($1, $2, 'sold')
     on conflict (address) do update
            set owner_id = excluded.owner_id,
                status = 'sold',
                updated_at = now()
          where lots.owner_id is null
            and lots.owner_email is null`,
    [address, userId],
  );

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

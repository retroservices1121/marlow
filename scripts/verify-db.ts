/* Accounts, sessions and the lot store, exercised against a real Postgres engine. */

/*
 * Runs against whatever database it is pointed at. With no DATABASE_URL it uses
 * a throwaway in-memory PGlite; under `railway run` it exercises the real
 * Postgres instead. Everything it creates is namespaced to one run and removed
 * at the end, and the final check asserts the row counts came back to where
 * they started — so it is safe to point at production.
 */
if (!process.env.DATABASE_URL) process.env.PGLITE_DIR = 'memory://';

const RUN = Date.now().toString(36);
const ADA = `ada+${RUN}@example.com`;
const BOB = `bob+${RUN}@example.com`;

import { randomUUID } from 'crypto';
import { getDb, driverName } from '@/lib/db';
import { loadMigrations, migrate, pendingMigrations } from '@/lib/migrate';
import {
  FREE_LOTS_PER_ACCOUNT,
  claimLot,
  freeClaimCount,
  getOverride,
  getOverrides,
  linkLotsToUser,
  lotsOwnedBy,
  purchaseLotForEmail,
  releaseLot,
  saveLogo,
  saveLotChoices,
  saveStoreProfile,
  getStoreProfile,
  getLogo,
  logoHash,
  deleteLogo,
} from '@/lib/lot-store';
import { normalizeHandle, normalizeUrl, socialUrl, MAX_LOGO_BYTES } from '@/lib/store-profile';
import { recordStat, statsFor } from '@/lib/stats';
import { adSlots, nextBidCents, openBid, settleBid } from '@/lib/ads';
import { applyOverrides, buildInventory, normalizeSignText } from '@/lib/inventory';
import { generateLots } from '@/lib/lots';
import { FACADE_PALETTE } from '@/lib/palette';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}

/** Error message from any result union, without narrowing at every call site. */
const errOf = (r: { ok: boolean; error?: string }): string => (r.ok ? '' : r.error ?? '');

async function main() {
  console.log(`driver: ${driverName()}`);
  const db = await getDb();

  /**
   * An account, made the way Clerk's sync makes one.
   *
   * Registration, password hashing and session expiry all moved to Clerk with
   * migration 005, so there is nothing of ours left to test there. What still
   * has to hold is everything downstream: who owns what, and what happens to a
   * lot bought before its buyer had an account.
   */
  const makeUser = async (email: string) => {
    const id = randomUUID();
    await db.query('insert into users (id, clerk_id, email) values ($1, $2, $3)', [
      id,
      `clerk_${id}`,
      email,
    ]);
    return { id, email };
  };

  const baseline = await db.one<{ users: string; lots: string }>(
    `select (select count(*) from users) as users,
            (select count(*) from lots)  as lots`,
  );

  /* ---- Schema ---- */
  const tables = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  check(
    '1. schema creates users, lots, lot_logos',
    ['lot_logos', 'lots', 'users'].every((t) => tables.some((r) => r.table_name === t)),
    tables.map((t) => t.table_name).join(','),
  );

  /* ---- Migrations ---- */
  check('1a. every migration on disk has been applied', (await pendingMigrations(db)).length === 0);
  check(
    '1b. migrations are recorded',
    (await db.query('select name from schema_migrations')).length === loadMigrations().length,
  );
  check('1c. re-running migrations applies nothing', (await migrate(db)).length === 0);
  check(
    '1d. migration names are ordered and unique',
    (() => {
      const names = loadMigrations().map((m) => m.name);
      return new Set(names).size === names.length && [...names].sort().join() === names.join();
    })(),
  );

  /* ---- Accounts ---- */
  const reg = { ok: true as const, user: await makeUser(ADA) };
  check('2. an account can be created', reg.user.id.length > 0);
  check('3. its email is stored for matching a purchase', reg.user.email === ADA);
  check(
    '4. the password and session tables are gone',
    (await db.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name = 'sessions'`,
    )).length === 0,
  );
  check(
    '5. no password hash column survives',
    (await db.query(
      `select column_name from information_schema.columns
        where table_name = 'users' and column_name = 'password_hash'`,
    )).length === 0,
  );
  check(
    '6. every account is keyed to a Clerk id',
    (await db.query(`select clerk_id from users where clerk_id is null`)).length === 0,
  );

  const ada = reg.user;

  /* ---- Claiming ---- */
  const bob = await makeUser(BOB);

  const taken = new Set(
    (await db.query<{ address: string }>('select address from lots')).map((r) => r.address),
  );
  const free = generateLots().filter((l) => !taken.has(l.address));
  const address = free[0].address;
  const claim = await claimLot(address, ada.id);
  check('22. an unclaimed lot can be claimed', claim.ok);
  check('23. claiming marks the lot sold', claim.ok && claim.value.status === 'sold');

  const steal = await claimLot(address, bob.id);
  check('24. a claimed lot cannot be taken by someone else', !steal.ok, steal.ok ? 'stolen!' : '');
  const stillAda = await getOverride(address);
  check('25. owner is unchanged after a failed claim', stillAda?.ownerId === ada.id);

  const reclaim = await claimLot(address, ada.id);
  check('26. re-claiming your own lot is idempotent', reclaim.ok);
  check('27. fake addresses are refused', !(await claimLot('999 Nowhere Street', ada.id)).ok);

  /* ---- Editing ---- */
  const saved = await saveLotChoices(address, ada.id, {
    facadeColor: FACADE_PALETTE[3],
    accentColor: FACADE_PALETTE[7],
    signText: '  ada’s  bakery!! ',
    buildingType: 'tower',
  });
  check('28. owner can save choices', saved.ok, errOf(saved));
  check('29. sign text is normalised', saved.ok && saved.value.signText === 'ADAS BAKERY', saved.ok ? String(saved.value.signText) : '');
  check('30. building type is stored', saved.ok && saved.value.buildingType === 'tower');

  const intruder = await saveLotChoices(address, bob.id, { signText: 'BOB WAS HERE' });
  check('31. a non-owner cannot edit', !intruder.ok);
  check(
    '32. sign is unchanged after a rejected edit',
    (await getOverride(address))?.signText === 'ADAS BAKERY',
  );

  const offPalette = await saveLotChoices(address, ada.id, { facadeColor: '#123456' });
  check('33. off-palette colour is refused', !offPalette.ok);
  const badType = await saveLotChoices(address, ada.id, { buildingType: 'castle' });
  check('34. unknown building type is refused', !badType.ok);
  const emptySign = await saveLotChoices(address, ada.id, { signText: '!!!' });
  check('35. sign with no usable characters is refused', !emptySign.ok);
  check(
    '36. nothing was written by the rejected edits',
    (await getOverride(address))?.facadeColor === FACADE_PALETTE[3],
  );

  const unclaimed = free[1].address;
  check('37. editing an unclaimed lot is refused', !(await saveLotChoices(unclaimed, ada.id, { signText: 'X' })).ok);

  /* ---- Merge onto the inventory ---- */
  const overrides = await getOverrides();
  const merged = applyOverrides(generateLots(), overrides);
  const editedLot = merged.find((l) => l.address === address)!;
  check('38. stored choices reach the inventory', editedLot.signText === 'ADAS BAKERY' && editedLot.buildingType === 'tower');
  check('39. edited lot is marked claimed', editedLot.claimed && editedLot.ownerId === ada.id);

  const base = generateLots();
  const untouched = merged.filter((l) => l.address !== address);
  check(
    '40. every other lot is byte-identical to the generated default',
    untouched.every((l) => {
      const original = base.find((b) => b.address === l.address)!;
      return (
        l.signText === original.signText &&
        l.facadeColor === original.facadeColor &&
        l.accentColor === original.accentColor &&
        l.buildingType === original.buildingType &&
        l.status === original.status
      );
    }),
  );

  check('41. an empty store changes nothing at all', (() => {
    const none = applyOverrides(base, new Map());
    return none.every((l, i) => l.signText === base[i].signText && l.status === base[i].status);
  })());

  /* ---- Ownership listing and release ---- */
  check('42. owner can list their lots', (await lotsOwnedBy(ada.id)).length === 1);
  check('43. other users own nothing', (await lotsOwnedBy(bob.id)).length === 0);
  check('44. a non-owner cannot release', !(await releaseLot(address, bob.id)).ok);
  check('45. owner can release', (await releaseLot(address, ada.id)).ok);
  check('46. released lot returns to the generated default', (await getOverride(address)) === null);

  /* ---- Buying without an account, then linking it -----------------------
   * The whole point: a purchase happens at checkout where there is no user,
   * and becomes editable only once someone signs in with that email verified.
   */
  const bought = free[2].address;
  const buyerEmail = `Buyer+${RUN}@Example.com`;
  const purchase = await purchaseLotForEmail(bought, buyerEmail);
  check('49a. a lot can be bought with no account', purchase.ok, errOf(purchase));
  check(
    '49b. purchase stores the email folded and marks it sold',
    purchase.ok && purchase.value.ownerEmail === buyerEmail.toLowerCase() && purchase.value.status === 'sold',
  );
  check('49c. a purchased lot has no account behind it yet', purchase.ok && purchase.value.ownerId === null);

  const repeat = await purchaseLotForEmail(bought, buyerEmail.toUpperCase());
  check('49d. a retried webhook for the same buyer is idempotent', repeat.ok, errOf(repeat));

  const otherBuyer = await purchaseLotForEmail(bought, `someone-else+${RUN}@example.com`);
  check('49e. a second buyer cannot buy a sold lot', !otherBuyer.ok, otherBuyer.ok ? 'double sold!' : '');
  check('49f. the original buyer still holds it', (await getOverride(bought))?.ownerEmail === buyerEmail.toLowerCase());

  check('49g. a purchased lot cannot be claimed by a signed-in stranger', !(await claimLot(bought, bob.id)).ok);
  check('49h. a purchased lot cannot be edited by anyone yet', !(await saveLotChoices(bought, ada.id, { signText: 'NOPE' })).ok);

  const purchasedInventory = buildInventory(await getOverrides()).find((l) => l.address === bought)!;
  check('49i. a purchased lot reads as claimed but awaiting its owner',
    purchasedInventory.claimed && purchasedInventory.awaitingOwner);

  // The dangerous case: the wrong account must not inherit the purchase.
  const wrongLink = await linkLotsToUser(bob.id, `not-the-buyer+${RUN}@example.com`);
  check('49j. a different email links nothing', wrongLink.length === 0);
  check('49k. the purchase is untouched after a mismatched link', (await getOverride(bought))?.ownerId === null);

  const linked = await linkLotsToUser(ada.id, buyerEmail.toUpperCase());
  check('49l. signing in with the buyer email links the lot', linked.includes(bought), linked.join(','));
  const afterLink = await getOverride(bought);
  check('49m. the lot now belongs to the account', afterLink?.ownerId === ada.id);
  check('49n. the buyer email is kept as the purchase record', afterLink?.ownerEmail === buyerEmail.toLowerCase());

  const nowEditable = await saveLotChoices(bought, ada.id, { signText: 'BOUGHT FIRST' });
  check('49o. the linked owner can finally customise it', nowEditable.ok, errOf(nowEditable));
  check('49p. still refused for everyone else', !(await saveLotChoices(bought, bob.id, { signText: 'NO' })).ok);
  check('49q. linking again is a no-op', (await linkLotsToUser(ada.id, buyerEmail)).length === 0);
  check(
    '49r. it shows in the dashboard of the account it linked to',
    (await lotsOwnedBy(ada.id)).some((l) => l.address === bought),
  );

  /* ---- One free lot per account -----------------------------------------
   * Plots are being given away to seed the town, so self-serve claiming has to
   * be capped or one person can take the whole street in a loop. This section
   * establishes its own state rather than inheriting it: by now Ada holds only
   * the linked purchase, having released her earlier claim above.
   */
  const freeA = free[3].address;
  const freeB = free[4].address;

  check('49s. a linked purchase does not spend the free allowance', (await freeClaimCount(ada.id)) === 0);

  const firstFree = await claimLot(freeA, ada.id);
  check('49t. an account can claim one free lot', firstFree.ok, errOf(firstFree));
  check('49u. the free claim is counted', (await freeClaimCount(ada.id)) === FREE_LOTS_PER_ACCOUNT);

  const secondFree = await claimLot(freeB, ada.id);
  check('49v. a second free lot is refused', !secondFree.ok, secondFree.ok ? 'claimed twice!' : '');
  check('49w. the refusal explains the cap', !secondFree.ok && /free lot/i.test(errOf(secondFree)), errOf(secondFree));
  check('49x. nothing was written by the refused claim', (await getOverride(freeB)) === null);

  check('49y. re-claiming the lot you already hold still succeeds', (await claimLot(freeA, ada.id)).ok);
  check('49z. that did not spend a second allowance', (await freeClaimCount(ada.id)) === FREE_LOTS_PER_ACCOUNT);

  const bobsFree = await claimLot(freeB, bob.id);
  check('49aa. a different account still gets its own free lot', bobsFree.ok, errOf(bobsFree));
  await releaseLot(freeB, bob.id);

  // Releasing gives the allowance back, so a mistake is not permanent.
  await releaseLot(freeA, ada.id);
  check('49ab. releasing frees the allowance again', (await freeClaimCount(ada.id)) === 0);
  const afterRelease = await claimLot(freeB, ada.id);
  check('49ac. and another lot can then be claimed', afterRelease.ok, errOf(afterRelease));
  await releaseLot(freeB, ada.id);

  check(
    '49ad. a granted lot is recorded as a grant, not a claim',
    (await db.one<{ acquired_via: string }>('select acquired_via from lots where address = $1', [bought]))
      ?.acquired_via === 'grant',
  );

  await releaseLot(bought, ada.id);

  /* ---- Store profile ----------------------------------------------------
   * Every field here is attacker-controlled and ends up on a public page, so
   * the refusals matter more than the successes.
   */
  const shop = free[5].address;
  await claimLot(shop, bob.id);

  const profileSaved = await saveStoreProfile(shop, bob.id, {
    storeUrl: 'nike.com',
    storeBio: '  Trainers   and   such.  ',
    x: '@nike',
    instagram: 'https://instagram.com/nike/',
    github: '',
  });
  check('49ae. a shop profile can be saved', profileSaved.ok, errOf(profileSaved));
  check('49af. a bare domain becomes an absolute https url', profileSaved.ok && profileSaved.value.url === 'https://nike.com/');
  check('49ag. the bio is collapsed and trimmed', profileSaved.ok && profileSaved.value.bio === 'Trainers and such.');
  check('49ah. an @ prefix is stripped from a handle', profileSaved.ok && profileSaved.value.socials.x === 'nike');
  check('49ai. a pasted profile url reduces to a handle', profileSaved.ok && profileSaved.value.socials.instagram === 'nike');
  check('49aj. a blank social is cleared, not stored', profileSaved.ok && profileSaved.value.socials.github === undefined);

  // The link is built from a fixed prefix, so a handle cannot redirect it.
  check('49ak. social links are built from our own prefix', socialUrl('x', 'nike') === 'https://x.com/nike');

  /*
   * Discord is an invite, not a profile — the only Discord link that means
   * anything to somebody who is not already in the server.
   *
   * Every other field is repeated here on purpose: a save is the whole profile,
   * and anything left out is cleared. That is what makes a blank field the way
   * to take something down, and it is why this cannot be a discord-only call.
   */
  const withDiscord = await saveStoreProfile(shop, bob.id, {
    storeUrl: 'nike.com',
    storeBio: 'Trainers and such.',
    x: '@nike',
    instagram: 'https://instagram.com/nike/',
    discord: 'https://discord.gg/aB3xY9z',
  });
  check(
    '49ak1. a pasted discord invite reduces to its code',
    withDiscord.ok && withDiscord.value.socials.discord === 'aB3xY9z',
  );
  check(
    '49ak2. a discord link is built as an invite',
    socialUrl('discord', 'aB3xY9z') === 'https://discord.gg/aB3xY9z',
  );

  for (const nasty of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'file:///etc/passwd', 'vbscript:msgbox']) {
    check(`49al. refuses ${nasty.split(':')[0]}: urls`, normalizeUrl(nasty) === null, nasty);
  }
  const badUrl = await saveStoreProfile(shop, bob.id, { storeUrl: 'javascript:alert(1)' });
  check('49am. a dangerous url is refused on save', !badUrl.ok);
  check('49an. the previous url survives a refused save', (await getStoreProfile(shop))?.url === 'https://nike.com/');

  check('49ao. a handle cannot smuggle a path', normalizeHandle('nike/../evil') === null);
  check('49ap. a handle cannot contain a scheme', normalizeHandle('javascript:alert(1)') === null);
  const badHandle = await saveStoreProfile(shop, bob.id, { x: 'not a handle!' });
  check('49aq. a malformed handle is refused on save', !badHandle.ok);

  check('49ar. a stranger cannot edit a shop profile', !(await saveStoreProfile(shop, ada.id, { storeBio: 'mine now' })).ok);

  /* ---- What an owner gets back ---- */

  check('49bg. a view is counted', await recordStat(shop, 'view'));
  await recordStat(shop, 'view');
  await recordStat(shop, 'link');
  check('49bh. a social click needs a real platform', await recordStat(shop, 'social', 'instagram'));
  check(
    '49bi. an invented platform is refused',
    !(await recordStat(shop, 'social', 'myspace')),
  );
  check('49bj. an unknown kind is refused', !(await recordStat(shop, 'sniff')));
  check('49bk. an invented address is refused', !(await recordStat('1 Nowhere Road', 'view')));

  const counted = await statsFor(shop);
  check('49bl. views add up', counted.views === 2, String(counted.views));
  check('49bm. link clicks are separate from views', counted.linkClicks === 1, String(counted.linkClicks));
  check('49bn. social clicks are attributed to the platform',
    counted.socialClicks.length === 1 && counted.socialClicks[0].key === 'instagram');
  check('49bo. a platform nobody clicked is not listed',
    !counted.socialClicks.some((sc) => sc.key === 'x'));
  check(
    '49bp. a shop nobody visited reads zero, not null',
    (await statsFor(free[6].address)).views === 0,
  );

  /* ---- Bidding for a vehicle ---- */

  const artwork = Buffer.from(
    '89504e470d0a1a0a0000000d494844520000000100000001080600000' +
      '01f15c4890000000a49444154789c6300010000050001' +
      '0d0a2db40000000049454e44ae426082',
    'hex',
  );

  const vehicles = await adSlots();
  const van = vehicles.find((v) => v.kind === 'van');
  check('49bq. the three vehicles exist', vehicles.length === 3);
  check('49br. the van has a floor', (van?.minBidCents ?? 0) === 300, String(van?.minBidCents));
  check(
    '49bs. bids step a whole dollar, not a penny',
    van !== undefined && nextBidCents({ ...van, bidCents: 500 }) === 600,
  );

  check(
    '49bt. a bid under the floor is refused',
    !(await openBid({ kind: 'van', cents: 100, email: BOB, url: 'nike.com', artwork })).ok,
  );
  check(
    '49bu. artwork that is not an image is refused',
    !(await openBid({ kind: 'van', cents: 300, email: BOB, url: 'nike.com', artwork: Buffer.from('not a png') })).ok,
  );
  check(
    '49bv. a bid on an invented vehicle is refused',
    !(await openBid({ kind: 'hovercraft', cents: 900, email: BOB, url: 'nike.com', artwork })).ok,
  );

  const first = await openBid({ kind: 'van', cents: 400, email: BOB, url: 'nike.com', artwork });
  check('49bw. a good bid is accepted', first.ok, errOf(first));

  check(
    '49bx. nothing is awarded until the money arrives',
    (await adSlots()).find((v) => v.kind === 'van')?.bidCents === 0,
  );

  if (first.ok) {
    const settled = await settleBid(first.value.id);
    check('49by. a paid bid wins an empty vehicle', settled.ok && settled.value.won);
    check('49bz. and it says it did the work', settled.ok && settled.value.fresh);
    check(
      '49ca. the vehicle now stands at that bid',
      (await adSlots()).find((v) => v.kind === 'van')?.bidCents === 400,
    );

    // The same delivery arriving twice, which Polar does on every sale.
    const again = await settleBid(first.value.id);
    check('49cb. settling twice does not do it twice', again.ok && !again.value.fresh);
    check('49cc. and nobody is displaced by the repeat', again.ok && again.value.displaced === null);
  }

  /*
   * The boundary, either side of it. Standing at 400 with a dollar step means
   * 500 is the first bid that counts and 499 is not — and the first version of
   * this check asserted that 500 should be refused, which would have made the
   * minimum unreachable by anybody paying it exactly.
   */
  const under = await openBid({ kind: 'van', cents: 499, email: ADA, url: 'nike.com', artwork });
  check(
    '49cd. a penny under the step is refused',
    !under.ok,
    under.ok ? 'accepted 499 against a standing 400' : '',
  );
  const exact = await openBid({ kind: 'van', cents: 500, email: ADA, url: 'nike.com', artwork });
  check(
    '49cd1. exactly a dollar more is accepted',
    exact.ok,
    exact.ok ? '' : errOf(exact),
  );

  const over = await openBid({ kind: 'van', cents: 800, email: ADA, url: 'nike.com', artwork });
  if (over.ok) {
    const beat = await settleBid(over.value.id);
    check('49ce. a higher paid bid takes the vehicle', beat.ok && beat.value.won);
    check(
      '49cf. and names who was pushed off, so they can be told',
      beat.ok && beat.value.displaced === BOB,
      beat.ok ? String(beat.value.displaced) : '',
    );
  }

  /* ---- Logos ---- */
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d494844520000000100000001080600000' + '01f15c4890000000a49444154789c6300010000050001' + '0d0a2db40000000049454e44ae426082',
    'hex',
  );
  const savedLogo = await saveLogo(shop, bob.id, new Uint8Array(png), 'image/png');
  check('49as. a real png is accepted', savedLogo.ok, errOf(savedLogo));
  const fetched = await getLogo(shop);
  check('49at. the logo comes back with the sniffed type', fetched?.contentType === 'image/png');
  check('49au. the hash is exposed for cache-busting', (await logoHash(shop)) === (savedLogo.ok ? savedLogo.value : ''));

  // A file that merely claims to be a PNG must not be served back as one.
  const notAnImage = new Uint8Array(Buffer.from('<svg onload=alert(1)></svg>', 'utf8'));
  check('49av. bytes that are not an image are refused', !(await saveLogo(shop, bob.id, notAnImage, 'image/png')).ok);
  const svg = new Uint8Array(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8'));
  check('49aw. svg is refused even when declared as svg', !(await saveLogo(shop, bob.id, svg, 'image/svg+xml')).ok);
  check('49ax. an oversized file is refused', !(await saveLogo(shop, bob.id, new Uint8Array(MAX_LOGO_BYTES + 1), 'image/png')).ok);
  check('49ay. an empty file is refused', !(await saveLogo(shop, bob.id, new Uint8Array(0), 'image/png')).ok);
  check('49az. the good logo survived every refused upload', (await getLogo(shop))?.contentType === 'image/png');
  check('49ba. a stranger cannot upload a logo', !(await saveLogo(shop, ada.id, new Uint8Array(png), 'image/png')).ok);
  check('49bb. a stranger cannot delete a logo', !(await deleteLogo(shop, ada.id)).ok);
  check('49bc. the owner can delete it', (await deleteLogo(shop, bob.id)).ok);
  check('49bd. it is gone', (await logoHash(shop)) === null);

  await releaseLot(shop, bob.id);

  /* ---- Normalisation edge cases ---- */
  check('47. sign text is capped at 18 characters', normalizeSignText('ABCDEFGHIJKLMNOPQRSTUVWXYZ')?.length === 18);
  check('48. sign text strips scripting characters', normalizeSignText('<script>hi</script>') === 'SCRIPTHISCRIPT');
  check('49. whitespace-only sign text is rejected', normalizeSignText('   ') === null);

  /* ---- Leave no trace ---------------------------------------------------
   * Everything this run created is namespaced to RUN, so it can be removed
   * precisely. The final check is what makes the harness safe to point at a
   * real database: it asserts the row counts came back to where they started.
   */
  await db.query('delete from lots where address = any($1::text[])', [
    [address, unclaimed, bought, freeA, freeB, shop],
  ]);
  await db.query('delete from users where email like $1', [`%+${RUN}@example.com`]);

  const after = await db.one<{ users: string; lots: string }>(
    `select (select count(*) from users) as users,
            (select count(*) from lots)  as lots`,
  );
  check(
    '50. the database is left exactly as it was found',
    Number(after?.users) === Number(baseline?.users) &&
      Number(after?.lots) === Number(baseline?.lots),
    `before ${JSON.stringify(baseline)} after ${JSON.stringify(after)}`,
  );

  console.log(failures === 0 ? '\nALL DATABASE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  await db.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(1);
});

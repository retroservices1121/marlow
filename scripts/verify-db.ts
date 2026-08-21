/* Accounts, sessions and the lot store, exercised against a real Postgres engine. */

process.env.PGLITE_DIR = 'memory://';
delete process.env.DATABASE_URL;

import { getDb, driverName } from '@/lib/db';
import {
  authenticate,
  createSession,
  destroySession,
  hashPassword,
  purgeExpiredSessions,
  registerUser,
  userForToken,
  verifyPassword,
} from '@/lib/auth';
import { claimLot, getOverride, getOverrides, lotsOwnedBy, releaseLot, saveLotChoices } from '@/lib/lot-store';
import { applyOverrides, normalizeSignText } from '@/lib/inventory';
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

  /* ---- Schema ---- */
  const tables = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  check(
    '1. schema creates users, sessions, lots',
    ['lots', 'sessions', 'users'].every((t) => tables.some((r) => r.table_name === t)),
    tables.map((t) => t.table_name).join(','),
  );

  /* ---- Passwords ---- */
  const hash = await hashPassword('correct horse battery');
  check('2. hash does not contain the password', !hash.includes('correct horse battery'));
  check('3. correct password verifies', await verifyPassword('correct horse battery', hash));
  check('4. wrong password rejected', !(await verifyPassword('correct horse batteryy', hash)));
  check('5. two hashes of one password differ (salted)', hash !== (await hashPassword('correct horse battery')));
  check('6. garbage hash rejected, not thrown', !(await verifyPassword('x', 'not-a-hash')));

  /* ---- Registration ---- */
  const reg = await registerUser('Ada@Example.com', 'hunter2hunter2');
  check('7. registration succeeds', reg.ok);
  check('8. email is normalised', reg.ok && reg.user.email === 'ada@example.com');

  const dupe = await registerUser('ADA@example.com', 'anotherpassword');
  check('9. duplicate email rejected case-insensitively', !dupe.ok, dupe.ok ? 'accepted' : '');

  const weak = await registerUser('bob@example.com', 'short');
  check('10. short password rejected', !weak.ok);
  const bad = await registerUser('not-an-email', 'longenoughpassword');
  check('11. invalid email rejected', !bad.ok);

  /* ---- Authentication ---- */
  const good = await authenticate('ada@example.com', 'hunter2hunter2');
  check('12. correct credentials authenticate', good.ok);
  const wrongPass = await authenticate('ada@example.com', 'wrong');
  const noUser = await authenticate('nobody@example.com', 'wrong');
  check('13. wrong password refused', !wrongPass.ok);
  check(
    '14. unknown user and wrong password give the same message',
    !wrongPass.ok && !noUser.ok && errOf(wrongPass) === errOf(noUser),
  );

  if (!reg.ok) throw new Error('cannot continue without a user');
  const ada = reg.user;

  /* ---- Sessions ---- */
  const token = await createSession(ada.id);
  const sessionUser = await userForToken(token);
  check('15. session resolves to its user', sessionUser?.id === ada.id);
  check('16. unknown token resolves to nobody', (await userForToken('made-up-token')) === null);
  check('17. absent token resolves to nobody', (await userForToken(undefined)) === null);

  const storedTokens = await db.query<{ token: string }>('select token from sessions');
  check(
    '18. raw token is never stored, only its digest',
    storedTokens.every((r) => r.token !== token),
  );

  await db.query(`update sessions set expires_at = now() - interval '1 hour'`);
  check('19. expired session resolves to nobody', (await userForToken(token)) === null);
  check('20. expired sessions can be purged', (await purgeExpiredSessions()) > 0);

  const live = await createSession(ada.id);
  await destroySession(live);
  check('21. logout deletes the session', (await userForToken(live)) === null);

  /* ---- Claiming ---- */
  const bobReg = await registerUser('bob@example.com', 'bobspassword1');
  if (!bobReg.ok) throw new Error('bob should have registered');
  const bob = bobReg.user;

  const address = generateLots()[10].address;
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

  const unclaimed = generateLots()[11].address;
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

  /* ---- Normalisation edge cases ---- */
  check('47. sign text is capped at 18 characters', normalizeSignText('ABCDEFGHIJKLMNOPQRSTUVWXYZ')?.length === 18);
  check('48. sign text strips scripting characters', normalizeSignText('<script>hi</script>') === 'SCRIPTHISCRIPT');
  check('49. whitespace-only sign text is rejected', normalizeSignText('   ') === null);

  console.log(failures === 0 ? '\nALL DATABASE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  await db.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(1);
});

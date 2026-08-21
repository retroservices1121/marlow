/*
 * End-to-end: register, claim, edit, and confirm it reaches the street.
 *
 * Drives a real Chrome against a running server. Start one first:
 *
 *   npm run build && npx next start -p 3210
 *   npm run verify:e2e
 *
 * Needs Chrome installed and `puppeteer-core` available; set CHROME_PATH if
 * yours lives somewhere other than the default Windows location. This is the
 * only harness that is not self-contained, which is why it is a separate
 * script rather than part of `npm run verify`.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME =
  process.env.CHROME_PATH || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const BASE = process.env.MARLOW_URL || 'http://localhost:3210';
const OUT = __dirname;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`);
};

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

/*
 * CSS uppercases button labels, and innerText reflects text-transform. Matching
 * case-sensitively made the negative assertions pass for the wrong reason.
 */
const has = (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase());

// Unique per run: the PGlite database persists between runs.
const RUN = Date.now().toString(36);

async function newBrowser() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'marlow-e2e-')),
    args: ['--disable-gpu', '--no-sandbox'],
  });
}

(async () => {
  const browser = await newBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  /* ---- The street still renders from the database ---- */
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.mw-building-link');
  const buildings = await page.$$eval('.mw-building-link', (els) => els.length);
  check('1. street renders 120 buildings from the database', buildings === 120, String(buildings));

  const vacant = await page.$$eval('.mw-building-link', (els) => {
    const el = els.find((e) => (e.getAttribute('aria-label') || '').startsWith('Vacant lot'));
    return el ? el.getAttribute('href') : null;
  });
  check('2. vacant lots are linked', Boolean(vacant), String(vacant));
  const address = decodeURIComponent((vacant || '').replace('/lots/', ''));
  console.log(`    target lot: ${address}`);

  /* ---- Anonymous visitor sees a claim prompt, not an editor ---- */
  await page.goto(`${BASE}${vacant}`, { waitUntil: 'domcontentloaded' });
  const anonBody = await page.evaluate(() => document.body.innerText);
  check('3. anonymous visitor is invited to sign in', has(anonBody, 'Sign in to claim'));
  check('4. anonymous visitor gets no editor', !has(anonBody, 'Save changes'));

  /* ---- Register ---- */
  const email = `ada+${RUN}@example.com`;
  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', 'a-good-long-password');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
    page.click('main button[type="submit"]'),
  ]);
  await settle(800);
  check('5. registration lands on the owner dashboard', page.url().includes('/lots'), page.url());
  const dash = await page.evaluate(() => document.body.innerText);
  check('6. dashboard shows the signed-in email', has(dash, email));
  check('7. new account owns nothing', has(dash, 'do not own anything yet'));

  /* ---- Weak password is refused ---- */
  const weakBrowser = await newBrowser();
  const other = await weakBrowser.newPage();
  await other.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  await other.type('input[name="email"]', `weak+${RUN}@example.com`);
  await other.type('input[name="password"]', 'short');
  await other.click('main button[type="submit"]');
  await settle(900);
  const weakText = await other.evaluate(() => document.body.innerText);
  check('8. short password is refused with a message', has(weakText, 'at least'), weakText.slice(0, 120));
  await weakBrowser.close();

  /* ---- Claim ---- */
  await page.goto(`${BASE}${vacant}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main button[type="submit"]');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
    page.click('main button[type="submit"]'),
  ]);
  await settle(900);
  const claimed = await page.evaluate(() => document.body.innerText);
  check('9. claiming opens the editor', has(claimed, 'Save changes'), page.url());
  check('10. lot now reads as yours', has(claimed, 'Yours'));

  /* ---- Edit ---- */
  await page.waitForSelector('input[name="signText"]');
  await page.evaluate(() => {
    const input = document.querySelector('input[name="signText"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.type('input[name="signText"]', 'ADAS TEST SHOP');
  // Pick a facade swatch that is not the current one.
  await page.evaluate(() => {
    const swatches = [...document.querySelectorAll('.mw-swatch')];
    const first = swatches.find((s) => s.getAttribute('aria-pressed') !== 'true');
    first.click();
  });
  await settle(300);

  const previewBefore = await page.$eval('.mw-preview-svg', (el) => el.textContent);
  check('11. live preview shows the typed sign', previewBefore.includes('ADAS TEST SHOP'), previewBefore.slice(0, 80));

  await page.click('main button[type="submit"]');
  await settle(1200);
  const afterSave = await page.evaluate(() => document.body.innerText);
  check('12. save reports success', has(afterSave, 'on the street'), afterSave.slice(0, 200));

  /* ---- It reaches the street ---- */
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.mw-street');
  const streetText = await page.$eval('.mw-street', (el) => el.textContent);
  check('13. the new sign appears on the street', streetText.includes('ADAS TEST SHOP'));
  const stillVacant = await page.$$eval('.mw-building-link', (els) =>
    els.some((e) => (e.getAttribute('aria-label') || '').includes('ADAS TEST SHOP')),
  );
  check('14. the claimed building is no longer a vacant lot', stillVacant);
  await page.screenshot({ path: path.join(OUT, 'e2e-street.png') });

  /* ---- Dashboard lists it ---- */
  await page.goto(`${BASE}/lots`, { waitUntil: 'domcontentloaded' });
  const dash2 = await page.evaluate(() => document.body.innerText);
  check('15. dashboard lists the owned lot', has(dash2, 'ADAS TEST SHOP') && has(dash2, address));
  await page.screenshot({ path: path.join(OUT, 'e2e-dashboard.png') });

  /* ---- A different account cannot edit it ---- */
  const intruderBrowser = await newBrowser();
  const intruder = await intruderBrowser.newPage();
  await intruder.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  await intruder.type('input[name="email"]', `mallory+${RUN}@example.com`);
  await intruder.type('input[name="password"]', 'another-long-password');
  await Promise.all([
    intruder.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
    intruder.click('main button[type="submit"]'),
  ]);
  await settle(800);
  await intruder.goto(`${BASE}/lots/${encodeURIComponent(address)}`, { waitUntil: 'domcontentloaded' });
  const intruderView = await intruder.evaluate(() => document.body.innerText);
  check('16. another owner sees no editor', !has(intruderView, 'Save changes'), intruderView.slice(0, 150));
  check('17. another owner sees it as taken', has(intruderView, 'Taken'));
  await intruderBrowser.close();

  /* ---- Sign out ---- */
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' });
  const signOut = await page.$$eval('button', (els) =>
    els.some((e) => e.textContent.trim() === 'Sign out'),
  );
  check('18. signed-in nav offers sign out', signOut);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Sign out');
    btn.click();
  });
  await settle(1200);
  await page.goto(`${BASE}/lots`, { waitUntil: 'domcontentloaded' });
  check('19. signing out revokes access to the dashboard', page.url().includes('/login'), page.url());

  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' });
  const finalStreet = await page.$eval('.mw-street', (el) => el.textContent);
  check('20. the building survives the owner signing out', finalStreet.includes('ADAS TEST SHOP'));

  console.log(failures === 0 ? '\nALL END-TO-END CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('E2E ERROR:', e.message);
  process.exit(1);
});

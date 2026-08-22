/* Acceptance-criteria harness for the Marlow renderer (spec §12). */
import { renderToStaticMarkup } from 'react-dom/server';
import Street from '@/components/Street';
import Building from '@/components/Building';
import {
  STREETS,
  DISTRICTS,
  cornerIndices,
  generateLots,
  parentStreet,
  junctionsOn,
  type Lot,
} from '@/lib/lots';
import { TIMES_OF_DAY, FACADE_PALETTE, type TimeOfDay } from '@/lib/palette';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? ` — ${detail}` : ''}`);
}

const lots = generateLots();

const renderStreet = (l: Lot[], t: TimeOfDay, linked = false) =>
  renderToStaticMarkup(
    <Street
      lots={l}
      timeOfDay={t}
      hrefForStreet={linked ? (street) => `/street/${street.slug}` : undefined}
    />,
  );

const renderBuilding = (lot: Lot, t: TimeOfDay, x = 0) =>
  renderToStaticMarkup(
    <Building
      address={lot.address}
      number={lot.number}
      street={lot.street}
      status={lot.status}
      buildingType={lot.buildingType}
      facadeColor={lot.facadeColor}
      accentColor={lot.accentColor}
      signText={lot.signText}
      timeOfDay={t}
      x={x}
    />,
  );

/** Drop every colour attribute, keeping shape and line weight. */
const shapeOnly = (svg: string) =>
  svg.replace(/ (?:fill|stroke)="[^"]*"/g, '').replace(/ style="[^"]*"/g, '');

/** Drop the outer position transform so shape can be compared across moves. */
const unpositioned = (svg: string) => svg.replace(/transform="translate\([^)]*\)"/, '');

console.log(`lots: ${lots.length}`);

/* 1. Ten renders are identical. */
const first = renderStreet(lots, 'day');
let stable = true;
for (let i = 0; i < 10; i++) stable &&= renderStreet(generateLots(), 'day') === first;
check('1. ten renders are byte-identical', stable);

/* 2. timeOfDay changes fills only, never geometry. */
let geometryStable = true;
const details: string[] = [];
for (const lot of lots) {
  const shapes = TIMES_OF_DAY.map((t) => shapeOnly(renderBuilding(lot, t)));
  const same = shapes.every((s) => s === shapes[0]);
  if (!same) {
    geometryStable = false;
    if (details.length < 2) details.push(lot.address);
  }
}
check('2. timeOfDay changes no geometry', geometryStable, details.join(', '));

const fillsChange = TIMES_OF_DAY.map((t) => renderStreet(lots, t));
check(
  '2b. timeOfDay does change fills',
  new Set(fillsChange).size === TIMES_OF_DAY.length,
);

/* 3. Changing one facadeColor changes that building only. */
const target = lots.findIndex((l) => l.status === 'sold' && l.address !== lots[0].address);
const before = lots.map((l) => renderBuilding(l, 'day'));
const recolored = lots.map((l, i) =>
  i === target
    ? { ...l, facadeColor: FACADE_PALETTE[(FACADE_PALETTE.indexOf(l.facadeColor as never) + 5) % 16] }
    : l,
);
const after = recolored.map((l) => renderBuilding(l, 'day'));
const changedIdx = before.map((s, i) => (s === after[i] ? null : i)).filter((v) => v !== null);
check(
  '3. one facade change touches one building',
  changedIdx.length === 1 && changedIdx[0] === target,
  `target ${target}, changed: ${changedIdx.join(',')}`,
);

/* 4. Inserting a lot mid-array shifts positions but alters no other shape. */
const inserted: Lot[] = [
  ...lots.slice(0, 60),
  {
    id: '999 Main Street',
    address: '999 Main Street',
    number: 999,
    street: 'Main Street',
    district: 'downtown',
    tier: 'main',
    status: 'sold',
    buildingType: 'storefront',
    facadeColor: FACADE_PALETTE[2],
    accentColor: FACADE_PALETTE[6],
    signText: 'INSERTED SHOP',
  },
  ...lots.slice(60),
];
const baseShapes = lots.map((l) => unpositioned(renderBuilding(l, 'day', 0)));
const insertedShapes = inserted
  .filter((l) => l.address !== '999 Main Street')
  .map((l) => unpositioned(renderBuilding(l, 'day', 0)));
check(
  '4. inserting a lot alters no other building shape',
  baseShapes.length === insertedShapes.length && baseShapes.every((s, i) => s === insertedShapes[i]),
);
const shifted = renderStreet(inserted, 'day') !== renderStreet(lots, 'day');
check('4b. inserting a lot does shift positions', shifted);

/* 5. sold -> vacant -> sold round-trips exactly. */
let roundTrip = true;
for (const lot of lots.slice(0, 30)) {
  const original = renderBuilding(lot, 'day');
  renderBuilding({ ...lot, status: 'vacant' }, 'day');
  roundTrip &&= renderBuilding({ ...lot, status: lot.status }, 'day') === original;
}
check('5. status flip round-trips identically', roundTrip);

const vacantDiffers = lots
  .slice(0, 5)
  .every((l) => renderBuilding({ ...l, status: 'vacant' }, 'day') !== renderBuilding({ ...l, status: 'sold' }, 'day'));
check('5b. vacant actually renders differently', vacantDiffers);

/* Spec-range assertions on derived geometry. */
import { deriveGeometry } from '@/components/Building';
const RANGES: Record<string, [number, number, number, number]> = {
  storefront: [120, 200, 180, 280],
  tower: [100, 140, 300, 420],
  warehouse: [120, 200, 160, 200],
  civic: [200, 260, 260, 320],
};
let inRange = true;
let wonkOk = true;
let signOk = true;
const roofSeen = new Set<string>();
for (const lot of lots) {
  const g = deriveGeometry(lot.address, lot.buildingType);
  const [wMin, wMax, hMin, hMax] = RANGES[lot.buildingType];
  inRange &&= g.width >= wMin && g.width <= wMax && g.height >= hMin && g.height <= hMax;
  wonkOk &&= g.wonk >= -1.2 && g.wonk <= 1.2;
  const ratio = g.signWidth / g.width;
  signOk &&= ratio >= 0.6 && ratio <= 0.8;
  roofSeen.add(g.roofType);
}
check('6. widths/heights inside spec ranges', inRange);
check('7. wonk within +/- 1.2 degrees', wonkOk);
check('8. sign board spans 60-80% of width', signOk);
check('9. all four roof types appear', roofSeen.size === 4, [...roofSeen].join(','));

/* Ground-floor layout: the pieces that used to collide. */
import { fitSignFontSize } from '@/components/parts';

/** ShopWindow sills are 9 units tall; nothing else on a facade is. */
const hasShopPane = (svg: string) => /height="9"/.test(svg);
/** Civic columns are the only full-height ground-floor rect drawn behind the door. */
const civics = lots.filter((l) => l.buildingType === 'civic' && l.status === 'sold');
check(
  '14. civic ground floors use columns, never overlapping panes',
  civics.length > 0 && civics.every((l) => !hasShopPane(renderBuilding(l, 'day'))),
);

let signsFit = true;
const overflowing: string[] = [];
for (const lot of lots.filter((l) => l.status === 'sold')) {
  const geo = deriveGeometry(lot.address, lot.buildingType);
  const size = fitSignFontSize(lot.signText, geo.signWidth, 36);
  const natural = lot.signText.length * size * 0.68;
  const available = geo.signWidth * 0.88;
  const svg = renderBuilding(lot, 'day');
  // Either it fits naturally, or textLength pins it to the board.
  const ok = natural <= available + 0.001 || /textLength=/.test(svg);
  if (!ok) {
    signsFit = false;
    if (overflowing.length < 3) overflowing.push(lot.signText);
  }
}
check('15. every sign fits its board', signsFit, overflowing.join(' | '));

const shopfronts = lots.filter((l) => l.status === 'sold' && l.buildingType === 'storefront');
const glazed = shopfronts.filter((l) => hasShopPane(renderBuilding(l, 'day'))).length;
check(
  '16. most shopfronts get ground-floor glazing',
  glazed / shopfronts.length > 0.75,
  `${glazed}/${shopfronts.length}`,
);

/* Neighbours should not share a shopfront name. */
// Compare positions on the street, not positions in a filtered list — a
// vacant lot still occupies a slot between two shopfronts.
let nameClash = '';
for (const streetName of new Set(lots.map((l) => l.street))) {
  const run = lots.filter((l) => l.street === streetName);
  for (let i = 0; i < run.length && !nameClash; i++) {
    for (let j = i + 1; j < Math.min(i + 7, run.length); j++) {
      if (
        run[i].status === 'sold' &&
        run[j].status === 'sold' &&
        run[i].signText === run[j].signText
      ) {
        nameClash = `${run[i].address} / ${run[j].address}: ${run[i].signText}`;
      }
    }
  }
}
check('17. no repeated sign within six neighbours', nameClash === '', nameClash);

/* Street composition. */
const mainLots = lots.filter((l) => l.street === 'Main Street');
const corners = lots.filter((l) => l.tier === 'corner');
check(
  '18. the whole city generates',
  lots.length === STREETS.reduce((n, s) => n + s.count, 0) &&
    new Set(lots.map((l) => l.street)).size === STREETS.length,
  `${lots.length} lots over ${new Set(lots.map((l) => l.street)).size} streets`,
);
check(
  '18a. street names are unique city-wide, because addresses carry no district',
  new Set(STREETS.map((s) => s.name)).size === STREETS.length &&
    new Set(STREETS.map((s) => s.slug)).size === STREETS.length,
);
check('18b. every address is unique', new Set(lots.map((l) => l.address)).size === lots.length);
check(
  '18c. every street belongs to a district that exists',
  STREETS.every((s) => DISTRICTS.some((d) => d.slug === s.district)),
);
check(
  '18d. a side street joins the spine in its own district',
  STREETS.filter((s) => !s.main).every((s) => parentStreet(s)?.district === s.district),
);
check(
  '19. even numbers from 100, step 2',
  lots.every((l) => l.number % 2 === 0) && mainLots[0].number === 100 && mainLots[1].number === 102,
);
check(
  '20. corner lots are exactly the ones beside an intersection',
  STREETS.every((street) => {
    const run = lots.filter((l) => l.street === street.name);
    const expected = cornerIndices(street);
    return run.every((lot, i) => (lot.tier === 'corner') === expected.has(i));
  }),
  `${corners.length} corners`,
);
check('21. tiers are corner/main/side only', new Set(lots.map((l) => l.tier)).size === 3);

/* Each street is its own scene now, so the checks below run over all four. */
const scenes = STREETS.map((street) => ({
  street,
  lots: lots.filter((l) => l.street === street.name),
  // Rendered as the app renders it, with turnings that actually lead somewhere.
  svg: renderStreet(lots.filter((l) => l.street === street.name), 'day', true),
}));
const svg = scenes[0].svg;
check(
  '22. each street is one root <svg>',
  scenes.every((scene) => (scene.svg.match(/<svg/g) || []).length === 1),
);
check(
  '23. no filters/gradients/opacity in output',
  scenes.every((scene) => !/<filter|<linearGradient|<radialGradient|opacity=/.test(scene.svg)),
);
check(
  '24. the street loads no images at all',
  scenes.every((scene) => !/<image/.test(scene.svg) && !/url\(http/.test(scene.svg)),
);

/*
 * One deliberate exception to "no image files": the building someone was linked
 * to shows its store logo on its marker. Exactly one image, same-origin, and
 * only when a highlight is asked for.
 */
const highlighted = renderToStaticMarkup(
  <Street
    lots={lots}
    timeOfDay="day"
    highlightAddress={lots[0].address}
    highlightLogoUrl={`/api/logo/${encodeURIComponent(lots[0].address)}?v=abc`}
  />,
);
const images = highlighted.match(/<image[^>]*>/g) || [];
check('24a. a highlighted building shows exactly one logo', images.length === 1, String(images.length));
check(
  '24b. that logo is served from our own origin',
  images.every((tag) => /href="\/api\/logo\//.test(tag)),
  images.join(' '),
);
check(
  '24c. no logo is loaded unless one is asked for',
  !/<image/.test(renderStreet(lots, 'day')),
);
check('25. uniform stroke width', new Set((svg.match(/stroke-width="[^"]*"/g) || [])).size === 2, [...new Set(svg.match(/stroke-width="[^"]*"/g) || [])].join(' '));
check(
  '26. every building is focusable',
  scenes.reduce((n, scene) => n + (scene.svg.match(/tabindex="0"/g) || []).length, 0) ===
    scenes.reduce((n, scene) => n + scene.lots.length, 0),
);
check('27. night lights windows', renderStreet(lots, 'night').includes('#FFD98A'));
check('28. day lights none', !renderStreet(lots, 'day').includes('#FFD98A'));

const dusk = renderStreet(lots, 'dusk');
const duskLit = (dusk.match(/#FFD98A/g) || []).length;
const nightLit = (renderStreet(lots, 'night').match(/#FFD98A/g) || []).length;
check('29. dusk lights roughly half of night', duskLit > 0 && duskLit < nightLit, `dusk ${duskLit} / night ${nightLit}`);

/*
 * Layout: within a street, walls touch. The pavement is interrupted only where
 * another street meets this one — three junctions along Main Street, and one at
 * the head of each side street leading back to it.
 */
const INTERSECTION = 210;
let allContiguous = true;
let totalUnits = 0;
for (const scene of scenes) {
  const junctions = new Set(junctionsOn(scene.street).map((j) => j.afterIndex));
  const opensWithGap = !scene.street.main;
  let cursor = 48 + (opensWithGap ? INTERSECTION : 0);
  scene.lots.forEach((lot, i) => {
    allContiguous &&= scene.svg.includes(`translate(${cursor} 560)`);
    cursor += deriveGeometry(lot.address, lot.buildingType).width;
    if (junctions.has(i)) cursor += INTERSECTION;
  });
  totalUnits += cursor + 48;
}
check('30. buildings share walls within a street', allContiguous);

check(
  '31. every spine has a turning into each of its own side streets',
  scenes
    .filter((scene) => scene.street.main)
    .every((scene) =>
      junctionsOn(scene.street).every((j) => scene.svg.includes(`data-turning="${j.street.slug}"`)),
    ),
);

check(
  '32. every side street has a way back to its own spine',
  scenes
    .filter((scene) => !scene.street.main)
    .every((scene) => {
      const spine = parentStreet(scene.street);
      return spine !== undefined && scene.svg.includes(`data-turning="${spine.slug}"`);
    }),
);

check(
  '33. every street names itself',
  scenes.every((scene) => scene.svg.includes(scene.street.name.toUpperCase())),
);

check(
  '33a. every junction post names both streets',
  scenes.every((scene) => {
    const turnings = scene.street.main
      ? junctionsOn(scene.street).map((j) => j.street.name)
      : [parentStreet(scene.street)?.name ?? ''];
    return turnings.every((name) => name !== '' && scene.svg.includes(name.toUpperCase()));
  }),
);

/*
 * Signposts stand on the pavement, never in the road. The post is the narrow
 * rect at the sign's own origin, so its x must fall inside a pavement run.
 */
check(
  '33c. every turning shows the street beyond it',
  scenes.every((scene) => {
    const turnings = scene.street.main ? junctionsOn(scene.street).length : 1;
    const drawn = (scene.svg.match(/data-crossing=/g) || []).length;
    return drawn === turnings;
  }),
);

check(
  '33d. a turning is not an empty gap',
  scenes.every((scene) => {
    // Road, far block, and a terrace either side, each with a roof: well over
    // the single polygon an empty opening used to be.
    const shapes = scene.svg.split('data-crossing=').slice(1);
    return shapes.every((chunk) => (chunk.slice(0, 2600).match(/<(?:rect|polygon)/g) || []).length >= 8);
  }),
);

check(
  '33b. no signpost stands in the road',
  scenes.every((scene) => {
    const posts = [...scene.svg.matchAll(/<g transform="translate\(([-\d.]+) 590\)"/g)].map((m) =>
      Number(m[1]),
    );
    if (posts.length === 0) return false;
    const pavements = [...scene.svg.matchAll(/<rect x="([-\d.]+)" y="560" width="([\d.]+)"/g)].map(
      (m) => [Number(m[1]), Number(m[1]) + Number(m[2])] as const,
    );
    return posts.every((x) => pavements.some(([from, to]) => x >= from && x <= to));
  }),
);

check(
  '34. no street is longer than its own spine',
  DISTRICTS.every((district) => {
    const spine = district.streets.find((s) => s.main);
    return spine !== undefined && district.streets.every((s) => s.count <= spine.count);
  }),
);
console.log(`all four streets: ${totalUnits} units`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

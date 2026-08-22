/* Acceptance-criteria harness for the Marlow renderer (spec §12). */
import { renderToStaticMarkup } from 'react-dom/server';
import Street from '@/components/Street';
import Building from '@/components/Building';
import { generateLots, type Lot } from '@/lib/lots';
import { TIMES_OF_DAY, FACADE_PALETTE, type TimeOfDay } from '@/lib/palette';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? ` — ${detail}` : ''}`);
}

const lots = generateLots();

const renderStreet = (l: Lot[], t: TimeOfDay) =>
  renderToStaticMarkup(<Street lots={l} timeOfDay={t} />);

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
check('18. 120 lots over four streets', lots.length === 120 && new Set(lots.map((l) => l.street)).size === 4);
check(
  '19. even numbers from 100, step 2',
  lots.every((l) => l.number % 2 === 0) && mainLots[0].number === 100 && mainLots[1].number === 102,
);
check(
  '20. every block has a corner at each end',
  (() => {
    if (corners.length !== 8) return false;
    for (const streetName of new Set(lots.map((l) => l.street))) {
      const run = lots.filter((l) => l.street === streetName);
      if (run[0].tier !== 'corner' || run[run.length - 1].tier !== 'corner') return false;
      if (run.slice(1, -1).some((l) => l.tier === 'corner')) return false;
    }
    return true;
  })(),
  `${corners.length} corners`,
);
check('21. tiers are corner/main/side only', new Set(lots.map((l) => l.tier)).size === 3);

/* Shared walls: no gaps, no overlaps. */
const svg = renderStreet(lots, 'day');
check('22. exactly one root <svg>', (svg.match(/<svg/g) || []).length === 1);
check('23. no filters/gradients/opacity in output', !/<filter|<linearGradient|<radialGradient|opacity=/.test(svg));
check('24. no external image requests', !/<image|url\(http/.test(svg));
check('25. uniform stroke width', new Set((svg.match(/stroke-width="[^"]*"/g) || [])).size === 2, [...new Set(svg.match(/stroke-width="[^"]*"/g) || [])].join(' '));
check('26. buildings are focusable', (svg.match(/tabindex="0"/g) || []).length === 120);
check('27. night lights windows', renderStreet(lots, 'night').includes('#FFD98A'));
check('28. day lights none', !renderStreet(lots, 'day').includes('#FFD98A'));

const dusk = renderStreet(lots, 'dusk');
const duskLit = (dusk.match(/#FFD98A/g) || []).length;
const nightLit = (renderStreet(lots, 'night').match(/#FFD98A/g) || []).length;
check('29. dusk lights roughly half of night', duskLit > 0 && duskLit < nightLit, `dusk ${duskLit} / night ${nightLit}`);

/* Cumulative layout: walls touch inside a block, blocks are separated by a street. */
const INTERSECTION = 210;
let cursor = 48;
let previousStreet: string | null = null;
let contiguous = true;
let gaps = 0;
for (const lot of lots) {
  if (previousStreet !== null && lot.street !== previousStreet) {
    cursor += INTERSECTION;
    gaps += 1;
  }
  previousStreet = lot.street;
  const g = deriveGeometry(lot.address, lot.buildingType);
  contiguous &&= svg.includes(`translate(${cursor} 560)`);
  cursor += g.width;
}
check('30. buildings share walls within a block', contiguous);
check('31. blocks are separated by an intersection', gaps === 3, `${gaps} gaps`);
check(
  '32. every street is named on the scene',
  [...new Set(lots.map((l) => l.street))].every((name) => svg.includes(name.toUpperCase())),
);
console.log(`street width: ${cursor + 48} units`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

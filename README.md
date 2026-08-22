# Marlow

A hand-drawn town, rendered as one inline SVG, where every building belongs to
somebody. 120 lots across four streets: claim an empty one and choose the sign,
the colours and what kind of building goes up.

Built in two layers. The renderer came first and stands alone — geometry derived
from a hash of the address, so the town is identical on every reload and every
device. Accounts and lot storage sit on top without the renderer knowing they
exist. Payments are not built yet.

Live at https://marlow-production.up.railway.app

```bash
npm install
npm run dev          # http://localhost:3000/demo
npm run verify       # 30 renderer checks (the spec's acceptance criteria)
npm run verify:db    # 84 checks over accounts, ownership, purchase, merge
npm run grant        # give a lot away — see below
npm run verify:e2e   # 20 browser checks; needs a server running (see below)
npm run db:migrate   # show what has been applied and what is pending
```

**No database setup is required to run this.** With `DATABASE_URL` unset the
app uses PGlite — Postgres compiled to WASM, running in-process. Set
`DATABASE_URL` and the identical SQL goes to node-postgres instead.
`/api/health` reports which driver is live.

Migrations in `db/migrations` run automatically on the first query, in filename
order, each once and inside a transaction. **Never edit a migration that has
already run** — add a new file. To run them against Railway from your machine:

```bash
railway run --service Postgres node scripts/run-verify-remote.js   # 50 checks
railway run --service Postgres npm run db:migrate                  # status
```

Railway's own `DATABASE_URL` resolves only inside their private network, so
those commands promote `DATABASE_PUBLIC_URL` instead.

## Layout

```
lib/hash.ts             deterministic seeded RNG from an address string
lib/palette.ts          facade colours, four time-of-day palettes, colour mixing
lib/lots.ts             Lot type, street definitions, lot generator
components/parts.tsx    roof, awning, window, door, sign, hoarding primitives
components/Building.tsx the main renderer — returns a <g>, never its own <svg>
components/Street.tsx   renders an array of lots into one SVG scene

lib/db.ts               one query interface, two drivers (pg / PGlite)
lib/auth.ts             scrypt passwords, server-side sessions
lib/session.ts          the cookie half of auth — the only place cookies live
lib/lot-store.ts        reading and writing owner choices; enforces ownership
lib/inventory.ts        merges stored choices over the generated inventory
lib/migrate.ts          numbered SQL migrations, applied once, in a transaction
db/migrations/          the schema's history — never edit a file that has run

app/demo/page.tsx       the street, read from the database
app/lots/[address]      one lot: claim it, edit it, or look at it
app/actions.ts          server actions — the only way the browser mutates
scripts/verify*.ts      the three harnesses
```

## Ownership

`generateLots()` is the deterministic default inventory and never changes.
Stored choices are laid over it by `applyOverrides`, so a lot nobody has
touched renders byte-identical to the generated one — there is a check for
exactly that.

Ownership is enforced in `lib/lot-store.ts`, not in the UI. A server action
that forgets to check still cannot write to someone else's lot.

## Blocks, corners and tiers

The four streets are drawn as four blocks separated by an intersection: the
pavement stops, the kerb returns, the side street recedes between them, and a
sign names each block. Within a block buildings still share walls exactly as the
renderer spec requires — the gap exists only at block boundaries.

This is a deliberate change to that rule, and pricing is the reason. Every lot
carries a `tier`:

| tier | count | where |
| --- | --- | --- |
| `corner` | 8 | first and last lot of every block, flanking an intersection |
| `main` | 46 | the rest of Main Street |
| `side` | 66 | the rest of the cross streets |

Before the intersections existed those tiers were invisible: one unbroken
terrace 18,698 units long, with no way to tell Main Street from Willow Lane and
no corner anywhere. Charging more for a `corner` or a `main` lot would have been
charging for something no visitor could perceive. The renderer now shows the
difference the price is based on.

## Buying before you have an account

A lot is bought at checkout, where there is no user yet — only the email the
buyer gave the payment provider. So ownership has two halves:

| column | set when | means |
| --- | --- | --- |
| `owner_email` | the purchase completes | bought; shows on the street, not editable |
| `owner_id` | someone signs in with that email | linked to an account; editable |

`purchaseLotForEmail(address, email)` is what a payment webhook calls — it takes
no request context and is idempotent, because providers retry. `linkLotsToUser`
hands those lots over on sign-in.

**`linkLotsToUser` must only ever be given a *verified* email.** An unverified
one would let anybody inherit a stranger's purchase by typing their address at
sign-up. That single requirement is why identity is moving to a provider that
verifies email by default.

## Giving lots away

Payment is not built yet — early plots are handed out to seed the town, which
uses the same path a paid purchase will:

```bash
npm run grant -- "126 Main Street" alice@example.com
npm run grant -- --list
railway run --service Postgres npm run grant -- "126 Main Street" alice@example.com
```

A granted lot appears on the street immediately with its generated sign and
colours, and becomes editable when the recipient signs in with that address.
Deliberately a command, not a page: a giveaway anyone can trigger over HTTP is
not a giveaway.

Self-serve claiming is capped at **one free lot per account**, enforced by a
partial unique index rather than a count-then-insert, so two simultaneous
requests cannot both get through. Grants and purchases sit on top of that
allowance; releasing a lot gives it back.

When payment lands it goes through **polar.sh**, calling `purchaseLotForEmail`
with `'purchase'`. Pricing hangs off the `tier` field already on every lot.

## Derived vs. chosen

The split that keeps the town from rearranging itself on reload:

- **Derived from a hash of the address** — width, height, roof type, awning and
  its stripe count, window grid, door offset, wonk angle. Never random, never
  stored. `deriveGeometry(address, buildingType)` is the single source; both
  `Building` and `Street` call it, because Street needs the widths to lay out
  shared walls before anything is drawn.
- **Chosen by the owner, passed as props** — facade colour, accent colour, shop
  name, building type.
- **Passed in by the app** — `status`, `timeOfDay`.

Each derived property draws from its own named stream (`subRandom(address,
'roof')`) rather than one sequential one, so adding a new derived property later
does not shift everything that came after it in the draw order.

## Adding a fifth roof

Add an entry to `ROOFS` in `parts.tsx` with a `height(width)` and a `render`.
It joins the derived rotation automatically; `Building.tsx` needs no change.

## Time of day

`dawn 5–8, day 8–17, dusk 17–20, night 20–5`, from the visitor's local clock,
with a manual override on the demo page. Only fills change — the line art is
identical across all four. Facade shifting goes through `mixHex`, never a CSS
filter. The first render is always `day` so SSR and the client agree; the real
local time is applied in an effect after mount.

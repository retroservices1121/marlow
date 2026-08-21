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
npm run verify:db    # 49 checks over accounts, sessions, ownership, merge
npm run verify:e2e   # 20 browser checks; needs a server running (see below)
```

**No database setup is required to run this.** With `DATABASE_URL` unset the
app uses PGlite — Postgres compiled to WASM, running in-process — and applies
the schema on first query. Set `DATABASE_URL` and the identical SQL goes to
node-postgres instead. `/api/health` reports which driver is live.

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
db/schema.sql           users, sessions, lots

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

Payment is not built yet; when it is, it goes through **polar.sh**.
`claimLot(address, userId)` deliberately takes no request context so a Polar
webhook can call it unchanged once an order completes. Pricing hangs off the
`tier` field already on every lot.

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

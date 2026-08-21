# Marlow — building renderer

The rendering layer only: modules plus a demo page that draws a full street from
a data array. No payments, no database, no accounts, no editor, no storefront.

```bash
npm install
npm run dev      # http://localhost:3000/demo
npm run verify   # the spec's acceptance criteria, as executable checks
```

## Layout

```
lib/hash.ts             deterministic seeded RNG from an address string
lib/palette.ts          facade colours, four time-of-day palettes, colour mixing
lib/lots.ts             Lot type, street definitions, lot generator
components/parts.tsx    roof, awning, window, door, sign, hoarding primitives
components/Building.tsx the main renderer — returns a <g>, never its own <svg>
components/Street.tsx   renders an array of lots into one SVG scene
app/demo/page.tsx       demo page: full street, time-of-day override
scripts/verify.tsx      acceptance-criteria harness
```

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

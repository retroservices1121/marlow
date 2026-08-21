# Claude Code Build Spec: Marlow Building Renderer

**Scope: this task builds the rendering layer only.** No payments, no database, no accounts, no storefront editor, no landing page copy. The deliverable is a set of modules plus a demo page that renders a full street from a data array. Everything else gets built on top of this later.

Stack: TypeScript + React. Inline SVG only. No canvas, no image files, no SVG filters, no external illustration assets.

---

## 1. Files to create

```
/lib/hash.ts              deterministic seeded RNG from an address string
/lib/palette.ts           facade colors + four time-of-day palettes + color mixing
/lib/lots.ts              Lot type, street definitions, lot generator
/components/parts.tsx     roof, awning, window, door, sign, hoarding primitives
/components/Building.tsx  the main renderer
/components/Street.tsx    renders an array of lots into one SVG scene
/app/demo/page.tsx        demo page: full street, time-of-day override control
```

---

## 2. The core rule: derived vs. chosen

This split is the most important thing in the spec. Get it wrong and the town rearranges itself on every page load.

**Derived deterministically from a hash of the address string** (never random, never stored):
- building width
- building height
- roof type
- whether there is an awning, and its stripe count
- window count and window grid layout
- door horizontal offset
- wonk angle (the slight lean)

**Chosen by the owner** (stored, passed in as props):
- facade color (index into the curated palette)
- accent color (index into the curated palette)
- shop name
- building type (storefront, tower, warehouse, civic)

**Passed in by the app:**
- status (`sold` | `vacant`)
- timeOfDay (`dawn` | `day` | `dusk` | `night`)

`hash.ts` exports `seededRandom(address: string)` returning a small deterministic PRNG, plus helpers `pick(array)` and `range(min, max)`. Same address in, same numbers out, forever, on every device.

---

## 3. Building props

```ts
type BuildingProps = {
  address: string          // "108 Main Street" — the seed for all derived geometry
  number: number           // 108
  street: string           // "Main Street"
  status: 'sold' | 'vacant'
  buildingType: 'storefront' | 'tower' | 'warehouse' | 'civic'
  facadeColor: string      // hex from the curated palette
  accentColor: string      // hex from the curated palette
  signText: string         // shop name, uppercase, max 18 chars
  timeOfDay: TimeOfDay
  x: number                // left edge position on the street
}
```

Building returns an SVG `<g>`, never its own `<svg>`. Street owns the single root `<svg>`.

---

## 4. Geometry rules

- All buildings sit on a shared baseline. Heights vary upward from it.
- Buildings share walls: each one starts where the previous ended, no gaps.
- Widths: 120 to 200 units, derived. Towers 100 to 140 and taller. Civic 200 to 260.
- Heights: storefront 180 to 280, tower 300 to 420, warehouse 160 to 200, civic 260 to 320.
- Wonk: rotate each building between -1.2 and +1.2 degrees about its base center. Small enough to feel hand-drawn, not enough to break the shared walls visually.
- Sign board sits above the door, spanning 60 to 80 percent of the building width.
- Sidewalk strip runs the full length below the baseline, with a curb line and a road below it.
- Street furniture (lamppost, hydrant, bench, tree, mailbox) placed every 3rd to 5th building, position derived from the street name so it is also stable.

## 5. Roof types

Four, selected by hash: `flat` (simple parapet cap), `pitched` (triangle), `stepped` (two-tier parapet), `curved` (shallow arc). Each is a separate primitive in `parts.tsx` taking width and returning a path. Adding a fifth later must require no changes to `Building.tsx`.

## 6. Style constants

```
stroke color:       #1A1A1A  (night: #0E1220)
stroke width:       3.5 units, uniform on every shape, no exceptions
stroke linejoin:    round
fills:              flat only — no gradients, no shadows, no filters, no opacity tricks
corner radius:      0 to 2 units, mostly hard corners
```

Typeface for signage: load one chunky geometric sans from Google Fonts (Fredoka, weight 600). Sign text is uppercase, letter-spaced slightly, auto-shrunk to fit the sign board width.

## 7. Facade palette

Sixteen curated colors. Owners pick from these only, never a free color picker.

```
#E8544B  #F2A03D  #F5CE3E  #8FBF54
#4FA382  #4A90C4  #6C6FBF  #A868A8
#D96A9E  #C46B4A  #8C6E4F  #D9CBB3
#7C8B96  #5A6E5A  #E0857B  #3F5C77
```

## 8. Time-of-day palettes

Four palettes. The line art never changes. Only fills change. Implement facade shifting with a `mixHex(base, tint, amount)` utility, not CSS filters.

```ts
dawn:  sky #F6C7A4, road #B9A99A, sidewalk #D8CBBB,
       facadeTint #F0B27A @ 0.15, windowsLit false, stars 0
day:   sky #7EC8E3, road #9BA0A5, sidewalk #D6D6D0,
       facadeTint none,            windowsLit false, stars 0
dusk:  sky #E88A5C, skyBand #7B5EA7, road #6E6472, sidewalk #9A8F98,
       facadeTint #8B5E9E @ 0.25,  windowsLit partial, stars 0
night: sky #1E2A4A, road #2E3550, sidewalk #454C68,
       facadeTint #1E2A4A @ 0.55,  windowsLit true,   stars 40
```

Lit windows fill `#FFD98A`. `partial` means roughly half the windows lit, chosen by hash so it is stable per building. Night adds a lamppost glow as a flat pale-yellow polygon, not a blur.

Time of day is computed from the visitor's local clock: dawn 5–8, day 8–17, dusk 17–20, night 20–5. The demo page needs a manual override control for all four.

## 9. Vacant state

Same `Building` component, `status: 'vacant'`. Renders: the building shell in `#CFC9BE`, diagonal-plank hoarding across the lower two thirds in `#B49A76`, a small "FOR SALE" placard, no sign text, no lit windows, no awning. It should read as a plot waiting to be built, not a ruin.

## 10. Street composition

`Street.tsx` takes `lots: Lot[]` and `timeOfDay`, computes cumulative x positions, and renders one root `<svg>` with a viewBox sized to the total width.

`lots.ts` generates the initial inventory: **Main Street plus three named cross streets, 120 lots total.** Even numbers on the rendered side, incrementing by 2, each street's block starting at 100. Main Street corners (the first and last lot on Main) are flagged `tier: 'corner'`; the rest of Main is `tier: 'main'`; cross streets are `tier: 'side'`. The Lot type carries a `tier` field even though pricing is out of scope here, because the generator has to place it.

## 11. Performance and mobile

- 120 buildings in one inline SVG. No per-building `<svg>`, no filters, no CSS animations on individual shapes.
- Clouds drift with a single slow CSS transform on one group.
- Horizontally scrollable container. Must render correctly and scroll smoothly at 380px viewport width.
- Buildings are keyboard focusable with a visible focus ring.
- Respect `prefers-reduced-motion` by stopping cloud drift.

## 12. Acceptance criteria

Verify each of these before calling it done:

1. Reloading the demo page 10 times produces a pixel-identical street.
2. Changing only `timeOfDay` changes fills and lit windows, and changes no geometry.
3. Changing a building's `facadeColor` changes that building only.
4. Adding a lot to the middle of the array shifts positions but does not alter any other building's shape.
5. A lot flipped from `sold` to `vacant` and back returns to the identical building.
6. The street renders and scrolls at 380px width.
7. No `localStorage`, no `sessionStorage`, no external image requests.

## 13. Do not build

No pricing display, no checkout, no property page, no modal, no email capture, no owner editor, no glyph upload, no admin, no weather, no districts beyond the four streets in the generator.

/**
 * People on the pavement.
 *
 * The town had traffic on the road and nobody on the street, which read as a
 * film set between takes. A shopfront is worth more with somebody walking past
 * it, and that is the whole argument for buying one.
 *
 * Two kinds, because a street has two kinds. Some walk, drawn in profile facing
 * the way they are going — everybody was front-on at first and slid sideways,
 * which read as moonwalking. The rest stand and look in a window, back to the
 * street, which is the most flattering thing anybody can do to a shop you are
 * trying to sell.
 *
 * Drawn to the town's rules — uniform stroke, flat fills, no gradients — and
 * kept deliberately plain. These are extras, not characters: anything more
 * detailed would pull the eye off the signs people are paying for.
 *
 * Everyone is placed, dressed and pointed by the same seeded generator the
 * buildings use, so the same people are on the same street on every machine and
 * after every deploy. Randomness that reshuffled itself each visit would make
 * the town feel like a screensaver rather than a place.
 *
 * They move with CSS and nothing else — no client JavaScript, and nothing at
 * all for anybody who has asked for less motion, who gets a street of people
 * standing still rather than an empty one.
 */

import { subRandom } from '@/lib/hash';
import { CORNER_RADIUS, STROKE_WIDTH, applyTimeTint, shade, type TimePalette } from '@/lib/palette';

const INK = { strokeWidth: STROKE_WIDTH, strokeLinejoin: 'round' as const };

/** Clothes, from the town's own palette. */
const CLOTHES = [
  '#E8544B',
  '#F2A03D',
  '#4FA382',
  '#4A90C4',
  '#6C6FBF',
  '#A868A8',
  '#D96A9E',
  '#3F5C77',
  '#8C6E4F',
  '#5A6E5A',
] as const;

const SKIN = ['#F0C9A6', '#D9A377', '#B07A4F', '#8A5A3B', '#5E3A22'] as const;

/** One person per this much street. Sparse enough that each one reads. */
const SPACING = 260;

/**
 * How fast somebody walks, in units of street per second.
 *
 * They cross the whole street rather than pacing back and forth. Pacing was the
 * obvious idea and it walks you backwards half the time, which is the same
 * moonwalk in the other direction — the only honest fix is to keep going the
 * way you are facing, and the street is long enough that a crossing takes a
 * couple of minutes.
 */
const WALK_SPEED = 34;

/** How far past each end they carry on, so nobody appears or vanishes in view. */
const OFF_STAGE = 90;

/** How many of them are stopped at a window rather than walking. */
const STANDING_SHARE = 0.4;

type Look = { coat: string; skin: string; stroke: string };

/**
 * Somebody walking, in profile, facing right.
 *
 * Leftward walkers are this drawing flipped. Legs apart mid-stride, and the
 * near arm a shade darker than the coat — which is the whole of the
 * three-dimensionality anybody needs at this size.
 *
 * Sized against a shop door, the only measure that matters. An early version
 * made them 48 units against a 70-unit door and they read as children, when
 * they stand thirty units in front of the buildings and should if anything look
 * slightly large.
 */
function Walking({ coat, skin, stroke }: Look) {
  return (
    <>
      {/*
       * Legs mid-stride, swung from the hip. The stride is what says which way
       * this person is going — a nose was tried first and at three units
       * across, under a two-and-a-half unit stroke, it read as a black ring
       * stuck to the side of the head rather than as a face.
       */}
      <rect x={-11} y={-17} width={6} height={18} rx={1} fill={stroke} transform="rotate(-8 -8 -17)" />
      <rect x={4} y={-17} width={6} height={18} rx={1} fill={stroke} transform="rotate(10 7 -17)" />
      <rect x={-8} y={-42} width={17} height={27} rx={CORNER_RADIUS} fill={coat} stroke={stroke} {...INK} />
      {/* The near arm, swinging forward — the other half of the direction. */}
      <rect
        x={5}
        y={-38}
        width={7}
        height={18}
        rx={CORNER_RADIUS}
        fill={shade(coat, 0.2)}
        stroke={stroke}
        transform="rotate(8 8 -38)"
        {...INK}
      />
      <circle cx={2} cy={-52} r={10.5} fill={skin} stroke={stroke} {...INK} />
    </>
  );
}

/** Somebody stopped at a window, back to the street. */
function Looking({ coat, skin, stroke }: Look) {
  return (
    <>
      <rect x={-9} y={-17} width={6} height={17} fill={stroke} />
      <rect x={3} y={-17} width={6} height={17} fill={stroke} />
      <rect x={-12} y={-42} width={24} height={27} rx={CORNER_RADIUS} fill={coat} stroke={stroke} {...INK} />
      {/* Arms down at the sides, which is what standing looks like. */}
      <rect x={-17} y={-40} width={6} height={19} rx={CORNER_RADIUS} fill={shade(coat, 0.2)} stroke={stroke} {...INK} />
      <rect x={11} y={-40} width={6} height={19} rx={CORNER_RADIUS} fill={shade(coat, 0.2)} stroke={stroke} {...INK} />
      <circle cx={0} cy={-52} r={10.5} fill={skin} stroke={stroke} {...INK} />
    </>
  );
}

function Person({
  x,
  baseline,
  look,
  walking,
  facingLeft,
  totalWidth,
  delay,
}: {
  x: number;
  baseline: number;
  look: Look;
  walking: boolean;
  facingLeft: boolean;
  totalWidth: number;
  delay: number;
}) {
  /*
   * Three groups, and each transform needs its own element: the pavement, then
   * the walk, then the facing.
   *
   * An earlier version put the position and the walk on one group. In SVG a
   * transform attribute and a CSS animated transform are the same property, so
   * the animation replaced the position — every person dropped to the top of
   * the frame and vanished above it. The still render could not show it,
   * because a PNG has no stylesheet.
   */
  const crossing = totalWidth + OFF_STAGE * 2;

  return (
    // Walkers start from the edge and are staggered by delay instead, so `x`
    // only places the ones who are standing still.
    <g transform={`translate(${walking ? 0 : x} ${baseline})`}>
      <g
        className={walking ? 'mw-walker' : undefined}
        style={
          walking
            ? ({
                '--mw-drive-from': -OFF_STAGE,
                '--mw-drive-to': totalWidth + OFF_STAGE,
                '--mw-drive-secs': `${Math.round(crossing / WALK_SPEED)}s`,
                animationDelay: `${delay}s`,
                // Reversed, so a leftward walker travels the way they face.
                animationDirection: facingLeft ? 'reverse' : 'normal',
              } as React.CSSProperties)
            : undefined
        }
      >
        <g transform={facingLeft ? 'scale(-1 1)' : undefined}>
          {walking ? <Walking {...look} /> : <Looking {...look} />}
        </g>
      </g>
    </g>
  );
}

export default function Pedestrians({
  totalWidth,
  baseline,
  palette,
}: {
  totalWidth: number;
  /** The pavement they stand on. */
  baseline: number;
  palette: TimePalette;
}) {
  const count = Math.max(3, Math.round(totalWidth / SPACING));

  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const rng = subRandom('marlow-people', `walker:${i}`);
        return (
          <Person
            key={i}
            // Spread evenly, then nudged, so they are not a picket fence.
            x={(totalWidth / count) * i + rng.range(20, 180)}
            baseline={baseline}
            look={{
              coat: applyTimeTint(CLOTHES[Math.floor(rng.range(0, CLOTHES.length))], palette),
              skin: applyTimeTint(SKIN[Math.floor(rng.range(0, SKIN.length))], palette),
              stroke: palette.stroke,
            }}
            walking={!rng.chance(STANDING_SHARE)}
            facingLeft={rng.chance(0.5)}
            totalWidth={totalWidth}
            /*
             * Spread across the whole crossing, so at any moment there are
             * people all along the street rather than a crowd setting off
             * together from one end.
             */
            delay={-Math.round(rng.range(0, (totalWidth + OFF_STAGE * 2) / WALK_SPEED))}
          />
        );
      })}
    </g>
  );
}

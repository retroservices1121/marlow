/**
 * People on the pavement.
 *
 * The town had traffic on the road and nobody on the street, which read as a
 * film set between takes. A shopfront is worth more with somebody walking past
 * it, and that is the whole argument for buying one.
 *
 * Drawn to the town's rules — uniform stroke, flat fills, no gradients — and
 * kept deliberately small and plain. These are extras, not characters: anything
 * more detailed would pull the eye off the signs people are paying for.
 *
 * Every one is placed and coloured by the same seeded generator the buildings
 * use, so the same people are on the same street on every machine and after
 * every deploy. Randomness that reshuffled itself each visit would make the
 * town feel like a screensaver rather than a place.
 *
 * They walk with CSS and nothing else — no client JavaScript, and nothing at
 * all for anybody who has asked for less motion, who gets a street of people
 * standing still rather than an empty one.
 */

import { subRandom } from '@/lib/hash';
import { CORNER_RADIUS, STROKE_WIDTH, applyTimeTint, type TimePalette } from '@/lib/palette';

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

/** How far a walk carries somebody before it loops. Short, so nobody teleports far. */
const STROLL = 190;

function Person({
  x,
  baseline,
  coat,
  skin,
  stroke,
  seconds,
  delay,
  reverse,
}: {
  x: number;
  baseline: number;
  coat: string;
  skin: string;
  stroke: string;
  seconds: number;
  delay: number;
  reverse: boolean;
}) {
  /*
   * Two groups, and it matters: the outer one stands the person on the
   * pavement, the inner one walks.
   *
   * They were one group at first, carrying a transform attribute for position
   * and a CSS animation for the walk. In SVG those are the same property, and
   * the animation wins — so the moment it started every person lost their
   * place, dropped to the top of the frame, and vanished above it. The still
   * render could not show it, because a PNG has no stylesheet.
   */
  return (
    <g transform={`translate(${x} ${baseline})`}>
      <g
        className="mw-walker"
        style={
          {
            '--mw-walk': `${STROLL}px`,
            animationDuration: `${seconds}s`,
            animationDelay: `${delay}s`,
            animationDirection: reverse ? 'alternate-reverse' : 'alternate',
          } as React.CSSProperties
        }
      >
        {/*
         * Sized against a shop door, which is the only measure that matters.
         * The first attempt made them 48 units tall against a 70-unit door and
         * they read as children — and they stand thirty units in front of the
         * buildings, so if anything they should look slightly large.
         */}
        {/* Legs. Two, apart, so the shape reads as walking, not standing. */}
        <rect x={-9} y={-17} width={6} height={17} fill={stroke} />
        <rect x={3} y={-17} width={6} height={17} fill={stroke} />
        <rect x={-12} y={-42} width={24} height={27} rx={CORNER_RADIUS} fill={coat} stroke={stroke} {...INK} />
        <circle cx={0} cy={-52} r={10.5} fill={skin} stroke={stroke} {...INK} />
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
            coat={applyTimeTint(CLOTHES[Math.floor(rng.range(0, CLOTHES.length))], palette)}
            skin={applyTimeTint(SKIN[Math.floor(rng.range(0, SKIN.length))], palette)}
            stroke={palette.stroke}
            // A range of paces, so nobody marches in step with anybody else.
            seconds={Math.round(rng.range(11, 26))}
            delay={-Math.round(rng.range(0, 20))}
            reverse={rng.chance(0.5)}
          />
        );
      })}
    </g>
  );
}

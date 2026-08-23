/**
 * Follow the town on X.
 *
 * The mark stands where the letter would, so it reads "Follow on X" with X
 * drawn rather than typed. Screen readers still get the word — the logo is
 * hidden from them and the letter follows it, unseen.
 *
 * Drawn inline rather than fetched: it is one path, and a logo that arrives
 * after the page does is a button that jumps under somebody's thumb.
 *
 * No client JavaScript — it is a link.
 */

const MARLOW_ON_X = 'https://x.com/marlowdottown';

export default function FollowOnX({ className = 'mw-chip mw-chip-x' }: { className?: string }) {
  return (
    <a
      className={className}
      href={MARLOW_ON_X}
      target="_blank"
      rel="noopener noreferrer"
    >
      Follow on
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        />
      </svg>
      {/* The mark stands in for the letter, so the name is still said aloud. */}
      <span className="mw-visually-hidden">X</span>
    </a>
  );
}

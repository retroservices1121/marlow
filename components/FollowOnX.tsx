/**
 * Follow the town on X.
 *
 * The mark is drawn inline rather than fetched: it is one path, and a logo that
 * arrives after the page does is a button that jumps under somebody's thumb.
 *
 * No client JavaScript — it is a link.
 */

const MARLOW_ON_X = 'https://x.com/marlowdottown';

export default function FollowOnX() {
  return (
    <a
      className="mw-chip mw-chip-x"
      href={MARLOW_ON_X}
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        />
      </svg>
      Follow on X
    </a>
  );
}

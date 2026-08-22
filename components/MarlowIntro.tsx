'use client';

/**
 * The pitch, as a dialog over whatever it is placed on.
 *
 * Shown over the city map and over a street, because either can be the first
 * thing somebody sees and the argument for the place should not depend on
 * which door they came through.
 *
 * A separate page explaining Marlow would be weaker than Marlow explaining
 * itself: the thing being sold is behind this, filling up, while somebody reads
 * what it is. Dismissing gets out of the way rather than navigating anywhere,
 * so the city is never more than one tap from the argument for it.
 *
 * Real DOM over the canvas rather than anything drawn in WebGL, so it is
 * readable by a crawler and a screen reader — which for a product sold on
 * placement and links is the half that pays.
 *
 * Shown once per session, not once per page. It used to reappear on every
 * navigation, which turned the argument for the town into an obstacle to seeing
 * it — somebody walking three streets was asked three times whether they would
 * like to know what this is.
 *
 * `sessionStorage`, deliberately, not `localStorage`: it lasts as long as the
 * tab and no longer. Marlow keeps nothing about anybody between visits, and a
 * returning visitor tomorrow is worth the pitch again. Every access is wrapped,
 * because a browser set to block site data throws on the property itself rather
 * than returning null.
 *
 * Until the answer is known there is nothing to show, so the first render puts
 * out the pitch as plain hidden text. That keeps it in the server HTML for a
 * crawler and for anybody with JavaScript off, which for a product sold on
 * placement and links is the half that pays.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Lasts as long as the tab. */
const SEEN_KEY = 'mw-intro-seen';

function alreadySeen(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSeen(): void {
  try {
    window.sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* Blocked storage only costs a repeated dismissal. */
  }
}

export default function MarlowIntro({
  total,
  taken,
  districts,
  hint = 'Drag to move · pinch or +/− to zoom · tap a building to see it',
}: {
  total: number;
  taken: number;
  districts: number;
  /** How to get about whatever this is sitting on. */
  hint?: string;
}) {
  // null until sessionStorage has been read; there is no correct thing to draw
  // before that, and guessing produces a dialog that flashes and vanishes.
  const [open, setOpen] = useState<boolean | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const settled = useRef(false);

  const forSale = total - taken;
  const share = Math.max(1, Math.round((taken / total) * 100));

  useEffect(() => setOpen(!alreadySeen()), []);

  const dismiss = useCallback(() => {
    setOpen(false);
    rememberSeen();
  }, []);

  // Escape closes it, and focus moves somewhere sensible either way.
  useEffect(() => {
    if (open === null) return;

    // Arriving with it already dismissed is not an interaction, so nothing
    // should take focus — that would scroll the page and lose somebody's place.
    if (!settled.current) {
      settled.current = true;
      if (!open) return;
    }

    if (!open) {
      reopen.current?.focus();
      return;
    }
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismiss]);

  if (open === null) {
    // Server render and first paint: the pitch as text, for crawlers and for
    // anybody without JavaScript, who would otherwise get an empty corner.
    return (
      <div className="mw-visually-hidden">
        <h2>Own a shopfront in Marlow</h2>
        <p>
          A town of {total} addresses across {districts} districts. Take one, put your name over the
          door, and it is yours. {taken} taken, {forSale} still for sale.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button ref={reopen} type="button" className="mw-intro-reopen" onClick={() => setOpen(true)}>
        What is Marlow?
      </button>
    );
  }

  return (
    <div
      className="mw-intro-backdrop"
      // Clicking the city behind it is a clear enough signal to get on with it.
      onClick={dismiss}
    >
      <div
        className="mw-intro"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mw-intro-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={close} type="button" className="mw-card-close" onClick={dismiss} aria-label="Close">
          ×
        </button>

        <h2 className="mw-intro-title" id="mw-intro-title">
          Own a shopfront in Marlow
        </h2>
        <p className="mw-intro-lead">
          A town of {total} addresses across {districts} districts. Take one, put your name over the
          door, and it is yours.
        </p>

        <ul className="mw-intro-points">
          <li>
            <strong>An address of your own</strong>
            <span>108 Willow Lane, and nobody else&apos;s.</span>
          </li>
          <li>
            <strong>A building, not a square</strong>
            <span>Its shape comes from the address, so it is always recognisably yours.</span>
          </li>
          <li>
            <strong>A page that sends people on</strong>
            <span>Your logo, your words, your website and your socials.</span>
          </li>
        </ul>

        <div className="mw-intro-scarcity">
          <div className="mw-fill" role="img" aria-label={`${share} per cent of Marlow is taken`}>
            <span style={{ width: `${share}%` }} />
          </div>
          <p>
            <strong>{taken} taken</strong> · {forSale} still for sale
          </p>
        </div>

        <div className="mw-intro-actions">
          <Link className="mw-chip mw-chip-primary mw-chip-small" href="/register">
            Take a lot
          </Link>
          <button type="button" className="mw-chip mw-chip-small" onClick={dismiss}>
            Look around first
          </button>
        </div>

        <p className="mw-intro-hint">{hint}</p>
      </div>
    </div>
  );
}

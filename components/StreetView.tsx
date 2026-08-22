'use client';

/**
 * Walking around Marlow.
 *
 * The town is nearly 20,000 units wide — about 33 phone screens end to end, with
 * Kiln Street 26 screens in — so getting about is a real problem rather than a
 * detail. Three ways to move, in the order people reach for them:
 *
 *   walk    drag the street, or hold an arrow key, to move along it
 *   jump    skip to a block by name
 *   link    arrive at one address directly via `?lot=`
 *
 * Clicking a storefront opens its page, which is where the owner and their
 * shop are described. Dragging must therefore not count as a click, or pulling
 * yourself along the street would keep navigating away.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Street from './Street';
import type { OwnedLot } from '@/lib/inventory';
import type { Lot, StreetDef } from '@/lib/lots';
import { TIMES_OF_DAY, currentTimeOfDay, type TimeOfDay } from '@/lib/palette';

type Mode = 'auto' | TimeOfDay;

/** First render is always `day` so the server and the client agree. */
const SSR_TIME: TimeOfDay = 'day';

/** Pixels per second while an arrow key is held. */
const WALK_SPEED = 900;

export default function StreetView({
  lots,
  focusAddress = null,
  logoUrls,
  overlay,
}: {
  lots: OwnedLot[];
  focusAddress?: string | null;
  /** Logo per address, for every owned shop on this street. */
  logoUrls?: Record<string, string>;
  /** Rendered over the street — the pitch, when somebody arrives here first. */
  overlay?: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>('auto');
  const [clockTime, setClockTime] = useState<TimeOfDay>(SSR_TIME);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setClockTime(currentTimeOfDay());
    const timer = window.setInterval(() => setClockTime(currentTimeOfDay()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const timeOfDay: TimeOfDay = mode === 'auto' ? clockTime : mode;

  /**
   * Centres an element in the scroller, measured from the DOM rather than
   * recomputed from the layout — so it stays right at any scale without the
   * client knowing the unit-to-pixel ratio.
   */
  const centre = useCallback((attribute: string, value: string, smooth: boolean) => {
    const box = scroller.current;
    if (!box) return;
    const target = Array.from(box.querySelectorAll<SVGGElement>(`[${attribute}]`)).find(
      (el) => el.getAttribute(attribute) === value,
    );
    if (!target) return;

    const targetBox = target.getBoundingClientRect();
    const viewBox = box.getBoundingClientRect();
    const delta = targetBox.left - viewBox.left - (viewBox.width - targetBox.width) / 2;
    box.scrollTo({ left: box.scrollLeft + delta, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Arriving on a link: jump straight there rather than animating from the end.
  useEffect(() => {
    if (!focusAddress) return;
    const id = window.requestAnimationFrame(() => centre('data-address', focusAddress, false));
    return () => window.cancelAnimationFrame(id);
  }, [focusAddress, centre]);

  /* ---- Walking ---------------------------------------------------------- */

  // Held arrow keys move the street continuously. Driven by rAF rather than
  // key-repeat, so the pace is even and does not depend on OS repeat settings.
  useEffect(() => {
    const held = new Set<string>();
    let frame = 0;
    let last = 0;

    const step = (now: number) => {
      const box = scroller.current;
      const elapsed = last ? (now - last) / 1000 : 0;
      last = now;
      if (box) {
        const direction = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
        if (direction !== 0) box.scrollLeft += direction * WALK_SPEED * elapsed;
      }
      frame = held.size > 0 ? window.requestAnimationFrame(step) : 0;
    };

    const start = () => {
      if (!frame) {
        last = 0;
        frame = window.requestAnimationFrame(step);
      }
    };

    const key = (e: KeyboardEvent): 'left' | 'right' | null =>
      e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right' : null;

    const onDown = (e: KeyboardEvent) => {
      const direction = key(e);
      if (!direction) return;
      // Leave arrow keys alone while someone is typing.
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      held.add(direction);
      start();
    };
    const onUp = (e: KeyboardEvent) => {
      const direction = key(e);
      if (direction) held.delete(direction);
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    // A lost blur would otherwise leave the street walking forever.
    window.addEventListener('blur', () => held.clear());
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Drag the street to pull yourself along it.
  const drag = useRef<{ x: number; scroll: number } | null>(null);
  const dragged = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Let the browser handle touch panning natively; this is for mouse drag.
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const box = scroller.current;
    if (!box) return;
    drag.current = { x: e.clientX, scroll: box.scrollLeft };
    dragged.current = false;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const box = scroller.current;
    if (!state || !box) return;
    const travelled = e.clientX - state.x;
    if (Math.abs(travelled) > 3) dragged.current = true;
    box.scrollLeft = state.scroll - travelled;
  };

  const endDrag = () => {
    drag.current = null;
  };

  /**
   * A drag that moved is walking, not clicking. Without this, pulling yourself
   * along the street would open whichever storefront you happened to grab.
   */
  const onStreetClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragged.current) {
      e.preventDefault();
      dragged.current = false;
    }
  };

  return (
    <>
      <div className="mw-controls" role="group" aria-label="Time of day">
        <p className="mw-legend">Time of day</p>
        <button
          type="button"
          className="mw-chip"
          aria-pressed={mode === 'auto'}
          onClick={() => setMode('auto')}
        >
          Auto ({clockTime})
        </button>
        {TIMES_OF_DAY.map((time) => (
          <button
            key={time}
            type="button"
            className="mw-chip"
            aria-pressed={mode === time}
            onClick={() => setMode(time)}
          >
            {time}
          </button>
        ))}
      </div>

      <div className="mw-stage">
        <div
          className="mw-scroll mw-walkable"
          ref={scroller}
          tabIndex={0}
          role="region"
          aria-label="Marlow street. Drag or use the arrow keys to walk, and click a building to look at it."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onClick={onStreetClick}
        >
          <Street
            lots={lots}
            timeOfDay={timeOfDay}
            hrefForLot={(lot: Lot) => `/lots/${encodeURIComponent(lot.address)}`}
            highlightAddress={focusAddress}
            logoUrls={logoUrls}
            hrefForStreet={(street: StreetDef) => `/street/${street.slug}`}
          />
        </div>
        {overlay}
      </div>

      <p className="mw-walk-hint">
        Drag the street or hold ← → to walk. Click a storefront to see who trades there.
      </p>
    </>
  );
}

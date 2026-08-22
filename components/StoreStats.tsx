'use client';

/**
 * Counts a visit, and the clicks that leave.
 *
 * Renders nothing. It exists to fire `navigator.sendBeacon`, which the browser
 * delivers even as the page is being torn down by the click that triggered it —
 * an ordinary fetch on an outbound link is a race the link usually wins.
 *
 * Outbound links keep their real href. Routing them through a redirect would
 * count more reliably, but a shop's link would stop pointing at the shop: it
 * would not be copyable, would not show the destination in the status bar, and
 * would break the promise made on the profile form that we build the link so it
 * always goes where it says. A few uncounted clicks is the cheaper price.
 *
 * One view per shop per tab, so a refresh or a walk back down the street does
 * not inflate somebody's numbers into a lie.
 */

import { useEffect } from 'react';

function beacon(payload: { address: string; kind: string; target?: string }) {
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/stat', new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch('/api/stat', { method: 'POST', body, keepalive: true });
  } catch {
    /* Counting is never worth breaking a page over. */
  }
}

export default function StoreStats({ address }: { address: string }) {
  useEffect(() => {
    const seenKey = `mw-viewed:${address}`;
    let counted = false;
    try {
      counted = window.sessionStorage.getItem(seenKey) === '1';
    } catch {
      /* Blocked storage only costs a double count. */
    }

    if (!counted) {
      beacon({ address, kind: 'view' });
      try {
        window.sessionStorage.setItem(seenKey, '1');
      } catch {
        /* ignore */
      }
    }

    /*
     * One listener on the document rather than one per link: the profile is
     * server-rendered and its links are not ours to wrap, and this keeps
     * working if an owner adds a platform later.
     */
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.('a[data-stat]') as HTMLAnchorElement | null;
      if (!link) return;
      const kind = link.dataset.stat;
      if (kind !== 'link' && kind !== 'social') return;
      beacon({ address, kind, target: link.dataset.statTarget });
    };

    // Capture, so a click is counted even if something later stops it.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [address]);

  return null;
}

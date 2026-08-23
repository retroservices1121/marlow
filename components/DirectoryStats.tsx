'use client';

/**
 * Counts click-throughs from the directory, against the right shop.
 *
 * `StoreStats` counts one shop, because a storefront page is one shop. The
 * directory is many, so the address rides on each link and is read back from
 * the one that was clicked. Without this an owner listed on the front page
 * would see none of the traffic it sent them, which would make the numbers on
 * their own page quietly wrong rather than merely incomplete.
 *
 * No page views are counted here. Somebody scrolling past forty shopfronts has
 * not visited forty shops, and counting it that way would turn every owner's
 * figures into noise.
 */

import { useEffect } from 'react';

export default function DirectoryStats() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const node = event.target as HTMLElement | null;
      const link = node?.closest?.('a[data-stat][data-stat-address]') as HTMLAnchorElement | null;
      if (!link) return;

      const address = link.dataset.statAddress;
      const kind = link.dataset.stat;
      if (!address || (kind !== 'link' && kind !== 'social')) return;

      try {
        const body = JSON.stringify({ address, kind, target: link.dataset.statTarget });
        // sendBeacon survives the page being torn down by the click itself,
        // which an ordinary fetch on an outbound link usually does not.
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/stat', new Blob([body], { type: 'application/json' }));
        } else {
          void fetch('/api/stat', { method: 'POST', body, keepalive: true });
        }
      } catch {
        /* Counting is never worth breaking a link over. */
      }
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}

'use client';

/**
 * What you get, shown the moment you touch a lot on the map.
 *
 * The map answers what is left and where; at city scale a shop is a coloured
 * matchstick, which is no way to sell one. This is the other half: the actual
 * building, drawn by the same renderer the street uses, the instant somebody
 * points at it.
 *
 * Deliberately the flat SVG renderer rather than anything in three.js — it is a
 * few hundred bytes, needs no GPU work, and is exactly the shopfront a visitor
 * would see if they walked there.
 */

import Link from 'next/link';
import BuildingPortrait from '@/components/BuildingPortrait';
import type { OwnedLot } from '@/lib/inventory';
import { DISTRICTS, streetByName } from '@/lib/lots';
import { priceLabel } from '@/lib/pricing';

const TIER_LABEL: Record<string, string> = {
  corner: 'Corner plot',
  main: 'Main street',
  side: 'Side street',
};

export default function LotPreview({
  lot,
  onClose,
}: {
  lot: OwnedLot;
  onClose: () => void;
}) {
  const district = DISTRICTS.find((d) => d.slug === lot.district);
  const street = streetByName(lot.street);
  const state = lot.awaitingOwner ? 'Sold' : lot.claimed ? 'Taken' : 'For sale';

  return (
    <aside className="mw-preview-panel" aria-label={`${lot.address}, ${state}`}>
      <button type="button" className="mw-card-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <BuildingPortrait
        address={lot.address}
        number={lot.number}
        street={lot.street}
        status={lot.status}
        buildingType={lot.buildingType}
        facadeColor={lot.facadeColor}
        accentColor={lot.accentColor}
        signText={lot.signText}
        className="mw-preview-portrait"
      />

      <div className="mw-preview-facts">
        <strong>{lot.claimed ? lot.signText : 'Nothing built yet'}</strong>
        <small>
          {lot.address} · {district?.name ?? lot.district}
        </small>
        <p className="mw-card-state" data-state={state.toLowerCase().replace(' ', '-')}>
          {state} · {TIER_LABEL[lot.tier] ?? lot.tier}
        </p>

        {/* The price belongs here, while somebody is choosing between lots. */}
        {!lot.claimed && (
          <p className="mw-price">
            {priceLabel(lot)} <small>once, yours to keep</small>
          </p>
        )}
      </div>

      <div className="mw-card-actions">
        <Link className="mw-chip mw-chip-primary mw-chip-small" href={`/lots/${encodeURIComponent(lot.address)}`}>
          {lot.claimed ? 'See the shop' : `Take it · ${priceLabel(lot)}`}
        </Link>
        {street && (
          <Link
            className="mw-chip mw-chip-small"
            href={`/street/${street.slug}?lot=${encodeURIComponent(lot.address)}`}
          >
            Walk to it
          </Link>
        )}
      </div>
    </aside>
  );
}

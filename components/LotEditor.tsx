'use client';

/**
 * The owner's editor for one lot.
 *
 * The preview beside the controls is the same `Building` component the street
 * draws, fed the pending values — so what an owner sees while choosing is
 * literally what the street will render, not an approximation of it.
 */

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Building, { DEFAULT_BASELINE, buildingTotalHeight, deriveGeometry } from './Building';
import type { ActionState } from '@/app/actions';
import type { BuildingType, Lot } from '@/lib/lots';
import {
  FACADE_PALETTE,
  STROKE_WIDTH,
  TIMES_OF_DAY,
  TIME_PALETTES,
  type TimeOfDay,
} from '@/lib/palette';
import { MAX_SIGN_CHARS } from '@/lib/inventory';

const BUILDING_TYPES: { value: BuildingType; label: string; note: string }[] = [
  { value: 'storefront', label: 'Storefront', note: 'Shop below, rooms above. Can have an awning.' },
  { value: 'tower', label: 'Tower', note: 'Narrow and tall, with a lobby door.' },
  { value: 'warehouse', label: 'Warehouse', note: 'Low and wide, with a loading door.' },
  { value: 'civic', label: 'Civic', note: 'Broad, with columns across the front.' },
];

function Swatches({
  name,
  legend,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <fieldset className="mw-fieldset">
      <legend>{legend}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="mw-swatches">
        {FACADE_PALETTE.map((hex) => (
          <button
            key={hex}
            type="button"
            className="mw-swatch"
            style={{ background: hex }}
            aria-label={hex}
            aria-pressed={value === hex}
            onClick={() => onChange(hex)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="mw-chip mw-chip-primary" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

export default function LotEditor({
  lot,
  action,
}: {
  lot: Lot;
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const [facadeColor, setFacade] = useState(lot.facadeColor);
  const [accentColor, setAccent] = useState(lot.accentColor);
  const [signText, setSignText] = useState(lot.signText);
  const [buildingType, setBuildingType] = useState<BuildingType>(lot.buildingType);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');

  // The preview is one building in its own viewBox, sized from its own geometry.
  const geo = deriveGeometry(lot.address, buildingType);
  const pad = 40;
  const totalHeight = buildingTotalHeight(geo);
  const top = DEFAULT_BASELINE - totalHeight - pad;
  const left = -pad;
  const frameWidth = geo.width + pad * 2;
  const frameHeight = totalHeight + pad * 2;
  const viewBox = `${left} ${top} ${frameWidth} ${frameHeight}`;
  // Sky and pavement come from the same palette the street uses, so the
  // lighting buttons change the whole scene rather than just the building.
  const palette = TIME_PALETTES[timeOfDay];

  return (
    <div className="mw-editor">
      <div className="mw-preview">
        <svg
          viewBox={viewBox}
          className="mw-preview-svg"
          role="img"
          aria-label={`Preview of ${signText || lot.address}`}
        >
          <rect x={left} y={top} width={frameWidth} height={frameHeight} fill={palette.sky} />
          <rect
            x={left}
            y={DEFAULT_BASELINE}
            width={frameWidth}
            height={pad}
            fill={palette.sidewalk}
          />
          <line
            x1={left}
            y1={DEFAULT_BASELINE}
            x2={left + frameWidth}
            y2={DEFAULT_BASELINE}
            stroke={palette.stroke}
            strokeWidth={STROKE_WIDTH}
          />
          <Building
            address={lot.address}
            number={lot.number}
            street={lot.street}
            status="sold"
            buildingType={buildingType}
            facadeColor={facadeColor}
            accentColor={accentColor}
            signText={signText || lot.signText}
            timeOfDay={timeOfDay}
            x={0}
          />
        </svg>
        <div className="mw-controls mw-controls-tight" role="group" aria-label="Preview lighting">
          {TIMES_OF_DAY.map((time) => (
            <button
              key={time}
              type="button"
              className="mw-chip mw-chip-small"
              aria-pressed={timeOfDay === time}
              onClick={() => setTimeOfDay(time)}
            >
              {time}
            </button>
          ))}
        </div>
      </div>

      <form action={formAction} className="mw-form">
        <input type="hidden" name="address" value={lot.address} />

        <label className="mw-field">
          <span>Sign</span>
          <input
            name="signText"
            value={signText}
            maxLength={MAX_SIGN_CHARS}
            onChange={(e) => setSignText(e.target.value.toUpperCase())}
            spellCheck={false}
          />
          <small className="mw-hint">
            {signText.length}/{MAX_SIGN_CHARS} — letters, numbers, &amp; . &apos; - only. It shrinks
            to fit the board.
          </small>
        </label>

        <fieldset className="mw-fieldset">
          <legend>Building</legend>
          <div className="mw-types">
            {BUILDING_TYPES.map((type) => (
              <label key={type.value} className="mw-type">
                <input
                  type="radio"
                  name="buildingType"
                  value={type.value}
                  checked={buildingType === type.value}
                  onChange={() => setBuildingType(type.value)}
                />
                <span>
                  <strong>{type.label}</strong>
                  <small>{type.note}</small>
                </span>
              </label>
            ))}
          </div>
          <small className="mw-hint">
            Changing the type reshapes the building. Everything else only changes its colours.
          </small>
        </fieldset>

        <Swatches name="facadeColor" legend="Facade" value={facadeColor} onChange={setFacade} />
        <Swatches name="accentColor" legend="Accent" value={accentColor} onChange={setAccent} />

        {state.error && (
          <p className="mw-error" role="alert">
            {state.error}
          </p>
        )}
        {state.message && (
          <p className="mw-ok" role="status">
            {state.message}
          </p>
        )}

        <Save />
      </form>
    </div>
  );
}

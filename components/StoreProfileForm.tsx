'use client';

/**
 * The shop's public profile: website, bio, socials and logo.
 *
 * Separate from the building editor because they answer different questions —
 * one is what the shop looks like on the street, this is who the shop is.
 */

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/app/actions';
import {
  MAX_BIO,
  SOCIAL_PLATFORMS,
  type StoreProfile,
} from '@/lib/store-profile';

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="mw-chip mw-chip-primary" disabled={pending}>
      {pending ? 'Saving…' : 'Save shop details'}
    </button>
  );
}

export default function StoreProfileForm({
  address,
  profile,
  logoUrl,
  action,
}: {
  address: string;
  profile: StoreProfile;
  logoUrl: string | null;
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const [bio, setBio] = useState(profile.bio ?? '');

  return (
    <form action={formAction} className="mw-form mw-form-wide">
      <input type="hidden" name="address" value={address} />

      <label className="mw-field">
        <span>Website</span>
        <input
          name="storeUrl"
          type="text"
          inputMode="url"
          defaultValue={profile.url ?? ''}
          placeholder="nike.com"
          spellCheck={false}
        />
        <small className="mw-hint">Shown on your shop page. Leave blank to remove it.</small>
      </label>

      <label className="mw-field">
        <span>About</span>
        <textarea
          name="storeBio"
          rows={3}
          maxLength={MAX_BIO}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <small className="mw-hint">
          {bio.length}/{MAX_BIO}
        </small>
      </label>

      <fieldset className="mw-fieldset">
        <legend>Socials</legend>
        <div className="mw-socials-fields">
          {SOCIAL_PLATFORMS.map((platform) => (
            <label key={platform.key} className="mw-field">
              <span>{platform.label}</span>
              <input
                name={platform.key}
                type="text"
                defaultValue={profile.socials[platform.key] ?? ''}
                placeholder="handle"
                spellCheck={false}
              />
            </label>
          ))}
        </div>
        <small className="mw-hint">
          Just the handle — we build the link, so it always points where it says.
        </small>
      </fieldset>

      <fieldset className="mw-fieldset">
        <legend>Logo</legend>
        {logoUrl && (
          <div className="mw-logo-current">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Your current logo" width={64} height={64} />
            <label className="mw-checkbox">
              <input type="checkbox" name="removeLogo" value="yes" />
              <span>Remove it</span>
            </label>
          </div>
        )}
        <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
        <small className="mw-hint">
          PNG, JPEG or WebP, under 256KB. Shown on your shop page, and on the street when someone
          is linked straight to your building.
        </small>
      </fieldset>

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
  );
}

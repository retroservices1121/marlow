'use client';

/**
 * Claims an empty lot.
 *
 * Today this is a straight write. When purchasing goes in it becomes the
 * checkout entry point instead — `claimLot` already takes nothing but an
 * address and a user id, so a payment webhook can call it unchanged.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { claimAction } from '@/app/actions';

function Submit({ signedIn }: { signedIn: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="mw-chip mw-chip-primary" disabled={pending}>
      {pending ? 'Claiming…' : signedIn ? 'Claim this lot' : 'Sign in to claim'}
    </button>
  );
}

export default function ClaimButton({ address, signedIn }: { address: string; signedIn: boolean }) {
  const [state, formAction] = useActionState(claimAction, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="address" value={address} />
      <Submit signedIn={signedIn} />
      {state.error && (
        <p className="mw-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

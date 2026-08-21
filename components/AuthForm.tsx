'use client';

/**
 * Shared sign-in / sign-up form.
 *
 * Uses `useActionState`, so it works before hydration: the form posts to the
 * server action and errors come back rendered, with no client-side validation
 * standing between the user and the server's answer.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/app/actions';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="mw-chip mw-chip-primary" disabled={pending}>
      {pending ? 'Working…' : label}
    </button>
  );
}

export default function AuthForm({
  action,
  label,
  next,
  passwordHint,
}: {
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  label: string;
  next?: string;
  passwordHint?: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="mw-form">
      {next && <input type="hidden" name="next" value={next} />}

      <label className="mw-field">
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          spellCheck={false}
        />
      </label>

      <label className="mw-field">
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete={label === 'Create account' ? 'new-password' : 'current-password'}
          required
        />
        {passwordHint && <small className="mw-hint">{passwordHint}</small>}
      </label>

      {state.error && (
        <p className="mw-error" role="alert">
          {state.error}
        </p>
      )}

      <Submit label={label} />
    </form>
  );
}

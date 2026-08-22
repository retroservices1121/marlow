/** Creating an account. Clerk verifies the email, which is what makes it safe. */

import { SignUp } from '@clerk/nextjs';

export default function RegisterPage() {
  return (
    <main className="mw-page mw-narrow mw-auth">
      <h1 className="mw-title">Move to Marlow</h1>
      <p className="mw-sub">
        An account lets you take a lot and decide what gets built on it.
      </p>
      <SignUp signInUrl="/login" fallbackRedirectUrl="/lots" />
    </main>
  );
}

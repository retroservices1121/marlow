/** Signing in. Clerk owns the form, the verification and the session. */

import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
  return (
    <main className="mw-page mw-narrow mw-auth">
      <h1 className="mw-title">Sign in</h1>
      <p className="mw-sub">
        Pick up where you left off on your building. If you bought a lot before making an account,
        sign in with the email you used at checkout and it will be waiting.
      </p>
      <SignIn signUpUrl="/register" fallbackRedirectUrl="/lots" />
    </main>
  );
}

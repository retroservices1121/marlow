import Link from 'next/link';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { registerAction } from '@/app/actions';
import { currentUser } from '@/lib/session';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await currentUser()) redirect('/lots');
  const { next } = await searchParams;

  return (
    <main className="mw-page mw-narrow">
      <h1 className="mw-title">Move to Marlow</h1>
      <p className="mw-sub">
        An account lets you claim an empty lot and decide what gets built on it.
      </p>
      <AuthForm
        action={registerAction}
        label="Create account"
        next={next}
        passwordHint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      <p className="mw-sub">
        Already have one? <Link href="/login">Sign in</Link>.
      </p>
    </main>
  );
}

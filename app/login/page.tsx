import Link from 'next/link';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { loginAction } from '@/app/actions';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await currentUser()) redirect('/lots');
  const { next } = await searchParams;

  return (
    <main className="mw-page mw-narrow">
      <h1 className="mw-title">Sign in</h1>
      <p className="mw-sub">Pick up where you left off on your building.</p>
      <AuthForm action={loginAction} label="Sign in" next={next} />
      <p className="mw-sub">
        No account yet? <Link href="/register">Take a lot on Marlow</Link>.
      </p>
    </main>
  );
}

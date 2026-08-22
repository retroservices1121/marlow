'use server';

/**
 * Server actions — the only way the browser mutates anything.
 *
 * Every action re-reads the session server-side rather than trusting anything
 * the form sends. Ownership is checked again inside `lib/lot-store.ts`, so these
 * are a convenience layer, not the security boundary.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authenticate, createSession, registerUser } from '@/lib/auth';
import { clearSession, currentUser, setSessionCookie } from '@/lib/session';
import { claimLot, deleteLogo, releaseLot, saveLogo, saveLotChoices, saveStoreProfile } from '@/lib/lot-store';
import { SOCIAL_PLATFORMS } from '@/lib/store-profile';

export type ActionState = { error?: string; message?: string };

const str = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

/** Where to send someone after signing in — same-origin paths only. */
function safeRedirect(target: string): string {
  return target.startsWith('/') && !target.startsWith('//') ? target : '/demo';
}

export async function registerAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const result = await registerUser(str(data, 'email'), str(data, 'password'));
  if (!result.ok) return { error: result.error };
  await setSessionCookie(await createSession(result.user.id));
  redirect(safeRedirect(str(data, 'next') || '/lots'));
}

export async function loginAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const result = await authenticate(str(data, 'email'), str(data, 'password'));
  if (!result.ok) return { error: result.error };
  await setSessionCookie(await createSession(result.user.id));
  redirect(safeRedirect(str(data, 'next') || '/lots'));
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect('/demo');
}

export async function claimAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const user = await currentUser();
  const address = str(data, 'address');
  if (!user) redirect(`/login?next=${encodeURIComponent(`/lots/${encodeURIComponent(address)}`)}`);

  const result = await claimLot(address, user.id);
  if (!result.ok) return { error: result.error };

  revalidatePath('/demo');
  revalidatePath('/lots');
  redirect(`/lots/${encodeURIComponent(address)}`);
}

export async function saveAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: 'Sign in to edit this lot.' };

  const result = await saveLotChoices(str(data, 'address'), user.id, {
    buildingType: str(data, 'buildingType'),
    facadeColor: str(data, 'facadeColor'),
    accentColor: str(data, 'accentColor'),
    signText: str(data, 'signText'),
  });
  if (!result.ok) return { error: result.error };

  revalidatePath('/demo');
  revalidatePath('/lots');
  return { message: 'Saved. Your building is on the street.' };
}

/** Saves the shop's public profile: link, bio and social handles. */
export async function saveProfileAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: 'Sign in to edit this shop.' };
  const address = str(data, 'address');

  const socials = Object.fromEntries(
    SOCIAL_PLATFORMS.map((platform) => [platform.key, str(data, platform.key)]),
  );

  const result = await saveStoreProfile(address, user.id, {
    storeUrl: str(data, 'storeUrl'),
    storeBio: str(data, 'storeBio'),
    ...socials,
  });
  if (!result.ok) return { error: result.error };

  // A logo is optional on every save; an empty file input means "leave it".
  const file = data.get('logo');
  if (file instanceof File && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await saveLogo(address, user.id, bytes, file.type);
    if (!stored.ok) return { error: stored.error };
  }
  if (str(data, 'removeLogo') === 'yes') {
    await deleteLogo(address, user.id);
  }

  revalidatePath('/demo');
  revalidatePath(`/lots/${address}`);
  return { message: 'Saved. Your shop page is live.' };
}

export async function releaseAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: 'Sign in first.' };

  const result = await releaseLot(str(data, 'address'), user.id);
  if (!result.ok) return { error: result.error };

  revalidatePath('/demo');
  revalidatePath('/lots');
  redirect('/lots');
}

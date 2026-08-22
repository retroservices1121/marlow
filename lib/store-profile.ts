/**
 * A store's public profile: link, bio, socials, logo.
 *
 * All of it is attacker-controlled text that gets rendered on a page anyone can
 * read, so validation is the whole job here:
 *
 *   - links are http(s) only. `javascript:` and `data:` must never survive
 *     into an href, and a scheme allowlist is the only reliable way to say so
 *   - socials are stored as bare handles and the URL is built by us, so a
 *     store cannot point its "Instagram" link at somewhere else entirely
 *   - logos are size- and type-capped, and SVG is refused: it can carry script,
 *     and we serve these from our own origin
 */

export const MAX_BIO = 280;
export const MAX_URL = 300;
export const MAX_HANDLE = 40;
/** Comfortably more than a logo needs, far less than a way to host files. */
export const MAX_LOGO_BYTES = 256 * 1024;

/** Raster only. An SVG served from our origin could run script in it. */
export const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type LogoType = (typeof ALLOWED_LOGO_TYPES)[number];

export const SOCIAL_PLATFORMS = [
  { key: 'x', label: 'X', prefix: 'https://x.com/' },
  { key: 'instagram', label: 'Instagram', prefix: 'https://instagram.com/' },
  { key: 'tiktok', label: 'TikTok', prefix: 'https://tiktok.com/@' },
  { key: 'linkedin', label: 'LinkedIn', prefix: 'https://linkedin.com/company/' },
  { key: 'github', label: 'GitHub', prefix: 'https://github.com/' },
  // An invite code, not a username: discord.gg/<code> is the only Discord link
  // that does anything for somebody who is not already in the server.
  { key: 'discord', label: 'Discord', prefix: 'https://discord.gg/', placeholder: 'invite code' },
] as const;

export type SocialKey = (typeof SOCIAL_PLATFORMS)[number]['key'];

export type StoreProfile = {
  url: string | null;
  bio: string | null;
  socials: Partial<Record<SocialKey, string>>;
  hasLogo: boolean;
};

/* ---- Links ------------------------------------------------------------- */

/**
 * Accepts a store's website. Returns a normalised absolute URL, or null.
 *
 * A bare `nike.com` is treated as https, which is what people type. Anything
 * whose scheme is not http(s) after parsing is refused outright rather than
 * cleaned up — there is no safe repair for `javascript:alert(1)`.
 */
export function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  // A hostname with no dot is not a site anybody can reach.
  if (!parsed.hostname.includes('.')) return null;
  return parsed.toString().length <= MAX_URL ? parsed.toString() : null;
}

/** Text shown in place of a long URL. */
export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.hostname.replace(/^www\./, '')}${path}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}

/* ---- Socials ----------------------------------------------------------- */

/**
 * Reduces whatever was pasted to a bare handle.
 *
 * People paste full profile URLs as often as handles, so a URL is accepted and
 * its last path segment taken. The result is always just the handle, because
 * the link is assembled from a fixed prefix at render time.
 */
export function normalizeHandle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (text.length === 0) return null;

  if (/^https?:\/\//i.test(text)) {
    try {
      const parsed = new URL(text);
      text = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
    } catch {
      return null;
    }
  }

  const handle = text.replace(/^@+/, '').trim();
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(handle)) return null;
  return handle.slice(0, MAX_HANDLE);
}

export function socialUrl(key: SocialKey, handle: string): string {
  const platform = SOCIAL_PLATFORMS.find((p) => p.key === key);
  return `${platform?.prefix ?? ''}${handle}`;
}

/* ---- Bio --------------------------------------------------------------- */

export function normalizeBio(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, MAX_BIO);
  return cleaned.length > 0 ? cleaned : null;
}

/* ---- Logos ------------------------------------------------------------- */

export function isAllowedLogoType(value: unknown): value is LogoType {
  return typeof value === 'string' && (ALLOWED_LOGO_TYPES as readonly string[]).includes(value);
}

/**
 * Checks the bytes really are the image type they claim.
 *
 * Content-Type on an upload is whatever the client said it was. Serving those
 * bytes back from our own origin under a type we never verified is how an
 * "image" ends up being treated as something else, so the magic numbers decide.
 */
export function sniffImageType(bytes: Uint8Array): LogoType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export type LogoProblem = string | null;

/** Null when the upload is acceptable, otherwise the reason it is not. */
export function logoProblem(bytes: Uint8Array): LogoProblem {
  if (bytes.length === 0) return 'That file is empty.';
  if (bytes.length > MAX_LOGO_BYTES) {
    return `Logos must be under ${Math.round(MAX_LOGO_BYTES / 1024)}KB.`;
  }
  if (!sniffImageType(bytes)) return 'Logos must be a PNG, JPEG or WebP image.';
  return null;
}

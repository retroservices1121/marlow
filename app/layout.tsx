import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import Nav from '@/components/Nav';
import './globals.css';

/*
 * What a link to Marlow says about itself.
 *
 * This text is the shop window everywhere the town is not: search results, a
 * pasted link, a shared post. "A hand-drawn town where every building belongs
 * to somebody" described the thing without ever saying what it is for, so
 * somebody seeing it cold had no idea they could buy anything.
 *
 * `metadataBase` is what makes the icon and any social image resolve to
 * absolute URLs — relative ones are ignored by every service that unfurls a
 * link.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.MARLOW_URL ?? 'https://marlow.town'),
  title: 'Marlow — your own virtual storefront',
  description:
    'Own a virtual storefront in Marlow, a hand-drawn town of 1,000 addresses. Put your sign over the door and your links inside. From $15.',
  openGraph: {
    type: 'website',
    siteName: 'Marlow',
    title: 'Marlow — your own virtual storefront',
    description:
      'A hand-drawn town of 1,000 shopfronts. Take an address, put your sign over the door, and send people on to your site. From $15.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Marlow — your own virtual storefront',
    description:
      'A hand-drawn town of 1,000 shopfronts. Take an address, put your sign over the door, and send people on to your site. From $15.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/*
 * Analytics, and only when it is configured.
 *
 * A plain <script>, deliberately, not next/script. With `afterInteractive` Next
 * emits nothing but a preload link and injects the real tag from the client
 * after hydration — so the page shipped a promise of analytics and recorded
 * nothing. A parser-inserted tag is in the HTML itself and runs for every
 * visitor, whether or not React ever wakes up.
 *
 * The id is public — it ships in the HTML of every page, which is what
 * `NEXT_PUBLIC_` means — so the environment variable is for convenience, not
 * secrecy. No id, no tag: local development and any deploy without one send
 * nothing rather than sending it nowhere.
 *
 * DataFast turns itself off on localhost, so this never counts our own walking
 * about the town.
 */
const DATAFAST_ID = process.env.NEXT_PUBLIC_DATAFAST_ID;
const DATAFAST_DOMAIN = process.env.NEXT_PUBLIC_DATAFAST_DOMAIN ?? 'marlow.town';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          {/* One chunky geometric sans for signage. Weight 600 is all we use. */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&display=swap"
            rel="stylesheet"
          />

          {DATAFAST_ID && (
            <script
              defer
              data-website-id={DATAFAST_ID}
              data-domain={DATAFAST_DOMAIN}
              src="https://datafa.st/js/script.js"
            />
          )}
        </head>
        <body>
          <Nav />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}

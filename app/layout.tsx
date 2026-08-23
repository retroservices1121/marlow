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
  /*
   * The town answers on two hostnames, so every page has to say which one is
   * really it. Without this, two identical copies compete with each other in
   * search and neither wins outright. Resolved against `metadataBase`, so it
   * always names marlow.town whichever door served the page.
   */
  alternates: { canonical: './' },
  title: 'Marlow — your own virtual storefront',
  description:
    'Own a virtual storefront in Marlow, a hand-drawn town of 1,000 addresses. Put your sign over the door and your links inside. From $15.',
  openGraph: {
    type: 'website',
    siteName: 'Marlow',
    images: ['/card.png'],
    title: 'Marlow — your own virtual storefront',
    description:
      'A hand-drawn town of 1,000 shopfronts. Take an address, put your sign over the door, and send people on to your site. From $15.',
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/card.png'],
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
 * The id is written here rather than left to configuration. It is public by
 * construction — it ships in the HTML of every page — so there was never
 * anything to protect, and an environment variable bought nothing but a place
 * for it to go wrong quietly. It did: a mistyped value sat in Railway reporting
 * to a website that does not exist, and because a wrong id looks exactly like a
 * right one in the markup, the only symptom was an empty dashboard.
 *
 * In the file it is reviewable, it travels with the code, and it cannot be one
 * forgotten rebuild out of date — `NEXT_PUBLIC_` values are baked in at build
 * time, so setting one and restarting changes nothing.
 *
 * There is deliberately no environment override any more. There was one, and it
 * held a stale id that quietly beat the correct value sitting right here, which
 * is the same bug twice from the same source. A value with exactly one home
 * cannot disagree with itself.
 *
 * DataFast turns itself off on localhost, so this never counts our own walking
 * about the town.
 */
const DATAFAST_ID = 'dfid_ii1m3WadIJpQo7KtlxnCy';
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

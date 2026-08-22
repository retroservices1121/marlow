import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import Nav from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Marlow',
  description: 'A hand-drawn town where every building belongs to somebody.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/*
 * Analytics, and only when it is configured.
 *
 * The id is public — it ships in the HTML of every page, which is what
 * `NEXT_PUBLIC_` means — so it lives in an environment variable for
 * convenience, not secrecy. Rendering the tag only when the id is set keeps a
 * broken script out of local development and out of any deploy that has not
 * been given one.
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
            <Script
              defer
              data-website-id={DATAFAST_ID}
              data-domain={DATAFAST_DOMAIN}
              src="https://datafa.st/js/script.js"
              strategy="afterInteractive"
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

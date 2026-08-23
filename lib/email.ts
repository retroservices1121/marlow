/**
 * The three things Marlow has to tell somebody, and no others.
 *
 * Every one of these exists because a moment that matters to a person is
 * currently silent:
 *
 *   bought a lot   they paid, and nothing arrived to say what happens next
 *   won a vehicle  their ad went up and nobody told them
 *   outbid         their ad came down, with no refund, and nobody told them
 *
 * That last one is the reason this file exists. In an auction where the losing
 * money is kept, silence is not a missing nicety — it is the difference between
 * a rule somebody agreed to and a rule that feels like being robbed.
 *
 * Nothing here is marketing. Marlow has no mailing list, sends no digests, and
 * these are the only messages it will ever send; anything else would need a way
 * to unsubscribe and would deserve one.
 *
 * Sending never throws and never blocks anything important. Every one of these
 * is triggered from a payment webhook, and an email provider having a bad
 * afternoon must not turn into a lot that was paid for and never handed over.
 */

const API = 'https://api.resend.com/emails';

/** Where it comes from. A real address on a domain Resend has verified. */
function sender(): string {
  return process.env.MARLOW_EMAIL_FROM ?? 'Marlow <hello@marlow.town>';
}

function site(): string {
  return process.env.MARLOW_URL ?? 'https://marlow.town';
}

/**
 * Sends one message. Reports whether it went, and never raises.
 *
 * With no API key it logs and returns false, so a deploy without email
 * configured behaves like a deploy without analytics: the feature is absent
 * rather than broken, and it says so in the log.
 */
export async function send(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email] no RESEND_API_KEY; would have sent "${message.subject}" to ${message.to}`);
    return false;
  }

  try {
    const response = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: sender(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });

    if (!response.ok) {
      /*
       * The reason, not just the number. "HTTP 403" sent me to the API to ask
       * what was wrong; the body said "the marlow.town domain is not verified"
       * and answered it outright. A log line that cannot be acted on is barely
       * better than silence, and this is the only trace there will be.
       *
       * Truncated, because a provider's error page should not fill the log.
       */
      const reason = (await response.text().catch(() => '')).slice(0, 300);
      console.error(
        `[email] "${message.subject}" to ${message.to} refused: HTTP ${response.status} ${reason}`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] send failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

/* ---- The three messages ------------------------------------------------- */

/**
 * A shopfront has been paid for.
 *
 * The buyer has no account yet — that is the whole point of buying without one
 * — so the only thing this needs to do is tell them the one fact that makes
 * the lot theirs: sign in with this address.
 */
export function lotBought(to: string, address: string, slug: string): Promise<boolean> {
  const url = `${site()}/${slug}`;
  return send({
    to,
    subject: `${address} is yours`,
    text: [
      `${address} is yours.`,
      '',
      `Your shopfront: ${url}`,
      '',
      'To put your name over the door, create an account at',
      `${site()}/register using this same email address. The lot is held`,
      'against it and becomes yours to edit the moment you sign in.',
      '',
      'You choose the sign, the colours, the kind of building, your logo,',
      'your website and your links. Nobody can take the address from you.',
      '',
      'Marlow',
    ].join('\n'),
  });
}

/** A bid won a vehicle, and the ad is already on the road. */
export function adWon(to: string, vehicle: string, cents: number): Promise<boolean> {
  return send({
    to,
    subject: `Your ad is on ${vehicle.toLowerCase()}`,
    text: [
      `Your bid of $${(cents / 100).toFixed(2)} won ${vehicle.toLowerCase()}.`,
      '',
      'Your ad is driving every street in Marlow now:',
      `${site()}/street/main-street`,
      '',
      'It stays up until somebody bids more than you did. If that happens',
      'we will tell you, and you can bid again at:',
      `${site()}/ads`,
      '',
      'Marlow',
    ].join('\n'),
  });
}

/**
 * Somebody has been outbid, and their ad has come down.
 *
 * The plainest message here, deliberately. It is bad news delivered under a
 * rule the reader agreed to, and dressing it up would be worse than the news.
 * It says what happened, what it costs to come back, and does not apologise for
 * a rule that was stated before they bid.
 */
export function outbid(to: string, vehicle: string, nowCents: number): Promise<boolean> {
  return send({
    to,
    subject: `Your ad has come off ${vehicle.toLowerCase()}`,
    text: [
      `Somebody has outbid you on ${vehicle.toLowerCase()}, so your ad has come down.`,
      '',
      `It now stands at $${(nowCents / 100).toFixed(2)}.`,
      '',
      'As it says on the bidding page, bids are final and there are no refunds',
      'when you are outbid. If you want the vehicle back, you can bid again:',
      `${site()}/ads`,
      '',
      'A shopfront works the other way — bought once, at a fixed price, and',
      `nobody can take it from you: ${site()}/streets`,
      '',
      'Marlow',
    ].join('\n'),
  });
}

/**
 * Buy this lot.
 *
 * A plain form to a route handler, with no client JavaScript: it is one POST,
 * and the page it sits on must work for somebody who arrived from a search
 * result with a slow connection.
 *
 * No sign-in first. The email given at checkout is what the lot is held
 * against, and signing in later is what makes it editable.
 */

export default function BuyButton({ address, price }: { address: string; price: string }) {
  return (
    <form method="post" action="/api/checkout">
      <input type="hidden" name="address" value={address} />
      <button type="submit" className="mw-chip mw-chip-primary">
        Buy this lot · {price}
      </button>
      <p className="mw-sub">
        No account needed. Buy it now and sign in afterwards with the same email to put your name
        over the door.
      </p>
    </form>
  );
}

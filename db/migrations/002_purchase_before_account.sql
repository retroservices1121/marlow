-- Buying a lot must not require an account.
--
-- At checkout there is no user yet — only the email the buyer gave the payment
-- provider. So a lot is owned by an email first and by an account second:
--
--   owner_email  set at purchase, never cleared while the lot is owned
--   owner_id     set later, when someone signs in with that email *verified*
--
-- Both can be present; owner_id winning means the lot has been linked to a real
-- account and can be edited. owner_email alone means bought but not yet claimed,
-- which renders on the street but cannot be customised.

alter table lots add column if not exists owner_email text;
alter table lots add column if not exists purchased_at timestamptz;

-- Emails are matched case-insensitively at link time, so store them folded.
create index if not exists lots_owner_email_idx on lots (lower(owner_email));

-- A lot is owned if either half is present. Guards against a row that claims to
-- be sold while belonging to nobody.
alter table lots drop constraint if exists lots_sold_has_owner;
alter table lots add constraint lots_sold_has_owner
  check (status <> 'sold' or owner_email is not null or owner_id is not null);

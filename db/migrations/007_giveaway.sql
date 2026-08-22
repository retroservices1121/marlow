-- A lot held back on purpose, to be given away.
--
-- Reserving a lot uses the same mechanism as a purchase — held against an email
-- until somebody signs in with it — so from the database's point of view a
-- reserved lot and a sold one were indistinguishable, and the page said "Sold"
-- to everybody who followed the giveaway link. This is the difference.

alter table lots drop constraint if exists lots_acquired_via_known;
alter table lots add constraint lots_acquired_via_known
  check (acquired_via is null or acquired_via in ('claim', 'grant', 'purchase', 'giveaway'));

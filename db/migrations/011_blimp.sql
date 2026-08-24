-- A fourth slot, in the sky.
--
-- The only one that does not compete for road space, which is why it carries
-- the largest panel in the town and costs the most: it is visible from every
-- street at once, over everything, and the sky was empty.

alter table ad_slots drop constraint if exists ad_slots_kind_check;
alter table ad_slots add constraint ad_slots_kind_check
  check (kind in ('blimp', 'led', 'pickup', 'van'));

insert into ad_slots (kind, min_bid_cents) values ('blimp', 2000)
on conflict (kind) do nothing;

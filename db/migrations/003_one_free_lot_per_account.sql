-- How a lot was acquired, and a cap on the free ones.
--
-- Three routes in, and they need telling apart: a free self-serve claim, a plot
-- given away to seed the town, and (later) a paid purchase. Only the first is
-- capped — being given two plots, or buying two, is fine.

alter table lots add column if not exists acquired_via text;

alter table lots drop constraint if exists lots_acquired_via_known;
alter table lots add constraint lots_acquired_via_known
  check (acquired_via is null or acquired_via in ('claim', 'grant', 'purchase'));

-- Existing rows predate the column: anything with a buyer email came in through
-- a grant, anything else was claimed from the street.
update lots
   set acquired_via = case when owner_email is not null then 'grant' else 'claim' end
 where acquired_via is null
   and (owner_id is not null or owner_email is not null);

-- The cap itself. A partial unique index makes "one free lot per account" a
-- fact the database enforces, rather than a count-then-insert that two
-- simultaneous requests could both walk through.
create unique index if not exists lots_one_free_claim_per_owner
  on lots (owner_id)
  where acquired_via = 'claim' and owner_id is not null;

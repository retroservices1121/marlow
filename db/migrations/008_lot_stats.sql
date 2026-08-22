-- What an owner gets back for their money.
--
-- A shopfront that only sits there is an ornament. A shopfront that can tell
-- you 214 people looked at it this month and 38 went on to your site is a
-- thing worth having, and the difference is this table.
--
-- Daily buckets rather than one row per event. A row per click would grow
-- without limit and buy nothing an owner would ever look at — nobody wants the
-- timestamp of the fourth visit on a Tuesday. Counting into a day means the
-- whole town's history is a few thousand rows a year, and "last 30 days" is one
-- indexed range scan.
--
-- Nothing about the visitor is stored. Not an address, not an agent, not an
-- identifier of any kind: these are counters, and a counter needs no idea who
-- moved it.

create table if not exists lot_stats (
  address text not null references lots (address) on delete cascade,
  -- The day in UTC. One town, one clock, so a day means the same everywhere.
  day     date not null,
  -- 'view'   somebody opened the storefront page
  -- 'link'   somebody clicked through to the owner's own site
  -- 'social' somebody clicked one of the owner's social links
  kind    text not null check (kind in ('view', 'link', 'social')),
  -- Which social, for 'social'. Empty for the others, because a null here
  -- would make the primary key stop working as one.
  target  text not null default '',
  count   bigint not null default 0,
  primary key (address, day, kind, target)
);

-- Every read is "this shop, these last N days".
create index if not exists lot_stats_address_day on lot_stats (address, day desc);

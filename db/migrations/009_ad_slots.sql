-- Three vehicles carrying advertising through the town, sold by auction.
--
-- Deliberately a different thing from a lot, and kept in its own table so it
-- can never be confused with one. A shopfront is bought once at a fixed price
-- and cannot be taken away; a vehicle panel is rented from whoever is willing
-- to pay most this week, and the holder can be displaced. Those are opposite
-- promises, and the only way to keep both honest is to never let the code treat
-- one as the other.
--
-- One row per vehicle, forever. There are three vehicles; there is no operation
-- that creates or destroys one, so the kind is the key.

create table if not exists ad_slots (
  kind          text primary key check (kind in ('led', 'pickup', 'van')),
  -- What it takes to get on an empty vehicle, in whole cents.
  min_bid_cents integer not null,
  -- What the current holder actually paid. Zero means nobody has bid yet.
  bid_cents     integer not null default 0,
  -- Held against an email, exactly as a lot bought before its buyer signs in.
  holder_email  text,
  -- Where the panel sends people.
  url           text,
  -- Content hash of the artwork in ad_images, or null while the slot is empty.
  image_hash    text,
  since         timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Artwork in its own table, for the same reason logos are: the street reads the
-- slots on every render, and image bytes on that row would be dragged into
-- every page load.
create table if not exists ad_images (
  kind         text primary key references ad_slots (kind) on delete cascade,
  bytes        bytea not null,
  content_type text not null,
  hash         text not null,
  updated_at   timestamptz not null default now()
);

-- Every bid ever made, kept whether or not it won.
--
-- With no refunds, the history is the only record of who paid what. A dispute
-- about a slot somebody held for an hour has to be answerable, and "the current
-- holder" cannot answer it.
create table if not exists ad_bids (
  id         uuid primary key,
  kind       text not null references ad_slots (kind),
  email      text not null,
  cents      integer not null,
  -- Whether this bid took the slot. A losing bid is one that arrived under the
  -- standing price; it is recorded and refused rather than silently dropped.
  won        boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists ad_bids_kind_time on ad_bids (kind, created_at desc);

-- The floor prices. Truck, then pickup, then van — the same order as their
-- panels, so what you pay follows what you can see.
insert into ad_slots (kind, min_bid_cents) values
  ('led', 1000),
  ('pickup', 500),
  ('van', 300)
on conflict (kind) do nothing;

-- Two of them start with a shop already riding.
--
-- An empty fleet advertises nothing but its own emptiness, and the first person
-- to look at the bidding page should see what a taken slot looks like. These
-- are the town's own early shops, carried at no charge, and the first real bid
-- displaces them exactly as it would displace anybody.
update ad_slots set url = (select store_url from lots where address = '100 Main Street'),
                    image_hash = (select hash from lot_logos where address = '100 Main Street'),
                    updated_at = now()
 where kind = 'led'
   and exists (select 1 from lot_logos where address = '100 Main Street');

update ad_slots set url = (select store_url from lots where address = '102 Cinder Row'),
                    image_hash = (select hash from lot_logos where address = '102 Cinder Row'),
                    updated_at = now()
 where kind = 'pickup'
   and exists (select 1 from lot_logos where address = '102 Cinder Row');

insert into ad_images (kind, bytes, content_type, hash)
select 'led', bytes, content_type, hash from lot_logos where address = '100 Main Street'
on conflict (kind) do nothing;

insert into ad_images (kind, bytes, content_type, hash)
select 'pickup', bytes, content_type, hash from lot_logos where address = '102 Cinder Row'
on conflict (kind) do nothing;

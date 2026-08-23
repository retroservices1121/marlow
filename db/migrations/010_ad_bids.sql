-- A bid carries its own artwork, from before it is paid for.
--
-- The alternative is to take the money and then ask for the picture, which
-- leaves a slot won and blank, on a vehicle driving past everybody, for as long
-- as it takes the winner to come back and finish. Capturing the artwork with
-- the bid means the moment a payment settles there is something to put up.
--
-- It also means most of these rows are for bids that never won. That is the
-- point: with no refunds, the losing bids are the ones most likely to be argued
-- about later, and a row that was deleted cannot answer anything.

alter table ad_bids add column if not exists url          text;
alter table ad_bids add column if not exists bytes        bytea;
alter table ad_bids add column if not exists content_type text;
alter table ad_bids add column if not exists hash         text;

-- Whether the money actually arrived. A bid is created when somebody starts a
-- checkout, and most abandoned checkouts never come back — so an unpaid bid is
-- the normal case, not a fault.
alter table ad_bids add column if not exists paid boolean not null default false;
alter table ad_bids add column if not exists paid_at timestamptz;

-- What the standing bid was when this one was judged, so "you were outbid" and
-- "you bid under the floor" stay distinguishable a month later.
alter table ad_bids add column if not exists beaten_cents integer;

create index if not exists ad_bids_paid on ad_bids (paid, created_at desc);

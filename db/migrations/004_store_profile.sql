-- What a business puts in its window.
--
-- A lot is bought by a store, not a person, so the page a visitor lands on
-- describes the business: where to find it, who it is, and what it looks like.
-- The owner's email is never part of this — anyone can read a storefront page.

alter table lots add column if not exists store_url text;
alter table lots add column if not exists store_bio text;

-- Handles, not URLs. Storing "nike" and building the link ourselves means a
-- store cannot point one of these at somewhere unexpected.
alter table lots add column if not exists social_x text;
alter table lots add column if not exists social_instagram text;
alter table lots add column if not exists social_tiktok text;
alter table lots add column if not exists social_linkedin text;
alter table lots add column if not exists social_github text;

alter table lots drop constraint if exists lots_store_bio_length;
alter table lots add constraint lots_store_bio_length
  check (store_bio is null or char_length(store_bio) <= 280);

alter table lots drop constraint if exists lots_store_url_length;
alter table lots add constraint lots_store_url_length
  check (store_url is null or char_length(store_url) <= 300);

-- Logos live in their own table on purpose. The street reads `select * from
-- lots` for all 120 buildings on every render; image bytes on that row would be
-- dragged into every page load.
create table if not exists lot_logos (
  address      text primary key references lots (address) on delete cascade,
  bytes        bytea not null,
  content_type text not null,
  -- Content hash, used as the ETag so a browser can skip re-downloading.
  hash         text not null,
  updated_at   timestamptz not null default now()
);

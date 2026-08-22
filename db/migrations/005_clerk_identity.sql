-- Identity moves to Clerk.
--
-- Clerk owns who somebody is: the password, the email verification, the
-- sessions. What stays here is the minimum needed to say which lots are whose —
-- a row per account keyed by Clerk's user id, so `lots.owner_id` keeps real
-- foreign-key integrity and the dashboard can name an owner without a
-- round-trip to Clerk on every page.
--
-- The password and session columns go. Keeping a password hash we no longer
-- read is a liability, not a fallback.

alter table users add column if not exists clerk_id text;

-- Nobody had signed up under the old scheme, so there is nothing to migrate.
-- If that ever stops being true this needs a real backfill, not a drop.
delete from sessions;
delete from users where clerk_id is null;

alter table users alter column clerk_id set not null;
create unique index if not exists users_clerk_id_idx on users (clerk_id);

alter table users alter column password_hash drop not null;
alter table users drop column if exists password_hash;

drop table if exists sessions;

-- Clerk verifies the address; this is a copy for display and for matching a
-- purchase made before the buyer had an account.
alter table users alter column email drop not null;

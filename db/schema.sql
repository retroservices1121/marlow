-- Marlow: owner accounts and the choices they make about a lot.
--
-- Geometry is never stored. A lot row holds only what an owner chose plus the
-- app-supplied status; every dimension is still derived from the address at
-- render time. An address with no row here renders exactly as the generated
-- inventory does.

create table if not exists users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- Case-insensitive uniqueness: nobody gets to register Ada@ and ada@.
create unique index if not exists users_email_lower_idx on users (lower(email));

create table if not exists sessions (
  token      text primary key,
  user_id    text not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expiry_idx on sessions (expires_at);

create table if not exists lots (
  -- "108 Main Street" — the same string that seeds the geometry.
  address       text primary key,
  owner_id      text references users (id) on delete set null,
  status        text not null default 'vacant' check (status in ('sold', 'vacant')),
  building_type text check (building_type in ('storefront', 'tower', 'warehouse', 'civic')),
  facade_color  text,
  accent_color  text,
  sign_text     text check (sign_text is null or char_length(sign_text) <= 18),
  updated_at    timestamptz not null default now()
);

create index if not exists lots_owner_idx on lots (owner_id);

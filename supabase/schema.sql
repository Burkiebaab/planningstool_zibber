-- Zibber Marketingplanning: databaseschema voor Supabase.
-- Uitvoeren via Supabase → SQL Editor → New query → plakken → Run.
-- Het script kan veilig opnieuw worden uitgevoerd.

-- ── Toegang: alleen ingelogde @zibber.nl-gebruikers via Google ────────────
create or replace function public.is_zibber()
returns boolean
language sql
stable
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') like '%@zibber.nl'
      and (auth.jwt() -> 'app_metadata' -> 'providers') ? 'google',
    false
  )
$$;

-- ── Tabellen ─────────────────────────────────────────────────────────────
-- Elk planningsitem en teamlid staat als één JSON-document in `data`.
-- `client_id` is het browsertabblad dat de laatste wijziging deed; zo negeert
-- de app zijn eigen wijzigingen als ze via realtime terugkomen.

create table if not exists public.items (
  id          text primary key,
  data        jsonb not null,
  client_id   text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.members (
  id          text primary key,
  data        jsonb not null,
  position    integer not null default 0,
  client_id   text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.projects (
  name        text primary key,
  created_at  timestamptz not null default now()
);

-- Eén rij (id = 1) met de Jira-instellingen en de laatste synchronisatie.
create table if not exists public.settings (
  id          integer primary key default 1 check (id = 1),
  data        jsonb not null,
  client_id   text,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- ── Beveiliging (Row Level Security) ─────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['items', 'members', 'projects', 'settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Alleen Zibber" on public.%I', t);
    execute format(
      'create policy "Alleen Zibber" on public.%I for all to authenticated using (public.is_zibber()) with check (public.is_zibber())',
      t
    );
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

-- ── Realtime: wijzigingen van collega's direct zichtbaar ─────────────────
do $$
declare t text;
begin
  foreach t in array array['items', 'members', 'projects', 'settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── Aanmelden alleen met een @zibber.nl-adres ────────────────────────────
-- Activeren via Supabase → Authentication → Hooks → "Before User Created"
-- → type Postgres → functie public.hook_alleen_zibber.
create or replace function public.hook_alleen_zibber(event jsonb)
returns jsonb
language plpgsql
as $$
begin
  if lower(coalesce(event -> 'user' ->> 'email', '')) like '%@zibber.nl' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Alleen @zibber.nl-accounts hebben toegang.'
    )
  );
end;
$$;

grant execute on function public.hook_alleen_zibber(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_alleen_zibber(jsonb) from authenticated, anon, public;

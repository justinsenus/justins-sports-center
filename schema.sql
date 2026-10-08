begin;

create table if not exists public.player_stats (
  id text primary key check (id ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  display_name text not null check (length(btrim(display_name)) > 0),
  calculated_average double precision not null
    check (calculated_average > '-Infinity'::float8
       and calculated_average < 'Infinity'::float8),
  injury_fallback text not null default 'UNKNOWN'
    check (injury_fallback in
      ('ACTIVE','QUESTIONABLE','DOUBTFUL','OUT','IR','PUP','SUSPENDED','UNKNOWN')),
  sources_counted integer not null check (sources_counted > 0),
  updated_at timestamptz not null default now()
);

create index if not exists player_stats_average_idx
  on public.player_stats (calculated_average desc, id);

create or replace function public.touch_player_stats_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_player_stats_updated_at()
  from public, anon, authenticated;

drop trigger if exists player_stats_updated_at on public.player_stats;
create trigger player_stats_updated_at
before insert or update on public.player_stats
for each row execute function public.touch_player_stats_updated_at();

alter table public.player_stats enable row level security;
revoke all on table public.player_stats from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant select on table public.player_stats to anon, authenticated;
grant select, insert, update on table public.player_stats to service_role;

drop policy if exists player_stats_public_read on public.player_stats;
create policy player_stats_public_read
on public.player_stats for select
to anon, authenticated
using (true);

comment on table public.player_stats is
  'Latest weekly projection consensus. One normalized player ID per row.
   Browser roles read only; the server upserts with on_conflict=id.
   All input sources must represent the same week and scoring rules.';

notify pgrst, 'reload schema';
commit;

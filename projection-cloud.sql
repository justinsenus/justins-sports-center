begin;

create table if not exists public.projection_feed_state (
  id text primary key check (id = 'latest'),
  season integer not null check (season between 2000 and 2200),
  week integer not null check (week between 1 and 18),
  scoring text not null check (scoring = 'PPR'),
  players_count integer not null check (players_count between 1 and 4000),
  sources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sources) = 'array'),
  github_run text not null,
  updated_at timestamptz not null default now()
);

alter table public.projection_feed_state enable row level security;
revoke all on public.projection_feed_state from public, anon, authenticated;
grant select on public.projection_feed_state to anon, authenticated;
grant select, insert, update on public.projection_feed_state to service_role;
create policy projection_feed_state_public_read on public.projection_feed_state
  for select to anon, authenticated using (true);

create or replace function public.apply_projection_batch(
  p_rows jsonb, p_season integer, p_week integer, p_sources jsonb, p_run text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  written integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 4000
     or jsonb_typeof(p_sources) is distinct from 'array'
     or p_run is null then
    raise exception 'Invalid projection batch';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(194718609, 731);
  insert into public.player_stats
    (id, display_name, calculated_average, injury_fallback, sources_counted)
  select id, display_name, calculated_average, injury_fallback, sources_counted
  from pg_catalog.jsonb_to_recordset(p_rows) as incoming(
    id text, display_name text, calculated_average double precision,
    injury_fallback text, sources_counted integer
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    calculated_average = excluded.calculated_average,
    injury_fallback = excluded.injury_fallback,
    sources_counted = excluded.sources_counted;
  get diagnostics written = row_count;
  insert into public.projection_feed_state
    (id, season, week, scoring, players_count, sources, github_run, updated_at)
  values ('latest', p_season, p_week, 'PPR', written, p_sources, p_run, now())
  on conflict (id) do update set
    season = excluded.season, week = excluded.week,
    scoring = excluded.scoring, players_count = excluded.players_count,
    sources = excluded.sources, github_run = excluded.github_run,
    updated_at = excluded.updated_at;
  return written;
end;
$$;

revoke all on function public.apply_projection_batch(jsonb,integer,integer,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.apply_projection_batch(jsonb,integer,integer,jsonb,text)
  to service_role;

notify pgrst, 'reload schema';
commit;

-- Dedicated ephemeral rooms. Browser roles have no table or RPC access.
create table if not exists public.fcc_remote_rooms (
  id uuid primary key default gen_random_uuid(),
  pair_code text not null unique,
  control_token text not null,
  topic text not null unique,
  state jsonb not null default '{"league":"sleeper","view":"overview","playerId":null,"matchupId":null,"gameId":null,"playerFilter":"all","refresh":0}'::jsonb,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
alter table public.fcc_remote_rooms enable row level security;
revoke all on public.fcc_remote_rooms from public, anon, authenticated;
grant all on public.fcc_remote_rooms to service_role;

create table if not exists public.fcc_remote_limits (
  key text primary key,
  bucket bigint not null,
  hits integer not null default 1
);
alter table public.fcc_remote_limits enable row level security;
revoke all on public.fcc_remote_limits from public, anon, authenticated;
grant all on public.fcc_remote_limits to service_role;

create or replace function public.fcc_remote_limit(p_key text, p_bucket bigint, p_limit integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  insert into public.fcc_remote_limits as l (key, bucket) values (p_key, p_bucket)
  on conflict (key) do update set bucket = excluded.bucket,
    hits = case when l.bucket = excluded.bucket then l.hits + 1 else 1 end
  returning hits into n;
  return n <= p_limit;
end;
$$;
revoke all on function public.fcc_remote_limit(text,bigint,integer) from public, anon, authenticated;
grant execute on function public.fcc_remote_limit(text,bigint,integer) to service_role;

create or replace function public.fcc_remote_command(p_id uuid, p_token text, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare room public.fcc_remote_rooms%rowtype;
begin
  update public.fcc_remote_rooms set
    state = state || (p_patch - 'refresh') || case when p_patch ? 'refresh'
      then jsonb_build_object('refresh', coalesce((state->>'refresh')::bigint, 0) + 1) else '{}'::jsonb end,
    revision = revision + 1,
    expires_at = now() + interval '7 days'
  where id = p_id and control_token = p_token and expires_at > now()
  returning * into room;
  if room.id is null then raise exception 'Invalid or expired room'; end if;
  perform realtime.send(jsonb_build_object('state', room.state, 'revision', room.revision),
    'state', room.topic, false);
  return jsonb_build_object('state', room.state, 'revision', room.revision);
end;
$$;
revoke all on function public.fcc_remote_command(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.fcc_remote_command(uuid,text,jsonb) to service_role;

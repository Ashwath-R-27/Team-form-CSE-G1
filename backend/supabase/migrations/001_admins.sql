-- Migration 001: Idempotent schema migration (creates admins & topics tables and upgrades v1 tables in-place without dropping any table or losing data)
create extension if not exists "pgcrypto";

-- 1. Admins table
create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  role          text not null default 'admin' check (role in ('admin', 'super_admin')),
  created_at    timestamptz not null default now()
);

create unique index if not exists uq_admins_email_lower on admins (lower(btrim(email)));

-- 2. Students table
create table if not exists students (
  roll_no text primary key,
  name    text not null,
  gender  text not null check (gender in ('M', 'F'))
);

-- 3. Forms table (create if missing, or upgrade v1 -> v2 in-place without dropping data)
create table if not exists forms (
  id                 uuid primary key default gen_random_uuid(),
  slug               text unique not null,
  title              text not null,
  description        text,
  min_team_size      int not null default 1 check (min_team_size between 1 and 20),
  max_team_size      int not null default 5 check (max_team_size between 1 and 20),
  collect_topic      boolean not null default false,
  allow_topic_repeat boolean not null default true,
  is_open            boolean not null default true,
  created_by         uuid references admins(id) on delete set null,
  created_at         timestamptz not null default now(),
  check (min_team_size <= max_team_size)
);

alter table forms add column if not exists description text;
alter table forms add column if not exists min_team_size int;
alter table forms add column if not exists max_team_size int;
alter table forms add column if not exists collect_topic boolean not null default false;
alter table forms add column if not exists allow_topic_repeat boolean not null default true;
alter table forms add column if not exists is_open boolean not null default true;
alter table forms add column if not exists created_by uuid references admins(id) on delete set null;
alter table forms add column if not exists created_at timestamptz not null default now();

-- Backfill min_team_size and max_team_size from legacy team_size column if present
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'forms' and column_name = 'team_size'
  ) then
    execute 'update forms set min_team_size = coalesce(min_team_size, team_size, 1), max_team_size = coalesce(max_team_size, team_size, 5) where min_team_size is null or max_team_size is null';
    execute 'alter table forms alter column team_size drop not null';
  else
    update forms set min_team_size = coalesce(min_team_size, 1), max_team_size = coalesce(max_team_size, 5)
    where min_team_size is null or max_team_size is null;
  end if;
end $$;

alter table forms alter column min_team_size set not null;
alter table forms alter column max_team_size set not null;

-- 4. Topics table
create table if not exists topics (
  id      uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  name    text not null
);
create unique index if not exists uq_topics_form_name on topics(form_id, lower(btrim(name)));

-- 5. Teams table (create if missing, add topic column if upgrading from v1)
create table if not exists teams (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references forms(id) on delete cascade,
  team_no      int  not null,
  topic        text,
  submitted_at timestamptz not null default now(),
  unique (form_id, team_no)
);
alter table teams add column if not exists topic text;
alter table teams add column if not exists submitted_at timestamptz not null default now();

-- 6. Team members table (create if missing, add position column if upgrading from v1)
create table if not exists team_members (
  id       uuid primary key default gen_random_uuid(),
  team_id  uuid not null references teams(id) on delete cascade,
  form_id  uuid not null references forms(id) on delete cascade,
  roll_no  text not null references students(roll_no),
  position int  not null default 1,
  unique (form_id, roll_no)
);
alter table team_members add column if not exists position int not null default 1;
create index if not exists idx_team_members_form on team_members(form_id);

-- 7. Atomic, race-safe team submission RPC
create or replace function submit_team(p_form_id uuid, p_rolls text[], p_topic text default null)
returns table(team_no int, team_id uuid) language plpgsql as $$
declare
  f forms%rowtype;
  v_sorted text[];
  v_topic text;
  v_no int;
  v_id uuid;
  i int;
  v_has_options boolean;
  v_taken int;
begin
  select * into f from forms where id = p_form_id for update;
  if not found then raise exception 'FORM_NOT_FOUND'; end if;
  if not f.is_open then raise exception 'FORM_CLOSED'; end if;

  if (select count(distinct r) from unnest(p_rolls) r) <> coalesce(array_length(p_rolls,1),0)
    then raise exception 'DUPLICATE_IN_TEAM'; end if;
  if array_length(p_rolls,1) < f.min_team_size or array_length(p_rolls,1) > f.max_team_size
    then raise exception 'WRONG_TEAM_SIZE'; end if;

  -- natural sort: shorter roll first, then alphabetical
  select array_agg(r order by length(r), r) into v_sorted from unnest(p_rolls) r;

  if f.collect_topic then
    v_topic := nullif(regexp_replace(btrim(coalesce(p_topic,'')), '\s+', ' ', 'g'), '');
    if v_topic is null then raise exception 'TOPIC_REQUIRED'; end if;
    select exists(select 1 from topics where form_id = p_form_id) into v_has_options;
    if v_has_options then
      select name into v_topic from topics
        where form_id = p_form_id and lower(btrim(name)) = lower(v_topic);
      if v_topic is null then raise exception 'TOPIC_INVALID'; end if;
    end if;
    if not f.allow_topic_repeat then
      select t.team_no into v_taken from teams t
        where t.form_id = p_form_id and lower(btrim(t.topic)) = lower(v_topic) limit 1;
      if v_taken is not null then raise exception 'TOPIC_TAKEN:%', v_taken; end if;
    end if;
  else
    v_topic := null;
  end if;

  select coalesce(max(t.team_no),0)+1 into v_no from teams t where t.form_id = p_form_id;
  insert into teams(form_id, team_no, topic) values (p_form_id, v_no, v_topic) returning id into v_id;

  for i in 1..array_length(v_sorted,1) loop
    insert into team_members(team_id, form_id, roll_no, position) values (v_id, p_form_id, v_sorted[i], i);
  end loop;

  return query select v_no, v_id;
end $$;

alter table admins       enable row level security;
alter table students     enable row level security;
alter table forms        enable row level security;
alter table topics       enable row level security;
alter table teams        enable row level security;
alter table team_members enable row level security;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';


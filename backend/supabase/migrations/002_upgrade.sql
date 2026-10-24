-- Migration 002: Idempotent schema upgrade & alignment with backend code
-- Safe to run multiple times on any existing v1 or v2 Supabase database without losing data.

create extension if not exists "pgcrypto";

-- 1. Admins table
create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  role          text not null default 'admin' check (role in ('admin', 'super_admin')),
  created_at    timestamptz not null default now()
);

alter table admins add column if not exists email text;
alter table admins add column if not exists password_hash text;
alter table admins add column if not exists role text not null default 'admin';
alter table admins add column if not exists created_at timestamptz not null default now();

create unique index if not exists uq_admins_email_lower on admins (lower(btrim(email)));

-- 2. Students table
create table if not exists students (
  roll_no text primary key,
  name    text not null,
  gender  text not null check (gender in ('M', 'F'))
);

alter table students add column if not exists name text;
alter table students add column if not exists gender text;

-- 3. Forms table
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

alter table forms add column if not exists slug text;
alter table forms add column if not exists title text;
alter table forms add column if not exists description text;
alter table forms add column if not exists min_team_size int default 1;
alter table forms add column if not exists max_team_size int default 5;
alter table forms add column if not exists collect_topic boolean not null default false;
alter table forms add column if not exists allow_topic_repeat boolean not null default true;
alter table forms add column if not exists is_open boolean not null default true;
alter table forms add column if not exists created_by uuid references admins(id) on delete set null;
alter table forms add column if not exists created_at timestamptz not null default now();

-- Backfill min_team_size and max_team_size from legacy team_size column if present, and relax legacy NOT NULL
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'forms' and column_name = 'team_size'
  ) then
    execute 'update forms set min_team_size = coalesce(min_team_size, team_size, 1), max_team_size = coalesce(max_team_size, team_size, 5) where min_team_size is null or max_team_size is null';
    execute 'alter table forms alter column team_size drop not null';
  else
    update forms
       set min_team_size = coalesce(min_team_size, 1),
           max_team_size = coalesce(max_team_size, 5)
     where min_team_size is null or max_team_size is null;
  end if;
end $$;

alter table forms alter column min_team_size set default 1;
alter table forms alter column max_team_size set default 5;
alter table forms alter column min_team_size set not null;
alter table forms alter column max_team_size set not null;
alter table forms alter column collect_topic set default false;
alter table forms alter column collect_topic set not null;
alter table forms alter column allow_topic_repeat set default true;
alter table forms alter column allow_topic_repeat set not null;
alter table forms alter column is_open set default true;
alter table forms alter column is_open set not null;
alter table forms alter column created_at set default now();
alter table forms alter column created_at set not null;

create unique index if not exists uq_forms_slug on forms(slug);

-- Ensure check constraints exist on forms
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.forms'::regclass and conname = 'forms_min_team_size_range_chk'
      and not exists (
        select 1 from pg_constraint c2
        where c2.conrelid = 'public.forms'::regclass
          and pg_get_constraintdef(c2.oid) ilike '%min_team_size%'
      )
  ) then
    begin
      alter table forms add constraint forms_min_team_size_range_chk check (min_team_size between 1 and 20);
    exception when duplicate_object then null;
    end;
  end if;

  if not exists (
    select 1 from pg_constraint c2
    where c2.conrelid = 'public.forms'::regclass
      and pg_get_constraintdef(c2.oid) ilike '%max_team_size%'
  ) then
    begin
      alter table forms add constraint forms_max_team_size_range_chk check (max_team_size between 1 and 20);
    exception when duplicate_object then null;
    end;
  end if;

  if not exists (
    select 1 from pg_constraint c2
    where c2.conrelid = 'public.forms'::regclass
      and pg_get_constraintdef(c2.oid) ilike '%min_team_size <= max_team_size%'
  ) then
    begin
      alter table forms add constraint forms_min_le_max_team_size_chk check (min_team_size <= max_team_size);
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- 4. Topics table
create table if not exists topics (
  id      uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  name    text not null
);

alter table topics add column if not exists form_id uuid references forms(id) on delete cascade;
alter table topics add column if not exists name text;

create unique index if not exists uq_topics_form_name on topics(form_id, lower(btrim(name)));

-- 5. Teams table
create table if not exists teams (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references forms(id) on delete cascade,
  team_no      int  not null,
  topic        text,
  submitted_at timestamptz not null default now(),
  unique (form_id, team_no)
);

alter table teams add column if not exists form_id uuid references forms(id) on delete cascade;
alter table teams add column if not exists team_no int;
alter table teams add column if not exists topic text;
alter table teams add column if not exists submitted_at timestamptz not null default now();

create unique index if not exists uq_teams_form_team_no on teams(form_id, team_no);

-- 6. Team members table
create table if not exists team_members (
  id       uuid primary key default gen_random_uuid(),
  team_id  uuid not null references teams(id) on delete cascade,
  form_id  uuid not null references forms(id) on delete cascade,
  roll_no  text not null references students(roll_no),
  position int  not null default 1,
  unique (form_id, roll_no)
);

alter table team_members add column if not exists team_id uuid references teams(id) on delete cascade;
alter table team_members add column if not exists form_id uuid references forms(id) on delete cascade;
alter table team_members add column if not exists roll_no text references students(roll_no);
alter table team_members add column if not exists position int not null default 1;

create unique index if not exists uq_team_members_form_roll on team_members(form_id, roll_no);
create index if not exists idx_team_members_form on team_members(form_id);

-- Ensure foreign keys required for PostgREST embedded joins (team_members -> teams, team_members -> students)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'team_members'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name = 'team_id'
  ) then
    alter table team_members
      add constraint team_members_team_id_fkey
      foreign key (team_id) references teams(id) on delete cascade;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'team_members'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name = 'roll_no'
  ) then
    alter table team_members
      add constraint team_members_roll_no_fkey
      foreign key (roll_no) references students(roll_no);
  end if;
end $$;

-- 7. Atomic, race-safe team submission RPC
-- Drop legacy 2-argument signature if present so PostgREST never encounters overload ambiguity
drop function if exists submit_team(uuid, text[]);

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
  v_len int;
begin
  select * into f from forms where id = p_form_id for update;
  if not found then raise exception 'FORM_NOT_FOUND'; end if;
  if not f.is_open then raise exception 'FORM_CLOSED'; end if;

  v_len := coalesce(array_length(p_rolls, 1), 0);
  if (select count(distinct r) from unnest(p_rolls) r) <> v_len
    then raise exception 'DUPLICATE_IN_TEAM'; end if;
  if v_len < f.min_team_size or v_len > f.max_team_size
    then raise exception 'WRONG_TEAM_SIZE'; end if;

  -- natural sort: shorter roll first, then alphabetical
  select array_agg(r order by length(r), r) into v_sorted from unnest(p_rolls) r;

  if f.collect_topic then
    v_topic := nullif(regexp_replace(btrim(coalesce(p_topic, '')), '\s+', ' ', 'g'), '');
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

  select coalesce(max(t.team_no), 0) + 1 into v_no from teams t where t.form_id = p_form_id;
  insert into teams(form_id, team_no, topic) values (p_form_id, v_no, v_topic) returning id into v_id;

  for i in 1..v_len loop
    insert into team_members(team_id, form_id, roll_no, position) values (v_id, p_form_id, v_sorted[i], i);
  end loop;

  return query select v_no, v_id;
end $$;

-- 8. Enable Row Level Security on all tables
alter table admins       enable row level security;
alter table students     enable row level security;
alter table forms        enable row level security;
alter table topics       enable row level security;
alter table teams        enable row level security;
alter table team_members enable row level security;

-- 9. Reload PostgREST schema cache
notify pgrst, 'reload schema';


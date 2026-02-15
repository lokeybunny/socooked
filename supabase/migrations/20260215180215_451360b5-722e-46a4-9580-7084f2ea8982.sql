
-- Enable extensions
create extension if not exists "uuid-ossp";

-- -------------------------
-- PROFILES
-- -------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -------------------------
-- USER ROLES (separate table per security requirements)
-- -------------------------
create type public.app_role as enum ('admin', 'manager', 'staff');

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null default 'staff',
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

-- Auto-assign staff role on signup
create or replace function public.assign_default_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role) values (new.id, 'staff');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_role on auth.users;
create trigger on_auth_user_created_role
  after insert on auth.users
  for each row execute procedure public.assign_default_role();

-- -------------------------
-- CRM TABLES
-- -------------------------
create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  email text,
  phone text,
  company text,
  status text not null default 'lead'
    check (status in ('lead','prospect','active','inactive','churned')),
  source text,
  assigned_to uuid references public.profiles(id) on delete set null,
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_assigned_to_idx on public.customers(assigned_to);
create index if not exists customers_status_idx on public.customers(status);

create table if not exists public.interactions (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  type text not null check (type in ('call','email','text','meeting','dm','note')),
  direction text not null default 'outbound' check (direction in ('inbound','outbound')),
  subject text,
  notes text,
  outcome text,
  next_action text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists interactions_customer_id_idx on public.interactions(customer_id);
create index if not exists interactions_occurred_at_idx on public.interactions(occurred_at);

create table if not exists public.deals (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text not null,
  pipeline text not null default 'default',
  stage text not null default 'new'
    check (stage in ('new','qualified','proposal','negotiation','won','lost')),
  deal_value numeric(12,2) not null default 0,
  probability int not null default 10 check (probability between 0 and 100),
  expected_close_date date,
  status text not null default 'open' check (status in ('open','won','lost')),
  owner_id uuid references public.profiles(id) on delete set null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deals_customer_id_idx on public.deals(customer_id);
create index if not exists deals_stage_idx on public.deals(stage);

-- -------------------------
-- PROJECT / TASK TABLES
-- -------------------------
create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'planned'
    check (status in ('planned','active','blocked','completed','archived')),
  priority text not null default 'medium'
    check (priority in ('low','medium','high','urgent')),
  start_date date,
  due_date date,
  owner_id uuid references public.profiles(id) on delete set null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_customer_id_idx on public.projects(customer_id);
create index if not exists projects_status_idx on public.projects(status);

create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo','doing','blocked','done')),
  priority text not null default 'medium'
    check (priority in ('low','medium','high','urgent')),
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  checklist jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_project_id_idx on public.tasks(project_id);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_due_date_idx on public.tasks(due_date);

-- -------------------------
-- CMS TABLES
-- -------------------------
create table if not exists public.content_assets (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  type text not null check (type in ('article','image','video','landing_page','doc','post')),
  status text not null default 'draft'
    check (status in ('draft','scheduled','published','archived')),
  owner_id uuid references public.profiles(id) on delete set null,
  url text,
  body text,
  folder text,
  tags text[] not null default '{}',
  scheduled_for timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_assets_status_idx on public.content_assets(status);
create index if not exists content_assets_type_idx on public.content_assets(type);

-- -------------------------
-- AUTOMATIONS
-- -------------------------
create table if not exists public.automations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  is_enabled boolean not null default true,
  trigger_event text not null,
  trigger_table text not null,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Activity log
create table if not exists public.activity_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_entity_idx on public.activity_log(entity_type, entity_id);
create index if not exists activity_log_created_at_idx on public.activity_log(created_at);

-- -------------------------
-- UPDATED_AT TRIGGERS
-- -------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger customers_set_updated_at before update on public.customers for each row execute procedure public.set_updated_at();
create trigger deals_set_updated_at before update on public.deals for each row execute procedure public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute procedure public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks for each row execute procedure public.set_updated_at();
create trigger content_assets_set_updated_at before update on public.content_assets for each row execute procedure public.set_updated_at();

-- -------------------------
-- RLS POLICIES
-- -------------------------
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.interactions enable row level security;
alter table public.deals enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.content_assets enable row level security;
alter table public.automations enable row level security;
alter table public.activity_log enable row level security;

-- Profiles
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());

-- User roles: users can read their own roles
create policy "user_roles_select_own" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- Main tables: authenticated users can CRUD (tighten by role later)
create policy "customers_rw" on public.customers for all to authenticated using (true) with check (true);
create policy "interactions_rw" on public.interactions for all to authenticated using (true) with check (true);
create policy "deals_rw" on public.deals for all to authenticated using (true) with check (true);
create policy "projects_rw" on public.projects for all to authenticated using (true) with check (true);
create policy "tasks_rw" on public.tasks for all to authenticated using (true) with check (true);
create policy "content_assets_rw" on public.content_assets for all to authenticated using (true) with check (true);
create policy "automations_rw" on public.automations for all to authenticated using (true) with check (true);
create policy "activity_log_rw" on public.activity_log for all to authenticated using (true) with check (true);

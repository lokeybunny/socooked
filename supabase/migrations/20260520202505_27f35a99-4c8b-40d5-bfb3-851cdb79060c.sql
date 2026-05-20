
create table if not exists public.studio_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  description text,
  cover_url text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.studio_templates enable row level security;

create policy "Users select own templates" on public.studio_templates for select using (auth.uid() = user_id);
create policy "Users insert own templates" on public.studio_templates for insert with check (auth.uid() = user_id);
create policy "Users update own templates" on public.studio_templates for update using (auth.uid() = user_id);
create policy "Users delete own templates" on public.studio_templates for delete using (auth.uid() = user_id);

create index if not exists studio_templates_user_created_idx on public.studio_templates (user_id, created_at desc);

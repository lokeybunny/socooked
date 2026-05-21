create table if not exists public.studio_storyboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid references public.studio_projects(id) on delete cascade,
  subproject_id uuid references public.studio_subprojects(id) on delete cascade,
  name text,
  image_url text not null,
  storage_path text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_studio_storyboards_user on public.studio_storyboards(user_id);
create index if not exists idx_studio_storyboards_project on public.studio_storyboards(project_id);
create index if not exists idx_studio_storyboards_subproject on public.studio_storyboards(subproject_id);

alter table public.studio_storyboards enable row level security;

create policy "Users view own storyboards" on public.studio_storyboards
  for select to authenticated using (auth.uid() = user_id);
create policy "Users insert own storyboards" on public.studio_storyboards
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own storyboards" on public.studio_storyboards
  for update to authenticated using (auth.uid() = user_id);
create policy "Users delete own storyboards" on public.studio_storyboards
  for delete to authenticated using (auth.uid() = user_id);

create trigger set_studio_storyboards_updated_at
  before update on public.studio_storyboards
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('studio-storyboards', 'studio-storyboards', true)
on conflict (id) do nothing;

create policy "Public read studio storyboards"
  on storage.objects for select
  using (bucket_id = 'studio-storyboards');

create policy "Users upload own studio storyboards"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'studio-storyboards' and (auth.uid())::text = (storage.foldername(name))[1]);

create policy "Users delete own studio storyboards"
  on storage.objects for delete to authenticated
  using (bucket_id = 'studio-storyboards' and (auth.uid())::text = (storage.foldername(name))[1]);
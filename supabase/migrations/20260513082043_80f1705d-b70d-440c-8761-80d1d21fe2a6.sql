-- Warm Welcome Campaign system

create table if not exists public.warm_welcome_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Warm Welcome',
  status text not null default 'idle' check (status in ('idle','running','cooldown','stopped','done','error')),
  cooldown_until timestamptz,
  imessage_new_sent_today integer not null default 0,
  sms_sent_today integer not null default 0,
  counters_day date not null default (now() at time zone 'utc')::date,
  total_targets integer not null default 0,
  total_sent integer not null default 0,
  total_failed integer not null default 0,
  total_skipped integer not null default 0,
  filter_snapshot jsonb,
  last_processed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warm_welcome_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.warm_welcome_campaigns(id) on delete cascade,
  hot_reply_id uuid,
  phone_last10 text not null,
  phone_e164 text not null,
  name text,
  reply_text text,
  reply_at timestamptz,
  device_type text,
  channel text,
  status text not null default 'pending' check (status in ('pending','auditing','audited','skipped','sending','sent','failed')),
  message_text text,
  sent_at timestamptz,
  error text,
  is_new_imessage_contact boolean,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warm_welcome_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.warm_welcome_campaigns(id) on delete cascade,
  target_id uuid references public.warm_welcome_targets(id) on delete set null,
  level text not null default 'info' check (level in ('info','warn','error','success')),
  message text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ww_targets_campaign on public.warm_welcome_targets(campaign_id);
create index if not exists idx_ww_targets_status on public.warm_welcome_targets(status, next_attempt_at);
create index if not exists idx_ww_targets_phone on public.warm_welcome_targets(phone_last10);
create index if not exists idx_ww_logs_campaign on public.warm_welcome_logs(campaign_id, created_at desc);
create index if not exists idx_ww_campaigns_status on public.warm_welcome_campaigns(status);

alter table public.warm_welcome_campaigns enable row level security;
alter table public.warm_welcome_targets enable row level security;
alter table public.warm_welcome_logs enable row level security;

drop policy if exists "ww_campaigns_auth_all" on public.warm_welcome_campaigns;
create policy "ww_campaigns_auth_all" on public.warm_welcome_campaigns
  for all to authenticated using (true) with check (true);

drop policy if exists "ww_targets_auth_all" on public.warm_welcome_targets;
create policy "ww_targets_auth_all" on public.warm_welcome_targets
  for all to authenticated using (true) with check (true);

drop policy if exists "ww_logs_auth_all" on public.warm_welcome_logs;
create policy "ww_logs_auth_all" on public.warm_welcome_logs
  for all to authenticated using (true) with check (true);

drop trigger if exists trg_ww_campaigns_updated_at on public.warm_welcome_campaigns;
create trigger trg_ww_campaigns_updated_at before update on public.warm_welcome_campaigns
  for each row execute function public.set_updated_at();

drop trigger if exists trg_ww_targets_updated_at on public.warm_welcome_targets;
create trigger trg_ww_targets_updated_at before update on public.warm_welcome_targets
  for each row execute function public.set_updated_at();

-- Realtime
alter publication supabase_realtime add table public.warm_welcome_campaigns;
alter publication supabase_realtime add table public.warm_welcome_targets;
alter publication supabase_realtime add table public.warm_welcome_logs;
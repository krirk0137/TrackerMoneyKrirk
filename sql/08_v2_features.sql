-- 08_v2_features.sql — V2: แท็ก + หมวดย่อย + งบประมาณแบบงวด
-- รันใน Supabase SQL Editor หลัง 07 · idempotent · additive ล้วน (ของเดิมทำงานปกติทุกอย่าง)

-- ----------------------------------------------------------------------------
-- 1) หมวดย่อย (parent_id) + archive หมวด + updated_at
-- ----------------------------------------------------------------------------
alter table public.categories add column if not exists parent_id   uuid references public.categories(id) on delete cascade;
alter table public.categories add column if not exists is_archived boolean not null default false;
alter table public.categories add column if not exists updated_at  timestamptz;
create index if not exists categories_parent_idx on public.categories (parent_id);

drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) แท็ก + ตารางเชื่อม transaction ↔ tag
-- ----------------------------------------------------------------------------
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  color      text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.tags enable row level security;
drop policy if exists "tags_own" on public.tags;
create policy "tags_own" on public.tags for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.tags to authenticated;

create table if not exists public.transaction_tags (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tag_id         uuid not null references public.tags(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade, -- ซ้ำไว้เพื่อ RLS ง่าย
  primary key (transaction_id, tag_id)
);
alter table public.transaction_tags enable row level security;
drop policy if exists "transaction_tags_own" on public.transaction_tags;
create policy "transaction_tags_own" on public.transaction_tags for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.transaction_tags to authenticated;

-- ----------------------------------------------------------------------------
-- 3) งบประมาณแบบงวด (สัปดาห์/เดือน/ปี) — เสริมจาก categories.monthly_budget เดิม
--    category_id = null → งบรวมทุกหมวด · rollover → ยกงบเหลือไปงวดถัดไป
-- ----------------------------------------------------------------------------
create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  period_type text not null default 'month' check (period_type in ('week','month','year')),
  period_start date not null,
  rollover    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, category_id, period_type, period_start)
);
alter table public.budgets enable row level security;
drop policy if exists "budgets_own" on public.budgets;
create policy "budgets_own" on public.budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.budgets to authenticated;

drop trigger if exists trg_budgets_updated on public.budgets;
create trigger trg_budgets_updated before update on public.budgets
  for each row execute function public.set_updated_at();

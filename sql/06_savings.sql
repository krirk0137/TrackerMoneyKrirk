-- 06_savings.sql — V1.5: เป้าหมายออมเงิน (savings goals)
-- รันใน Supabase SQL Editor หลัง 01–05 (idempotent — รันซ้ำได้ปลอดภัย)
-- ตารางใหม่ต้องครบ 3 อย่างตามกฎโปรเจกต์: enable RLS + policy own + grant authenticated

create table if not exists public.savings_goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name           text not null,
  target_amount  numeric(12,2) not null check (target_amount > 0),
  current_amount numeric(12,2) not null default 0 check (current_amount >= 0),
  target_date    date,
  created_at     timestamptz not null default now()
);

create index if not exists savings_goals_user_idx on public.savings_goals (user_id, created_at desc);

-- RLS: เห็น/แก้ได้เฉพาะของตัวเอง
alter table public.savings_goals enable row level security;
drop policy if exists "savings_select_own" on public.savings_goals;
drop policy if exists "savings_insert_own" on public.savings_goals;
drop policy if exists "savings_update_own" on public.savings_goals;
drop policy if exists "savings_delete_own" on public.savings_goals;
create policy "savings_select_own" on public.savings_goals for select using (auth.uid() = user_id);
create policy "savings_insert_own" on public.savings_goals for insert with check (auth.uid() = user_id);
create policy "savings_update_own" on public.savings_goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "savings_delete_own" on public.savings_goals for delete using (auth.uid() = user_id);

-- grant ให้ authenticated (โปรเจกต์ Supabase ใหม่ไม่ auto-grant → ไม่ grant = error 42501)
grant select, insert, update, delete on public.savings_goals to authenticated;

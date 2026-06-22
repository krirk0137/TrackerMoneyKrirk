-- 05_phase6.sql — Phase 6: งบประมาณรายหมวด + รายการประจำ
-- รันใน Supabase SQL Editor หลัง 01–04 (รันซ้ำได้ ปลอดภัย)

-- 1) งบต่อเดือนของหมวด (ตั้งเฉพาะหมวดรายจ่ายที่อยากคุมงบ)
alter table public.categories
  add column if not exists monthly_budget numeric(12,2)
  check (monthly_budget is null or monthly_budget >= 0);

-- 2) ตารางรายการประจำ (templates)
create table if not exists public.recurring (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type           text not null check (type in ('income','expense')),
  amount         numeric(12,2) not null check (amount > 0),
  category_id    uuid references public.categories(id) on delete set null,
  day_of_month   int not null check (day_of_month between 1 and 31),
  note           text,
  payment_method text,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- 3) ผูก transaction ที่ถูกสร้างจาก recurring (กันสร้างซ้ำในเดือนเดียวกัน)
alter table public.transactions
  add column if not exists recurring_id uuid references public.recurring(id) on delete set null;

-- 4) RLS ของ recurring
alter table public.recurring enable row level security;
drop policy if exists "recurring_select_own" on public.recurring;
drop policy if exists "recurring_insert_own" on public.recurring;
drop policy if exists "recurring_update_own" on public.recurring;
drop policy if exists "recurring_delete_own" on public.recurring;
create policy "recurring_select_own" on public.recurring for select using (auth.uid() = user_id);
create policy "recurring_insert_own" on public.recurring for insert with check (auth.uid() = user_id);
create policy "recurring_update_own" on public.recurring for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurring_delete_own" on public.recurring for delete using (auth.uid() = user_id);

-- 5) grant ให้ authenticated (ตารางใหม่ต้อง grant เองเหมือน 04)
grant select, insert, update, delete on public.recurring to authenticated;

-- 07_v2_accounts.sql — V2: หลายบัญชี + โอนระหว่างบัญชี + multi-currency (รากฐาน)
-- ============================================================================
-- ⚠️  BACKUP ก่อนรัน! ไฟล์นี้แก้ตาราง transactions ที่ live อยู่จริง
--     (รัน backup workflow หรือโหลด .sql เก็บไว้ก่อน — กฎเหล็ก V2 ข้อ 1)
-- รันใน Supabase SQL Editor หลัง 01–06 · idempotent (รันซ้ำได้ปลอดภัย)
--
-- หมายเหตุการออกแบบ (อ่านก่อน):
--   • account_id ตั้งเป็น "ยอมว่างได้" ชั่วคราว — รายการเก่าถูก backfill เข้าบัญชี "เงินสด" แล้ว
--     แต่ยังไม่บังคับ NOT NULL เพื่อให้ frontend main เดิม (ที่ยังไม่ส่ง account_id) ไม่พังตอนรัน SQL นี้
--     → จะบังคับ NOT NULL ในไฟล์ migration ถัดไป "หลัง" deploy frontend v2 แล้ว
--   • เก็บ txn_date เป็น date ตามเดิม (กฎเหล็กข้อ 1 — client ส่งวันที่ Asia/Bangkok) ไม่เปลี่ยนเป็น timestamptz
--   • multi-currency ใส่ที่ schema (default THB) — UI ใช้ THB เป็นหลัก ค่อยเปิดสกุลอื่นทีหลัง
-- ============================================================================

-- 0) helper อัปเดต updated_at อัตโนมัติ (ใช้ร่วมทุกตารางใหม่ของ V2 แทนการ set ใน JS)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1) ตารางบัญชี / กระเป๋าเงิน
-- ----------------------------------------------------------------------------
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  type            text not null default 'cash'
                    check (type in ('cash','bank','credit_card','e_wallet','savings','investment','other')),
  currency        char(3) not null default 'THB',
  initial_balance numeric(14,2) not null default 0,
  icon            text,
  color           text,
  is_archived     boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists accounts_user_idx on public.accounts (user_id, sort_order);

-- RLS + grant (กฎเหล็กข้อ 2: ตารางใหม่ต้องครบ enable RLS + policy own + grant authenticated)
alter table public.accounts enable row level security;
drop policy if exists "accounts_own" on public.accounts;
create policy "accounts_own" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.accounts to authenticated;

drop trigger if exists trg_accounts_updated on public.accounts;
create trigger trg_accounts_updated before update on public.accounts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) data migration: สร้างบัญชี "เงินสด" ให้ user เดิมทุกคนที่ยังไม่มีบัญชี
-- ----------------------------------------------------------------------------
insert into public.accounts (user_id, name, type, sort_order)
select u.user_id, 'เงินสด', 'cash', 0
from (
  select user_id from public.transactions
  union
  select user_id from public.categories
) u
where not exists (select 1 from public.accounts a where a.user_id = u.user_id);

-- ----------------------------------------------------------------------------
-- 3) ขยาย transactions รองรับบัญชี + โอน + multi-currency (additive ล้วน)
-- ----------------------------------------------------------------------------
alter table public.transactions add column if not exists account_id    uuid references public.accounts(id) on delete restrict;
alter table public.transactions add column if not exists to_account_id uuid references public.accounts(id) on delete restrict;
alter table public.transactions add column if not exists to_amount     numeric(14,2) check (to_amount is null or to_amount > 0);
alter table public.transactions add column if not exists currency      char(3) not null default 'THB';
alter table public.transactions add column if not exists exchange_rate numeric(18,8) not null default 1 check (exchange_rate > 0);
alter table public.transactions add column if not exists amount_base   numeric(16,2) generated always as (round(amount * exchange_rate, 2)) stored;
alter table public.transactions add column if not exists receipt_url   text;

-- 4) backfill: รายการเก่าทั้งหมด → บัญชี "เงินสด" ของ user นั้น
update public.transactions t
set account_id = a.id
from public.accounts a
where a.user_id = t.user_id and a.name = 'เงินสด' and a.type = 'cash' and t.account_id is null;

-- 5) ปลดล็อกประเภท 'transfer' (income/expense/transfer)
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('income','expense','transfer'));

-- 6) ความถูกต้องของการโอน:
--    transfer → ต้องมีบัญชีปลายทางคนละใบกับต้นทาง + ไม่มีหมวด
--    income/expense → ห้ามมี to_account_id / to_amount
alter table public.transactions drop constraint if exists chk_transfer;
alter table public.transactions add constraint chk_transfer check (
  (type =  'transfer' and to_account_id is not null and to_account_id <> account_id and category_id is null)
  or
  (type <> 'transfer' and to_account_id is null and to_amount is null)
);

create index if not exists transactions_account_idx    on public.transactions (account_id);
create index if not exists transactions_to_account_idx on public.transactions (to_account_id);

-- ----------------------------------------------------------------------------
-- 7) view ยอดคงเหลือแต่ละบัญชี (real-time)
--    security_invoker = on → เคารพ RLS ของผู้เรียก (เห็นเฉพาะบัญชีตัวเอง)
--    สูตร: ตั้งต้น + รับ − จ่าย − โอนออก + โอนเข้า
-- ----------------------------------------------------------------------------
create or replace view public.account_balances
with (security_invoker = on) as
select
  a.id as account_id, a.user_id, a.name, a.currency, a.type, a.is_archived, a.initial_balance, a.sort_order,
  a.initial_balance
    + coalesce(sum(case when t.type = 'income'   and t.account_id    = a.id then t.amount else 0 end), 0)
    - coalesce(sum(case when t.type = 'expense'  and t.account_id    = a.id then t.amount else 0 end), 0)
    - coalesce(sum(case when t.type = 'transfer' and t.account_id    = a.id then t.amount else 0 end), 0)
    + coalesce(sum(case when t.type = 'transfer' and t.to_account_id = a.id then coalesce(t.to_amount, t.amount) else 0 end), 0)
    as current_balance
from public.accounts a
left join public.transactions t on t.account_id = a.id or t.to_account_id = a.id
group by a.id;

grant select on public.account_balances to authenticated;

-- ----------------------------------------------------------------------------
-- 8) user ใหม่: seed บัญชี "เงินสด" ด้วย (เดิม seed แค่หมวดหมู่)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categories (user_id, name, type, sort_order) values
    (new.id, 'เงินเดือน',     'income',  1),
    (new.id, 'รายได้เสริม',    'income',  2),
    (new.id, 'อาหาร',         'expense', 1),
    (new.id, 'เดินทาง',        'expense', 2),
    (new.id, 'ช้อปปิ้ง',       'expense', 3),
    (new.id, 'บิล/ค่าบริการ',  'expense', 4),
    (new.id, 'อื่นๆ',          'expense', 99);
  insert into public.accounts (user_id, name, type, sort_order) values
    (new.id, 'เงินสด', 'cash', 0);
  return new;
end;
$$;

-- 01_schema.sql — ตาราง categories + transactions
-- รันใน Supabase SQL Editor เป็นไฟล์แรก

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  type        text not null check (type in ('income','expense')),
  color       text,
  icon        text,
  sort_order  int  default 0,
  created_at  timestamptz not null default now()
);

create table public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id    uuid references public.categories(id) on delete set null,
  type           text not null check (type in ('income','expense')),
  amount         numeric(12,2) not null check (amount > 0),
  -- ไม่ใส่ default current_date โดยตั้งใจ:
  -- DB ของ Supabase เป็น UTC → current_date ช่วงเที่ยงคืน–ตี7 (เวลาไทย) จะยังเป็น "เมื่อวาน"
  -- ฝั่ง client ต้องส่ง txn_date ที่คำนวณตาม Asia/Bangkok มาเสมอ (ดู app/ui.js: todayBangkok)
  txn_date       date not null,
  note           text,
  payment_method text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);

create index transactions_user_date_idx on public.transactions (user_id, txn_date desc);
create index transactions_category_idx  on public.transactions (category_id);

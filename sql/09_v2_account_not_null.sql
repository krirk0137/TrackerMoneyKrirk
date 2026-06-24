-- 09_v2_account_not_null.sql — V2 ปิดท้าย: บังคับ transactions.account_id ห้ามว่าง
-- ============================================================================
-- ⚠️  รัน "หลัง" deploy frontend v2 ขึ้น main แล้วเท่านั้น!
--     ระหว่างที่ V1.5 ยัง live อยู่ จะมีรายการใหม่ที่ไม่มี account_id เกิดได้
--     ไฟล์นี้ backfill ให้หมดก่อน แล้วค่อยล็อก NOT NULL
-- รันหลัง 07–08 · idempotent (รันซ้ำได้ปลอดภัย)
-- ============================================================================

-- 1) เติมบัญชี "เงินสด" ให้แถวที่ account_id ยังว่าง (รายการที่ลงช่วงเปลี่ยนผ่าน)
update public.transactions t
set account_id = a.id
from public.accounts a
where a.user_id = t.user_id and a.name = 'เงินสด' and a.type = 'cash' and t.account_id is null;

-- 1b) กันเหนียว: user ไหนไม่มีบัญชี "เงินสด" แล้ว → ใช้บัญชีแรกของ user นั้นแทน
update public.transactions t
set account_id = a.id
from (
  select distinct on (user_id) user_id, id
  from public.accounts
  order by user_id, sort_order, created_at
) a
where a.user_id = t.user_id and t.account_id is null;

-- 2) บังคับ NOT NULL — ถ้ายังเหลือ null อยู่ statement นี้จะ error (ตั้งใจ ให้รู้ตัว อย่าฝืนข้าม)
--    เช็คก่อนได้ด้วย:  select count(*) from public.transactions where account_id is null;  ต้องได้ 0
alter table public.transactions alter column account_id set not null;

-- 03_functions.sql — auto-seed หมวดหมู่ตอนสร้าง user + ฟังก์ชัน keep-alive
-- รันหลัง 02_rls.sql

-- seed หมวดหมู่เริ่มต้นให้ user ใหม่อัตโนมัติ
-- security definer เพื่อ insert ข้าม RLS เฉพาะตอน seed (ขอบเขตจำกัดแค่ insert ของ user ที่เพิ่งสมัคร)
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
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ฟังก์ชันเบาๆ ให้ GitHub Actions เรียกกัน free tier pause (ไม่แตะข้อมูลจริง)
create or replace function public.keep_alive()
returns text language sql as $$ select 'ok'::text $$;

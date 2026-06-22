-- 04_grants.sql — ต้องรันเป็นไฟล์สุดท้าย
-- โปรเจกต์ Supabase ใหม่ไม่ auto-grant สิทธิ์ตารางใน public schema แล้ว
-- ถ้าไม่ grant จะเจอ error 42501 permission denied ตอน supabase-js query
-- (GRANT เป็น idempotent — รันซ้ำได้ ปลอดภัยแม้โปรเจกต์จะ auto-grant อยู่แล้ว)

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.categories   to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;

-- ให้ anon เรียกได้เฉพาะ keep_alive — ไม่ให้แตะตารางข้อมูลเลย (defense-in-depth ทับ RLS อีกชั้น)
grant execute on function public.keep_alive() to anon;

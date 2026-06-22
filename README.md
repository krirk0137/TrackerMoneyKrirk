# บันทึกรายรับ–รายจ่ายส่วนตัว (TrackerMoneyKrirk)

> Supabase dashboard: https://supabase.com/dashboard/project/ygpkqwuhmvsewcdcsgro
> p ! @ K 7

เว็บบันทึกรายรับ–รายจ่ายส่วนตัว · static frontend (HTML + Bootstrap 5 + vanilla JS) + Supabase (Postgres + Auth + RLS) · deploy ฟรีบน GitHub Pages

## สถานะ
- [x] Phase 0 — SQL schema / RLS / functions / grants (`sql/`)
- [x] Phase 1 — โครงเว็บ + Auth (login / logout / session guard)
- [x] Phase 2 — Transactions CRUD (ตาราง + filter + เพิ่ม/แก้/ลบ)
- [x] Phase 3 — Dashboard + กราฟ (การ์ดสรุป + วงกลม + แท่ง 6 เดือน + รายการล่าสุด)
- [x] Phase 4 — Categories management (CRUD แยก income/expense + เตือนก่อนลบหมวดที่มีรายการ)
- [x] Phase 5 — Deploy GitHub Pages + keep-alive / backup (workflows ใน `.github/workflows/`)
- [x] Phase 6 — Export CSV · งบประมาณรายหมวด · รายการประจำ (recurring) · PWA ติดตั้งบนมือถือ

> ⚠️ Phase 6 ต้องรัน `sql/05_phase6.sql` ใน Supabase SQL Editor ก่อน (เพิ่มคอลัมน์ `monthly_budget` + ตาราง `recurring`) ไม่งั้นแท็บหมวดหมู่/ประจำจะ error

## ตั้งค่า Supabase (ทำครั้งเดียว)

1. **Data API settings** (Project Settings → API): Enable Data API = ON, Enable automatic RLS = ON
2. **รัน SQL ตามลำดับ** ใน Supabase → SQL Editor:
   `sql/01_schema.sql` → `sql/02_rls.sql` → `sql/03_functions.sql` → `sql/04_grants.sql`
   (ไฟล์ 04 ต้องรันสุดท้าย)
3. **สร้างบัญชีของตัวเอง**: Authentication → Users → Add user (ใส่อีเมล+รหัสผ่าน, ติ๊ก Auto Confirm)
   → trigger `handle_new_user` จะ seed หมวดหมู่เริ่มต้นให้อัตโนมัติ
4. **ปิดการสมัครสาธารณะ**: Authentication → Providers/Sign In → ปิด "Allow new users to sign up"
   (ให้เป็น single-user จริง)

## รันบนเครื่อง

ES modules ใช้ผ่าน `file://` ไม่ได้ ต้องเสิร์ฟผ่าน http:

```bash
npx serve .
# หรือ
python -m http.server 8000
```

แล้วเปิด `http://localhost:8000`

## ความปลอดภัย (อ่านก่อน)

- `app/config.js` มีแค่ **URL + publishable key** ซึ่ง **public โดยออกแบบ** — ปลอดภัยที่จะอยู่ใน repo สาธารณะ ความปลอดภัยพึ่ง RLS ทั้งหมด
- ❌ **ห้าม** ใส่ `service_role` key หรือ **database password / connection string** ลงในโค้ดหรือ repo เด็ดขาด
- connection string (สำหรับ backup ใน Phase 5) เก็บเป็น **GitHub Actions secret** (`SUPABASE_DB_URL`) เท่านั้น
- ทดสอบ RLS: สร้าง user คนที่ 2 แล้วยืนยันว่า **มองไม่เห็น/แก้ไม่ได้** ข้อมูลของคนแรก

## โครงสร้าง

```
index.html            # shell: หน้า login + แอปหลัก
app/
  config.js           # SUPABASE_URL + publishable key (public)
  supabaseClient.js   # init supabase client (ESM)
  auth.js             # login / logout / session guard
  ui.js               # toast, format เงินไทย, วันที่ Asia/Bangkok
styles/main.css
sql/                  # 01 schema → 02 rls → 03 functions → 04 grants
```

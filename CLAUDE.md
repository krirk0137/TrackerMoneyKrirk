# CLAUDE.md — TrackerMoneyKrirk

ไฟล์นี้สำหรับ Claude (และเจ้าของ) อ่านตอนเริ่ม session ใหม่ — สรุปว่าโปรเจกต์นี้คืออะไร ทำถึงไหน
แล้วต่อไปจะไปทางไหน

---

## โปรเจกต์นี้คืออะไร

เว็บบันทึกรายรับ–รายจ่ายส่วนตัว (single-user) ของ Krirk · ฟรีทั้ง stack
- **Live:** https://krirk0137.github.io/TrackerMoneyKrirk/
- **Repo:** https://github.com/krirk0137/TrackerMoneyKrirk
- เจ้าของถนัด HTML/Bootstrap/JS แบบ vanilla · สื่อสารภาษาไทย

## สถานะปัจจุบัน (2026-06-24): Phase 1–6 + V1.5 เสร็จ (V1.5 ยังไม่ deploy — รอรัน sql/06 + push)

ฟีเจอร์ที่มี: Login+RLS · CRUD รายการ + filter + Export CSV · Dashboard (การ์ดสรุป + กราฟวงกลม/แท่ง 6 เดือน + รายการล่าสุด + งบประมาณรายหมวด) · จัดการหมวดหมู่ · รายการประจำ (auto-gen รายเดือน) · PWA · keep-alive + backup workflows
**V1.5 (2026-06-24):** Dark mode · ปฏิทินรายวัน · เป้าหมายออมเงิน · เพิ่มหลายวันพร้อมกัน · แจ้งเตือนงบ 50/80/100% · โน้ตในรายการประจำ/tooltip กราฟ/กาง row dashboard

---

## Tech Stack & สถาปัตยกรรม — **อยู่ web + Supabase ต่อ ไม่เปลี่ยนไป native**

| ส่วน | ใช้ |
|---|---|
| Frontend | HTML + Bootstrap 5 + vanilla JS (ES modules ผ่าน CDN, **no build step**) |
| Backend | Supabase (Postgres + Auth email/password + RLS) |
| Hosting | GitHub Pages (deploy = `git push` main) |
| Libs (CDN) | supabase-js (ESM), SweetAlert2, Chart.js, Bootstrap |

**การตัดสินใจสำคัญ (อย่ากลับไปถกซ้ำโดยไม่มีเหตุผลใหม่):**
- ✅ อยู่ web + Supabase — เพราะ deploy ฟรี, sync หลายเครื่องทันที, ติดตั้ง PWA บนมือถือได้, ตรงกับสกิลเจ้าของ
- ❌ **ไม่เปลี่ยนไป .NET MAUI/native (ตามที่ TodoListFromGPT เสนอ)** — ต้องเขียนใหม่หมด, เสีย sync/hosting ฟรี, ต้องเรียน C#/XAML ใหม่ ไม่คุ้มกับแอปส่วนตัว
- Auth+RLS จำเป็น (ไม่ใช่ over-engineering) เพราะ publishable key เป็น public

## โครงสร้างโค้ด & convention (เขียนของใหม่ให้เข้ากับของเดิม)

- `app/*.js` แยกไฟล์ละ 1 feature: `config` `supabaseClient` `ui` `auth` `nav` `transactions` `dashboard` `categories` `recurring`
- **Event-based wiring** (decouple ระหว่างโมดูล):
  - `auth.js` dispatch `auth:login` / `auth:logout` (guard ด้วย lastLoggedIn)
  - `nav.js` dispatch `view:change` (detail.view) — โมดูลโหลดข้อมูลแบบ **lazy ตอนเปิดแท็บ**
  - `categories:changed` → transactions รีโหลด dropdown · `transactions:changed` → ตารางรีโหลด
- helper รวมที่ `app/ui.js`: `toast` `formatTHB` `todayBangkok` `monthRange` `downloadFile`
- แต่ละ module มี `escapeHtml` ของตัวเอง (match style เดิม — อย่าเพิ่งไปรวม)
- **คำนวณสรุปฝั่ง JS** ไม่ใช้ RPC (ตั้งใจให้เรียบง่าย)
- SQL อยู่ที่ `sql/` รันเรียงเลข; ตอนนี้ 01 schema → 02 rls → 03 functions → 04 grants → 05 phase6

## กฎเหล็ก / gotchas (พังบ่อยถ้าลืม)

1. **txn_date**: client ส่งเสมอ (`todayBangkok()` = Asia/Bangkok) — **ห้ามพึ่ง `default current_date`** (DB เป็น UTC → เที่ยงคืน–ตี7 ลงผิดวัน)
2. **ตารางใหม่ทุกตาราง** ต้อง: enable RLS + policy `own` (auth.uid()=user_id) + **`grant ... to authenticated`** (โปรเจกต์ Supabase ใหม่ไม่ auto-grant → ไม่ grant = error 42501)
3. เงินใช้ `numeric` เท่านั้น ห้าม float
4. **ห้าม commit** service_role key / db password / connection string ลง repo (เป็น public) — publishable key ใน config.js เป็น public ปลอดภัย; db url ใส่เป็น GitHub Actions secret เท่านั้น
5. ES modules ต้องรันผ่าน http (`python -m http.server` / `npx.cmd serve .`) — `file://` ไม่ได้

---

## Roadmap (สิ่งที่ Claude แนะนำ 2026-06-23 — เจ้าของเห็นชอบ V1.5 + V2, ข้าม V3)

ที่มา: รวมจาก TodoList.md (เจ้าของ) + TodoListFromClaude + TodoListFromGPT

### ▶ V1.5 — quick wins บน schema เดิม (✅ เสร็จ 2026-06-24 ยกเว้นข้อ option)
- [x] โชว์ "โน้ต" ในหน้ารายการประจำ — `recurring.js` (บรรทัดโน้ตใต้รายการ)
- [x] Dashboard: กาง row ดูโน้ตแต่ละรายการ — `dashboard.js` (คลิกแถวรายการล่าสุด → กางโน้ต+วิธีจ่าย)
- [x] เพิ่มรายการหลายวันพร้อมกัน — `transactions.js` + modal `#multi-modal` (ปุ่ม "+ หลายวัน", ติ๊กวัน → loop insert)
- [x] Calendar view — แท็บ "ปฏิทิน" `calendar.js` (เขียว=รับ แดง=จ่าย, คลิกวันดูรายการ)
- [x] เป้าหมายออมเงิน (savings goals) — แท็บ "ออมเงิน" `savings.js` + `sql/06_savings.sql` ⚠️ **ต้องรัน SQL ก่อนใช้**
- [x] แจ้งเตือนงบ 50/80/100% — `dashboard.js` (ไอคอน 🟢🟡⚠️🔴 + แบนเนอร์สรุป)
- [x] Dark mode — `theme.js` (ปุ่ม 🌙/☀️ บน navbar, จำใน localStorage, ปรับสี Chart ด้วย)
- [x] โน้ตใน tooltip กราฟ — `dashboard.js` renderPie (afterBody แสดงโน้ตต่อ slice สูงสุด 5)
- [ ] (option) แนบรูปใบเสร็จ → Supabase Storage + RLS · Export PDF/Excel — **ยังไม่ทำ (ของหนัก ข้ามไปก่อน)**

### ▶ V2 — รื้อ/ขยาย schema ครั้งเดียว (🚧 กำลังทำบน branch `v2` — ยังไม่ merge เข้า main)

**สถานะ V2 (2026-06-25): V2.0 core + V2.1 (subcat/tags/budgets) เสร็จบน branch `v2` แต่ยังไม่ deploy + ยังไม่เทสต์กับ DB จริง**
- ✅ DB: `sql/07_v2_accounts.sql` (accounts + transactions ขยาย account_id[nullable ชั่วคราว]/to_account_id/type 'transfer'/`chk_transfer`/multi-currency cols + `amount_base` generated + view `account_balances` + handle_new_user seed บัญชี + `set_updated_at`) · `sql/08_v2_features.sql` (tags + transaction_tags + categories.parent_id/is_archived + budgets per-period)
- ✅ Frontend (บัญชี+โอน): แท็บ "บัญชี" `accounts.js` (CRUD + ยอดสด + สินทรัพย์สุทธิ + archive) · ฟอร์มรายการเลือกบัญชี + ประเภท "โอน" (จาก→ไป, validate, ไม่นับรับ/จ่าย) · คอลัมน์บัญชีในตาราง + CSV · multi-day เลือกบัญชี · recurring stamp บัญชีดีฟอลต์ · โอนถูกกันออกจากผลรวม/กราฟ/ปฏิทิน
- ✅ Frontend (V2.1): **หมวดย่อย** (`categories.js` parent_id + dropdown เยื้องชั้น) · **แท็ก** (`transactions.js`: chip ในฟอร์ม + badge ในตาราง + filter + modal จัดการ) · **งบประมาณ** แท็บใหม่ `budgets.js` (งบรวม/รายหมวด รายเดือน + แถบ 🟢🟡⚠️🔴)
- ⏳ **ต้องทำก่อนใช้ branch v2:** (1) **backup** (2) รัน `sql/07` + `sql/08` บน Supabase (3) เทสต์ login จริง — บัญชี/โอน/แท็ก/หมวดย่อย/งบ
- ❌ **recurring_rules (รายวัน/สัปดาห์/ปี/ทุก N) — ตัดออก** เจ้าของยืนยัน 2026-06-25 ว่าใช้รายการประจำแค่รายเดือน → ใช้ V1 `recurring` เดิมพอ (อย่ารื้อกลับมาทำโดยไม่มีเหตุผลใหม่)
- 🔜 **เหลือใน "จัดเต็ม" (ยังไม่ทำ):** UI multi-currency (schema พร้อม default THB — เจ้าของเอนเอียง "ข้าม" ถ้าไม่เที่ยว ตปท. บ่อย) · migration บังคับ `account_id` NOT NULL (หลัง deploy v2 frontend) · balances summary บน dashboard · (option) ผูก `budgets` เข้ากับ dashboard แทน `categories.monthly_budget`
- หมายเหตุงบ: ตอนนี้มี 2 ที่ — dashboard ยังใช้ `categories.monthly_budget` (V1.5), แท็บ "งบประมาณ" ใหม่ใช้ตาราง `budgets` (รวมงบรวมทุกหมวด). ยังไม่รวมเป็นระบบเดียว

**ตัวเอก: หลายบัญชี + โอนระหว่างบัญชี (ไม่นับเป็นรายรับ/จ่าย)** — เจ้าของอยากได้ชัดเจน
- ใช้ **schema ใน `TodoListFromClaude` เป็นฐาน** (ออกแบบดี รัดกุม): accounts, transactions เพิ่ม account_id/to_account_id/type 'transfer' + `chk_transfer`, tags, sub-category (parent_id), budgets (per period), recurring_rules + generator, savings_goals, multi-currency (amount_base generated), view `account_balances`, RPC summary/breakdown/budget
- Subscription tracking = recurring + แจ้งเตือนก่อนตัดเงิน
- multi-currency ทำก็ได้ ข้ามก็ได้ (คุ้มถ้าเที่ยวต่างประเทศบ่อย)

**คำแนะนำเพิ่มเติมจาก Claude สำหรับ V2 (สำคัญ — เป็นข้อมูลการเงิน):**
1. **Backup ก่อนเริ่ม migration** — รัน backup workflow + โหลด `.sql` เก็บไว้ก่อนแตะ schema
2. **ทำบน branch แยก** (เช่น `v2`) อย่าพัง main ที่ live อยู่ — เทสต์ให้ผ่านแล้วค่อย merge
3. เขียน migration ที่ **idempotent** + มี **data migration**: ย้าย transaction เดิมเข้า account ดีฟอลต์ "เงินสด" (เติม account_id ให้แถวเก่า) — ✅ ทำแล้วที่ `sql/07_v2_accounts.sql` (06 ถูกใช้โดย savings ไปแล้ว)
4. ใช้ `set_updated_at()` trigger (ตาม FromClaude) แทนการ set `updated_at` ใน JS เอง
5. ถ้า V2 หน้าจอบานมาก (บัญชี/แท็ก/ปฏิทิน) ค่อยพิจารณา framework เบาแบบ no-build (Alpine.js / Preact ผ่าน CDN) — ยังไม่บังคับ

### ⏸ V3 — ข้ามไปก่อน (มีค่าใช้จ่าย/ความเสี่ยง ไม่คุ้มตอนนี้ — เจ้าของขอข้าม)
- **สแกน SMS อัตโนมัติ** → 🔴 web ทำไม่ได้ (เบราว์เซอร์อ่าน SMS ไม่ได้) ต้องมี Android companion หรือ iOS Shortcuts ยิง API
- **OCR ใบเสร็จ** → Tesseract.js (ฟรี ไทยแม่นปานกลาง) หรือ cloud OCR
- **AI assistant** → ต้อง proxy ผ่าน Supabase Edge Function (ห้ามเอา API key ใส่ frontend) + Gemini free tier
> ทำทีหลังเมื่อแกน V1.5/V2 นิ่งแล้ว และยอมรับ infra/ความเสี่ยงเพิ่ม

---

## ค้างอยู่ / housekeeping (เช็คก่อนทำงานใหม่)
- [ ] 🆕 **รัน `sql/06_savings.sql` บน Supabase** — แท็บ "ออมเงิน" จะ error 42P01/42501 ถ้ายังไม่รัน (V1.5)
- [ ] ยืนยันว่ารัน `sql/05_phase6.sql` บน Supabase แล้ว (ถ้าแท็บหมวดหมู่/ประจำ error = ยังไม่รัน)
- [ ] 🔑 **reset รหัส database** (เคยหลุดในแชต `!@Krirk0137`) + อัปเดต GitHub secret `SUPABASE_DB_URL` + **ลบบรรทัดใบ้รหัสใน README** (`> p ! @ K 7`)
- [ ] ทดสอบ RLS: สร้าง user คนที่ 2 ยืนยันว่าเห็นข้อมูลกันไม่ได้

## ไฟล์อ้างอิงในโปรเจกต์
- `tracker-plan.md` / `tracker-plan_ver2Update.md` — spec ตั้งต้นของ V1 (v2 เพิ่มเรื่อง GRANT + keep_alive RPC)
- `TodoList.md` — wishlist ของเจ้าของ
- `TodoListFromClaude` — **schema V2 เต็ม (ใช้เป็นฐาน V2)**
- `TodoListFromGPT` — แนวคิด native .NET MAUI (ไม่เอา stack นี้ แต่ดู feature list/priority ได้)

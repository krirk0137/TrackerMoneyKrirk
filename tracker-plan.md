# แผนโปรเจกต์: Personal Income/Expense Tracker

> สเปคนี้เขียนเพื่อใช้สั่ง Claude Code ให้สร้างเว็บบันทึกรายรับ–รายจ่ายส่วนตัว
> สถาปัตยกรรม: static frontend บน GitHub Pages + Supabase (PostgreSQL) เป็น database + API + Auth
> ฟรีทั้ง stack ไม่ต้อง deploy server เอง

---

## 1. ภาพรวม (Overview)

แอปบันทึกรายรับ–รายจ่ายส่วนตัว ใช้คนเดียว (single-user) แต่ใช้ระบบ login จริงเพื่อให้ Row Level Security ทำงานได้สะอาด

**ขอบเขต MVP**
- Login / logout (email + password)
- เพิ่ม / แก้ไข / ลบ รายการรายรับ–รายจ่าย
- จัดการหมวดหมู่ (categories) แยกประเภท income / expense
- Dashboard สรุปยอดรายเดือน: รายรับรวม, รายจ่ายรวม, คงเหลือ
- กรองรายการตามเดือน / ประเภท / หมวดหมู่ / ค้นหาข้อความ
- กราฟ: สัดส่วนรายจ่ายตามหมวด + แนวโน้มรายเดือน

**สกุลเงิน:** THB อย่างเดียว | **Timezone:** Asia/Bangkok (เก็บวันที่เป็น `date` ไม่ผูก tz)

---

## 2. Tech Stack

| ส่วน | เลือกใช้ | เหตุผล |
|------|---------|--------|
| Frontend | HTML + Bootstrap 5 + vanilla JS | ไม่มี build step → deploy GitHub Pages ได้ทันที, ตรงกับที่ถนัด (Bootstrap/SweetAlert2/Chart.js) |
| Supabase client | `@supabase/supabase-js@2` ผ่าน CDN | ไม่ต้องตั้ง bundler |
| UI ช่วย | SweetAlert2 (modal/confirm), Chart.js (กราฟ) | ผ่าน CDN |
| Backend (BaaS) | Supabase: Postgres + Auth + auto REST API | relational SQL, RLS, free tier |
| Hosting | GitHub Pages | static, ฟรี, HTTPS, custom domain ได้ |

> ทางเลือก: ถ้าต้องการ React/Vue + Vite ให้สลับ frontend stack ได้ แต่ต้องเพิ่ม GitHub Actions build แล้ว deploy `dist/` ไป Pages — MVP นี้เลือกแบบ no-build เพื่อความง่าย

---

## 3. สถาปัตยกรรม (Architecture)

```
[Browser / GitHub Pages static site]
        |  supabase-js (anon key, public)
        v
[Supabase REST API]  <-- RLS บังคับสิทธิ์ทุก query
        |
        v
[PostgreSQL]
```

**Security model (สำคัญที่สุดของสถาปัตยกรรมนี้):**
- `anon key` อยู่ใน frontend = public โดยออกแบบ (ไม่ใช่ความลับ)
- ความปลอดภัยทั้งหมดพึ่ง **Row Level Security** → ทุกตารางต้องเปิด RLS และตั้ง policy ว่า user เห็น/แก้ได้เฉพาะแถวของตัวเอง
- `service_role key` ห้ามอยู่ใน repo หรือ frontend เด็ดขาด (ใช้เฉพาะ server-side เช่นใน GitHub Actions backup)

---

## 4. โครงสร้างไฟล์ (Project Structure)

```
/
├── index.html              # shell หลัก (login + app)
├── app/
│   ├── config.js           # SUPABASE_URL, SUPABASE_ANON_KEY (public — ปลอดภัย)
│   ├── supabaseClient.js    # init client
│   ├── auth.js              # login / logout / session guard
│   ├── transactions.js      # CRUD + filter
│   ├── categories.js        # CRUD หมวดหมู่
│   ├── dashboard.js         # สรุปยอด + กราฟ
│   └── ui.js                # helper (format เงิน, modal, toast)
├── styles/
│   └── main.css
├── sql/
│   ├── 01_schema.sql
│   ├── 02_rls.sql
│   ├── 03_seed_trigger.sql
│   └── 04_functions.sql
├── .github/workflows/
│   ├── keep-alive.yml
│   └── backup.yml
└── README.md
```

CDN ใน `index.html`:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3/dist/css/bootstrap.min.css" rel="stylesheet">
```

---

## 5. Database Schema — `sql/01_schema.sql`

```sql
-- categories
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

-- transactions
create table public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id    uuid references public.categories(id) on delete set null,
  type           text not null check (type in ('income','expense')),
  amount         numeric(12,2) not null check (amount > 0),
  txn_date       date not null default current_date,
  note           text,
  payment_method text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);

create index transactions_user_date_idx on public.transactions (user_id, txn_date desc);
create index transactions_category_idx  on public.transactions (category_id);
```

> `user_id` มี `default auth.uid()` → ตอน insert จาก client ไม่ต้องส่ง user_id เอง

---

## 6. Row Level Security — `sql/02_rls.sql`

```sql
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;

-- categories
create policy "categories_select_own" on public.categories
  for select using (auth.uid() = user_id);
create policy "categories_insert_own" on public.categories
  for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on public.categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories_delete_own" on public.categories
  for delete using (auth.uid() = user_id);

-- transactions
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);
create policy "transactions_insert_own" on public.transactions
  for insert with check (auth.uid() = user_id);
create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);
```

---

## 7. Seed หมวดหมู่เริ่มต้น + Trigger — `sql/03_seed_trigger.sql`

สร้างหมวดหมู่เริ่มต้นอัตโนมัติเมื่อมี user ใหม่ (รันแบบ `security definer` เพื่อ bypass RLS เฉพาะตอน insert seed)

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categories (user_id, name, type, sort_order) values
    (new.id, 'เงินเดือน',      'income',  1),
    (new.id, 'รายได้เสริม',     'income',  2),
    (new.id, 'อาหาร',          'expense', 1),
    (new.id, 'เดินทาง',         'expense', 2),
    (new.id, 'ช้อปปิ้ง',        'expense', 3),
    (new.id, 'บิล/ค่าบริการ',   'expense', 4),
    (new.id, 'อื่นๆ',           'expense', 99);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 8. RPC สรุปยอดรายเดือน — `sql/04_functions.sql`

ย้าย logic การสรุปไปฝั่ง DB (เรียกผ่าน `supabase.rpc('monthly_summary', {...})`) ใช้ `security invoker` เพื่อให้ RLS ยังบังคับใช้

```sql
create or replace function public.monthly_summary(p_year int, p_month int)
returns table (total_income numeric, total_expense numeric, balance numeric)
language sql
security invoker
as $$
  select
    coalesce(sum(amount) filter (where type = 'income'),  0) as total_income,
    coalesce(sum(amount) filter (where type = 'expense'), 0) as total_expense,
    coalesce(sum(amount) filter (where type = 'income'),  0)
      - coalesce(sum(amount) filter (where type = 'expense'), 0) as balance
  from public.transactions
  where user_id = auth.uid()
    and extract(year  from txn_date) = p_year
    and extract(month from txn_date) = p_month;
$$;
```

---

## 9. Auth

- ใช้ Supabase Auth แบบ email + password
- หลังจากสมัครบัญชีของตัวเองครั้งแรกแล้ว → เข้า Supabase dashboard → Authentication → ปิด **Allow new users to sign up** เพื่อให้แอปเป็น single-user จริง (กันคนอื่นสมัคร)
- ทุกหน้าต้องมี session guard: ถ้าไม่มี session ให้เด้งไปหน้า login
- เก็บ session ด้วย default ของ supabase-js (localStorage) ก็พอ

---

## 10. ฟีเจอร์ / หน้าจอ

**Login** — email/password, แสดง error เป็น toast

**Dashboard**
- ตัวเลือกเดือน (เดือนปัจจุบันเป็น default)
- การ์ด 3 ใบ: รายรับรวม / รายจ่ายรวม / คงเหลือ (เรียก `monthly_summary` RPC)
- กราฟวงกลม: สัดส่วนรายจ่ายตามหมวด (เดือนที่เลือก)
- กราฟแท่ง: รายรับ vs รายจ่าย ย้อนหลัง 6 เดือน
- รายการล่าสุด 5–10 แถว

**Transactions**
- ตารางรายการ + filter: เดือน, ประเภท (income/expense/all), หมวดหมู่, ค้นหา note
- ปุ่มเพิ่ม → modal (ประเภท, จำนวนเงิน, หมวดหมู่ [กรองตามประเภท], วันที่, note, payment_method)
- แก้ไข (modal เดิม), ลบ (SweetAlert2 confirm)
- format เงินแบบไทย (คอมมาคั่นหลักพัน, ทศนิยม 2)

**Categories**
- รายการหมวดหมู่แยก income/expense, CRUD
- กันลบหมวดที่ยังมี transaction อ้างอิงอยู่ (หรือใช้ `on delete set null` ตาม schema = อนุญาตลบแล้ว category_id เป็น null)

---

## 11. การ Deploy (GitHub Pages)

1. push โค้ดขึ้น repo
2. Settings → Pages → Source = branch `main`, folder `/ (root)`
3. ถ้า repo เป็น **public** ตรวจให้แน่ใจว่ามีเฉพาะ anon key (ปลอดภัย) ไม่มี service_role key
4. ใส่ค่าใน `app/config.js`:
```js
export const SUPABASE_URL = "https://<project-ref>.supabase.co";
export const SUPABASE_ANON_KEY = "<anon-public-key>";
```

---

## 12. GitHub Actions: Keep-Alive (กัน free tier pause) — `.github/workflows/keep-alive.yml`

โปรเจกต์ฟรีจะถูก pause ถ้าไม่มี request เข้า DB ครบ 7 วัน → ยิง query เบาๆ ทุก 3 วันกันไว้

```yaml
name: Supabase Keep-Alive
on:
  schedule:
    - cron: '0 3 */3 * *'   # ทุก 3 วัน 03:00 UTC
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase REST
        run: |
          curl -sf \
            "${{ secrets.SUPABASE_URL }}/rest/v1/categories?select=id&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

ตั้ง secrets ใน repo: `SUPABASE_URL`, `SUPABASE_ANON_KEY`

---

## 13. GitHub Actions: Backup (free tier ไม่มี backup อัตโนมัติ) — `.github/workflows/backup.yml`

dump ทั้ง DB เป็นไฟล์ แล้วเก็บเป็น artifact (สำคัญสำหรับข้อมูลการเงิน)

```yaml
name: Supabase Backup
on:
  schedule:
    - cron: '0 18 * * 0'   # ทุกวันอาทิตย์ 18:00 UTC (~เช้าจันทร์ไทย)
  workflow_dispatch:
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Dump database
        run: supabase db dump --db-url "${{ secrets.SUPABASE_DB_URL }}" -f backup.sql
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: supabase-backup-${{ github.run_id }}
          path: backup.sql
          retention-days: 30
```

- `SUPABASE_DB_URL` = connection string ของ Postgres (มี password) → เก็บเป็น **secret เท่านั้น** ห้ามอยู่ในโค้ด
- ดึง connection string จาก Supabase → Project Settings → Database

> หมายเหตุ: คำสั่ง/flag ของ Supabase CLI และชื่อ action version อาจเปลี่ยนได้ ให้ Claude Code ตรวจกับเอกสาร Supabase ปัจจุบันก่อนรันจริง

---

## 14. แผนงานแบ่งเป็นเฟส (สำหรับ Claude Code ทำทีละ step)

**Phase 0 — Supabase setup**
- สร้างโปรเจกต์ Supabase, รัน `sql/01–04` ตามลำดับ
- ตรวจว่า RLS เปิดครบทุกตาราง

**Phase 1 — Scaffold + Auth**
- โครงไฟล์ตามข้อ 4, init supabase client
- หน้า login + session guard + logout

**Phase 2 — Transactions CRUD**
- ตารางรายการ + filter + add/edit/delete modal

**Phase 3 — Dashboard**
- การ์ดสรุป (RPC) + กราฟ Chart.js

**Phase 4 — Categories management**
- CRUD หมวดหมู่

**Phase 5 — Deploy + Automation**
- ตั้ง GitHub Pages
- เพิ่ม keep-alive + backup workflows

**Phase 6 — Optional (ทำหรือไม่ก็ได้)**
- export CSV, รายการประจำ (recurring), งบประมาณรายหมวด (budget), PWA สำหรับเปิดบนมือถือ

---

## 15. Acceptance Criteria (สิ่งที่ต้องตรวจก่อนถือว่าเสร็จ)

- [ ] สร้าง user ทดสอบตัวที่ 2 แล้วยืนยันว่า **มองไม่เห็น/แก้ไม่ได้** ข้อมูลของ user แรก (RLS ทำงาน)
- [ ] ใน repo ไม่มี `service_role` key (grep ทั้ง repo)
- [ ] `config.js` มีแค่ anon key
- [ ] เพิ่ม/แก้/ลบ transaction แล้วยอดสรุปอัปเดตถูกต้อง
- [ ] ยอดเงินแสดงแบบไทย, วันที่ถูกต้องตาม Asia/Bangkok
- [ ] keep-alive workflow รันผ่าน (กดทดสอบ manual ได้)
- [ ] backup workflow สร้างไฟล์ `.sql` ที่ restore ได้จริง

---

## 16. ข้อควรระวังด้านความปลอดภัย (ย้ำ)

1. **เปิด RLS ทุกตารางที่มีข้อมูลจริง** — ถ้าลืม = ข้อมูลการเงินเปิดสาธารณะ
2. **ห้าม commit `service_role` key** ลง repo หรือใส่ใน frontend เด็ดขาด
3. ปิด public signup ใน Supabase Auth หลังสร้างบัญชีตัวเอง
4. `anon key` ใน config.js เป็น public ได้ ไม่ต้องซ่อน — แต่ต้องมั่นใจว่า RLS รัดกุม
5. connection string (`SUPABASE_DB_URL`) สำหรับ backup = secret เท่านั้น

---

## หมายเหตุข้อมูล (verified)

ลิมิต Supabase free tier ที่อ้างถึง (ตรวจ มิ.ย. 2026): database 500MB, file storage 1GB, bandwidth 5GB/เดือน, 50,000 MAU, API requests ไม่จำกัด, 2 โปรเจกต์, **pause หลังไม่มี request 7 วัน**, **ไม่มี backup อัตโนมัติบน free tier**
ลิมิตเหล่านี้เคยเปลี่ยนหลายรอบในอดีต — ยืนยันตัวเลขล่าสุดที่ supabase.com/pricing ก่อนวางสถาปัตยกรรมรอบ caps เฉพาะ

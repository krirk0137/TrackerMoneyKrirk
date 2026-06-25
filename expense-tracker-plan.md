# Personal Expense Tracker — Build Plan

> เว็บบันทึกรายรับ–รายจ่ายส่วนตัว (single-user, มี login จริงเพื่อให้ RLS สะอาด)
> Stack: GitHub Pages (Bootstrap 5 + vanilla JS + supabase-js CDN, no build) + Supabase (Postgres + Auth + auto REST API)
> THB อย่างเดียว, timezone Asia/Bangkok

---

## 0. สถานะปัจจุบัน (จุดที่ค้างไว้)

- [x] Schema ครบ 8 ตาราง: `accounts`, `categories`, `transactions`, `tags`, `transaction_tags`, `budgets`, `recurring_rules`, `savings_goals`
- [x] Indexes + `updated_at` triggers + RLS ทุกตาราง + `security_invoker` view (ยอดคงเหลือ live)
- [x] 3 RPC: monthly summary, category breakdown, budget status
- [x] Seed function หมวดหมู่ไทย default + trigger auto-run ตอน signup
- [ ] **ยังไม่ได้รัน schema บน Supabase จริง** — ต้องเทสต์ก่อน
- [ ] TypeScript types + CRUD helpers — **ค้าง ยังไม่ทำ**
- [ ] `recurring_rules` มีแค่ schema **ยังไม่มี generator logic**
- [ ] Frontend (Quick Add, dashboard, กราฟ) ยังไม่เริ่ม
- [ ] **ของใหม่:** มี local Qwen (qwen3.6-35B-A3B) แล้ว → ปลดล็อก 3 ฟีเจอร์ AI (ดู §3)

**เริ่มที่นี่เมื่อกลับบ้าน → "Phase A" ด้านล่าง (ทำ CRUD helper ที่ค้างก่อน)**

---

## 1. สถาปัตยกรรม

```
[Browser / GitHub Pages]
   │ supabase-js (anon key = public by design)
   ▼
[Supabase REST API]  ← RLS บังคับสิทธิ์ทุก query
   ▼
[PostgreSQL]

ส่วน AI (เสริม):
[Browser] → [Supabase Edge Function] → [Qwen เพื่อน ผ่าน tunnel]
            (เก็บ key เป็น secret, อย่าใส่ใน frontend)
```

**Security model (สำคัญสุด):**
- `anon key` ใน frontend = public ได้ ความปลอดภัยพึ่ง **RLS** ล้วน → ทุกตารางต้องเปิด RLS
- `service_role key` ห้ามอยู่ใน repo/frontend เด็ดขาด (ใช้เฉพาะ GitHub Actions backup)
- ปิด public signup หลังสร้างบัญชีตัวเอง
- Supabase settings: Enable Data API **ON**, auto-expose new tables **OFF**, automatic RLS **ON** + `05_grants.sql` ให้สิทธิ์ explicit

---

## 2. แผนงานหลัก (เก็บงานค้าง + frontend)

**Phase A — Backend ที่ค้าง**
- [ ] รัน schema (4 ไฟล์ใน `sql/`) บน Supabase จริง แล้วเทสต์
- [ ] เขียน TypeScript types + CRUD helpers (งานที่ค้างอยู่)
- [ ] recurring transaction generator (เติมรายการตาม `recurring_rules`) — เลือกทำเป็น Edge Function + cron หรือ pg_cron
- [ ] GitHub Actions: keep-alive เรียก `keep_alive()` RPC ทุก 3 วัน + backup รายสัปดาห์

**Phase B — Frontend MVP**
- [ ] login/logout
- [ ] Quick Add: เพิ่มรายการเร็ว (จำนวน + หมวด + วันที่)
- [ ] list + แก้/ลบ, กรองตามเดือน/ประเภท/หมวด/ค้นหา
- [ ] Dashboard: รายรับรวม/รายจ่ายรวม/คงเหลือรายเดือน
- [ ] กราฟ (Chart.js): สัดส่วนรายจ่ายตามหมวด + แนวโน้มรายเดือน

**Phase C — ของหวาน**
- [ ] budget รายหมวด + แจ้งเตือนเกิน
- [ ] savings goals progress
- [ ] PWA (เปิดบนมือถือ, offline)

---

## 3. ส่วนเพิ่ม: 3 ฟีเจอร์ AI ด้วย Qwen

qwen3.6-35B-A3B **อ่านรูปได้ด้วย (multimodal/vision)** ไม่ใช่แค่ text → ปลดล็อกได้ 3 อย่าง:

**3.1 Quick Add แบบพิมพ์ประโยคเดียว (free-text → JSON)**
- พิมพ์ `"กาแฟ 65"` หรือ `"เติมน้ำมัน 500 เมื่อวาน"` → Qwen แปลงเป็น `{amount, category, merchant, note, date_hint}`
- เติมลง form ให้ยืนยันก่อน insert (อย่า insert ตรงจาก AI)
- **ตรงกับไอเดีย LINE bot ที่เคยคุย** — bot ใน LINE group รับข้อความ → เรียก endpoint เดียวกันนี้ parse → insert Supabase → ตอบ confirm

**3.2 อ่านสลิป/ใบเสร็จ (vision)**
- ถ่ายรูปสลิป → ส่งรูปเข้า endpoint vision ของ Qwen → ได้ amount/ร้าน/วันที่
- **ไม่ต้องหา OCR แยกแล้ว** เพราะโมเดลตัวนี้รับรูปได้เอง (ต่างจากที่เคยคิดว่าต้องใช้ Tesseract)
- ยืนยันก่อน insert เหมือนเดิม

**3.3 สรุป insight รายเดือน**
- aggregate ฝั่ง SQL ก่อน (group by หมวด/เดือน) → ส่ง "ตัวเลขสรุป" เข้า Qwen ไม่ใช่ raw ทุกแถว (ถูก+แม่นกว่า)
- ได้ 3–4 bullet: หมวดที่ใช้เยอะสุด, เทียบเดือนก่อน, จุดผิดปกติ

**Edge Function (sketch):**
```typescript
// supabase/functions/parse-expense/index.ts — NEW
// text mode: รับประโยค → JSON เดียว
// vision mode: รับ base64 รูปสลิป → JSON เดียว
// temperature 0, บังคับ output เป็น JSON ล้วน (strip ```fence```)
const SYSTEM_TEXT = `
Convert a Thai/English expense note into ONE JSON object. Output ONLY JSON.
{ "amount": number, "merchant": string|null,
  "category": "food|transport|shopping|bills|entertainment|health|other",
  "note": string|null, "occurred_hint": string|null }
Numbers like "65","65฿","65 บาท" -> 65. Unknown category -> "other".
Do NOT invent a date; only echo a hint if user wrote one.
`;
```

---

## 4. Qwen integration — รายละเอียดที่ต้องรู้

- โมเดล: **qwen3.6-35B-A3B** (text + vision, OpenAI-compatible)
- ต้องขอเพื่อน: base URL + port, ชื่อ model, context window, public URL (tunnel)
- เรียกผ่าน Edge Function เท่านั้น (key เป็น secret)
- **Privacy:** ข้อมูลการเงินวิ่งผ่านเครื่องเพื่อน — ชั่งใจ, เลี่ยงเลขบัญชี/ข้อมูลระบุตัวตน
- **Availability:** เครื่องเพื่อนปิด = ฟอร์มกรอกมือต้องใช้ได้ปกติ (AI เป็น "เสริม" ไม่ใช่ทางเดียว)
- **ห้าม insert ตรงจาก AI** — ให้ยืนยันค่าก่อนลง DB ทุกครั้ง

---

## 5. Build ที่บ้านด้วย Claude Code + Qwen (ออปชัน)

- เพื่อนรันผ่าน **LM Studio 0.4.1+** → มี `/v1/messages` แบบ Anthropic native, ชี้ Claude Code ตรงได้
- รัน **vLLM/Ollama เปล่า** → ใช้ **LiteLLM** เป็น gateway แปลง OpenAI → Anthropic
- env: `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL=qwen3.6-35b-a3b`, `ANTHROPIC_SMALL_FAST_MODEL`
- สั่ง: วางไฟล์นี้ใน repo แล้วบอก *"อ่าน expense-tracker-plan.md แล้วทำ Phase A ต่อ"*

---

## 6. ต้องเช็ค/ตัดสินใจ

- [ ] `category_id` ตอนนี้ตั้ง `on delete set null` (ลบหมวดแล้ว transaction เหลือ category ว่าง) — ถ้าอยากกันลบหมวดที่ยังมีรายการ เปลี่ยนเป็น `on delete restrict`
- [ ] recurring generator: เลือก pg_cron หรือ Edge Function + GitHub Actions cron
- [ ] เพื่อนรัน Qwen ด้วยอะไร → ต้อง LiteLLM ไหม
- [ ] ยืนยัน Supabase CLI version ในสคริปต์ backup (เคยเปลี่ยน) + free-tier limits ปัจจุบัน
- [ ] LINE bot: ทำ webhook host แยก (Vercel/Cloudflare Workers ฟรี) — ต่อ endpoint `parse-expense` ตัวเดียวกัน

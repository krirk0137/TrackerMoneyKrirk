import { supabase } from "./supabaseClient.js";
import { toast, formatTHB, todayBangkok, monthRange } from "./ui.js";

// --- DOM refs ---
const list = document.getElementById("rec-list");
const btnAdd = document.getElementById("btn-add-rec");
const btnGen = document.getElementById("btn-gen-rec");

const modalEl = document.getElementById("rec-modal");
const modal = new bootstrap.Modal(modalEl);
const form = document.getElementById("rec-form");
const modalTitle = document.getElementById("rec-modal-title");
const fldId = document.getElementById("rec-id");
const fldAmount = document.getElementById("rec-amount");
const fldCategory = document.getElementById("rec-category");
const fldDay = document.getElementById("rec-day");
const fldNote = document.getElementById("rec-note");
const fldPayment = document.getElementById("rec-payment");
const fldActive = document.getElementById("rec-active");

const TH_TYPE = { income: "รายรับ", expense: "รายจ่าย" };

let categories = [];
let temps = [];

const selectedType = () => document.querySelector("input[name=rec-type]:checked").value;
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- data ---
async function loadCategories() {
  const { data } = await supabase.from("categories").select("id, name, type, parent_id").order("sort_order");
  categories = data ?? [];
}

// เรียงหมวดของ type แบบลำดับชั้น: หมวดหลักตามด้วยหมวดย่อย
function orderedCategories(type) {
  const list = categories.filter((c) => c.type === type);
  const tops = list.filter((c) => !c.parent_id);
  const out = [];
  for (const t of tops) {
    out.push({ c: t, child: false });
    for (const ch of list.filter((x) => x.parent_id === t.id)) out.push({ c: ch, child: true });
  }
  for (const c of list) if (c.parent_id && !tops.some((t) => t.id === c.parent_id)) out.push({ c, child: true });
  return out;
}

function fillModalCategories(type, selectedId = "") {
  fldCategory.innerHTML =
    '<option value="">— ไม่ระบุ —</option>' +
    orderedCategories(type)
      .map(({ c, child }) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${child ? "↳ " : ""}${escapeHtml(c.name)}</option>`)
      .join("");
}

async function loadList() {
  const { data, error } = await supabase
    .from("recurring")
    .select("id, type, amount, category_id, day_of_month, note, payment_method, active, category:categories(name)")
    .order("day_of_month");
  if (error) return toast("error", "โหลดรายการประจำไม่สำเร็จ: " + error.message);

  temps = data ?? [];
  if (!temps.length) {
    list.innerHTML = `<li class="list-group-item text-muted">ยังไม่มีรายการประจำ</li>`;
    return;
  }
  list.innerHTML = temps
    .map((t) => {
      const income = t.type === "income";
      const badge = income ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger";
      return `<li class="list-group-item d-flex justify-content-between align-items-center ${t.active ? "" : "opacity-50"}">
        <div>
          <div>
            <span class="badge ${badge}">${TH_TYPE[t.type]}</span>
            <span class="ms-1">${t.category?.name ? escapeHtml(t.category.name) : "ไม่ระบุ"}</span>
            <span class="fw-semibold ms-1 ${income ? "text-success" : "text-danger"}">${formatTHB(t.amount)}</span>
            <span class="text-muted small ms-1">ทุกวันที่ ${t.day_of_month}${t.active ? "" : " · ปิดอยู่"}</span>
          </div>
          ${t.note ? `<div class="text-muted small mt-1">📝 ${escapeHtml(t.note)}</div>` : ""}
        </div>
        <span class="text-nowrap">
          <button class="btn btn-sm btn-outline-secondary" data-edit="${t.id}">แก้</button>
          <button class="btn btn-sm btn-outline-danger" data-del="${t.id}">ลบ</button>
        </span>
      </li>`;
    })
    .join("");
}

// --- modal ---
function openAdd() {
  form.reset();
  fldId.value = "";
  modalTitle.textContent = "เพิ่มรายการประจำ";
  document.getElementById("rec-type-expense").checked = true;
  fldActive.checked = true;
  fldDay.value = 1;
  fillModalCategories("expense");
  modal.show();
}

function openEdit(id) {
  const t = temps.find((x) => x.id === id);
  if (!t) return;
  form.reset();
  fldId.value = t.id;
  modalTitle.textContent = "แก้ไขรายการประจำ";
  document.getElementById(t.type === "income" ? "rec-type-income" : "rec-type-expense").checked = true;
  fldAmount.value = t.amount;
  fldDay.value = t.day_of_month;
  fldNote.value = t.note ?? "";
  fldPayment.value = t.payment_method ?? "";
  fldActive.checked = t.active;
  fillModalCategories(t.type, t.category_id ?? "");
  modal.show();
}

async function confirmDelete(id) {
  const res = await Swal.fire({
    title: "ลบรายการประจำนี้?",
    text: "รายการที่เคยถูกสร้างไปแล้วจะไม่ถูกลบ",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ลบ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc3545",
  });
  if (!res.isConfirmed) return;
  const { error } = await supabase.from("recurring").delete().eq("id", id);
  if (error) return toast("error", "ลบไม่สำเร็จ: " + error.message);
  toast("success", "ลบแล้ว");
  loadList();
}

// สร้าง transaction ของรายการประจำสำหรับเดือนปัจจุบัน (กันซ้ำด้วย recurring_id)
async function generateDue(silent = false) {
  const ym = todayBangkok().slice(0, 7);
  const { data: active } = await supabase
    .from("recurring")
    .select("id, type, amount, category_id, day_of_month, note, payment_method")
    .eq("active", true);
  if (!active?.length) {
    if (!silent) toast("info", "ยังไม่มีรายการประจำที่เปิดอยู่");
    return;
  }

  const { start, end } = monthRange(ym);
  const { data: existing } = await supabase
    .from("transactions")
    .select("recurring_id")
    .not("recurring_id", "is", null)
    .gte("txn_date", start)
    .lte("txn_date", end);
  const done = new Set((existing ?? []).map((r) => r.recurring_id));

  // บัญชีดีฟอลต์สำหรับรายการประจำ (เงินสด ถ้ามี ไม่งั้นใบแรก) — เป็น null บน DB ที่ยังไม่ migrate V2 (ยังลงได้ปกติ)
  const { data: accts } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("is_archived", false)
    .order("sort_order");
  const defaultAccountId = (accts?.find((a) => a.type === "cash") ?? accts?.[0])?.id ?? null;

  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const toInsert = active
    .filter((t) => !done.has(t.id))
    .map((t) => ({
      type: t.type,
      amount: t.amount,
      category_id: t.category_id,
      account_id: defaultAccountId,
      txn_date: `${ym}-${String(Math.min(t.day_of_month, lastDay)).padStart(2, "0")}`,
      note: t.note,
      payment_method: t.payment_method,
      recurring_id: t.id,
    }));

  if (!toInsert.length) {
    if (!silent) toast("info", "รายการประจำของเดือนนี้ลงครบแล้ว");
    return;
  }
  const { error } = await supabase.from("transactions").insert(toInsert);
  if (error) return toast("error", "สร้างรายการประจำไม่สำเร็จ: " + error.message);
  toast("success", `ลงรายการประจำเดือนนี้ ${toInsert.length} รายการ`);
  document.dispatchEvent(new CustomEvent("transactions:changed"));
}

// --- events ---
btnAdd.addEventListener("click", openAdd);
btnGen.addEventListener("click", () => generateDue(false));

document.querySelectorAll("input[name=rec-type]").forEach((radio) =>
  radio.addEventListener("change", () => fillModalCategories(selectedType()))
);

list.addEventListener("click", (e) => {
  const editId = e.target.closest("[data-edit]")?.dataset.edit;
  const delId = e.target.closest("[data-del]")?.dataset.del;
  if (editId) openEdit(editId);
  if (delId) confirmDelete(delId);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    type: selectedType(),
    amount: Number(fldAmount.value),
    category_id: fldCategory.value || null,
    day_of_month: Number(fldDay.value),
    note: fldNote.value.trim() || null,
    payment_method: fldPayment.value || null,
    active: fldActive.checked,
  };
  const id = fldId.value;
  const btn = form.querySelector("button[type=submit]");

  btn.disabled = true;
  const { error } = id
    ? await supabase.from("recurring").update(payload).eq("id", id)
    : await supabase.from("recurring").insert(payload);
  btn.disabled = false;

  if (error) return toast("error", "บันทึกไม่สำเร็จ: " + error.message);
  modal.hide();
  toast("success", id ? "แก้ไขแล้ว" : "เพิ่มรายการประจำแล้ว");
  loadList();
});

document.addEventListener("view:change", (e) => {
  if (e.detail.view === "recurring") loadCategories().then(loadList);
});
document.addEventListener("categories:changed", loadCategories);

// --- init: โหลดหมวด + สร้างรายการประจำที่ถึงกำหนดของเดือนนี้ (เงียบ ๆ) ---
async function init() {
  await loadCategories();
  await generateDue(true);
}
document.addEventListener("auth:login", init);

const {
  data: { session },
} = await supabase.auth.getSession();
if (session) init();

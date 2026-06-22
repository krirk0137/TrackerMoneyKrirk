import { supabase } from "./supabaseClient.js";
import { toast, formatTHB, todayBangkok, monthRange } from "./ui.js";

// --- DOM refs ---
const tbody = document.getElementById("txn-tbody");
const totalsCell = document.getElementById("txn-totals");
const fMonth = document.getElementById("f-month");
const fType = document.getElementById("f-type");
const fCategory = document.getElementById("f-category");
const fSearch = document.getElementById("f-search");
const fClear = document.getElementById("f-clear");
const btnAdd = document.getElementById("btn-add-txn");

const modalEl = document.getElementById("txn-modal");
const modal = new bootstrap.Modal(modalEl);
const form = document.getElementById("txn-form");
const modalTitle = document.getElementById("txn-modal-title");
const fldId = document.getElementById("txn-id");
const fldAmount = document.getElementById("txn-amount");
const fldCategory = document.getElementById("txn-category");
const fldDate = document.getElementById("txn-date");
const fldPayment = document.getElementById("txn-payment");
const fldNote = document.getElementById("txn-note");

const TH_TYPE = { income: "รายรับ", expense: "รายจ่าย" };

let categories = [];
let currentRows = [];

// --- helpers ---
const selectedType = () => document.querySelector("input[name=txn-type]:checked").value;

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- data ---
async function loadCategories() {
  const { data, error } = await supabase.from("categories").select("id, name, type").order("sort_order");
  if (error) return toast("error", "โหลดหมวดหมู่ไม่สำเร็จ: " + error.message);
  categories = data ?? [];
  fCategory.innerHTML =
    '<option value="">ทั้งหมด</option>' +
    categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${TH_TYPE[c.type]})</option>`).join("");
}

function fillModalCategories(type, selectedId = "") {
  fldCategory.innerHTML =
    '<option value="">— ไม่ระบุ —</option>' +
    categories
      .filter((c) => c.type === type)
      .map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${escapeHtml(c.name)}</option>`)
      .join("");
}

async function loadTransactions() {
  let q = supabase
    .from("transactions")
    .select("id, type, amount, txn_date, note, payment_method, category_id, category:categories(name)")
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (fMonth.value) {
    const { start, end } = monthRange(fMonth.value);
    q = q.gte("txn_date", start).lte("txn_date", end);
  }
  if (fType.value !== "all") q = q.eq("type", fType.value);
  if (fCategory.value) q = q.eq("category_id", fCategory.value);
  if (fSearch.value.trim()) q = q.ilike("note", `%${fSearch.value.trim()}%`);

  const { data, error } = await q;
  if (error) return toast("error", "โหลดรายการไม่สำเร็จ: " + error.message);
  currentRows = data ?? [];
  renderTable(currentRows);
}

function renderTable(rows) {
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">ไม่มีรายการ</td></tr>`;
    totalsCell.textContent = "";
    return;
  }

  tbody.innerHTML = rows
    .map((r) => {
      const income = r.type === "income";
      const cls = income ? "text-success" : "text-danger";
      const badge = income ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger";
      const dash = '<span class="text-muted">—</span>';
      return `<tr>
        <td class="text-nowrap">${r.txn_date}</td>
        <td><span class="badge ${badge}">${TH_TYPE[r.type]}</span></td>
        <td>${r.category?.name ? escapeHtml(r.category.name) : dash}</td>
        <td class="text-end fw-semibold ${cls} text-nowrap">${income ? "+" : "−"}${formatTHB(r.amount)}</td>
        <td>${r.payment_method ? escapeHtml(r.payment_method) : dash}</td>
        <td>${r.note ? escapeHtml(r.note) : dash}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-outline-secondary" data-edit="${r.id}">แก้</button>
          <button class="btn btn-sm btn-outline-danger" data-del="${r.id}">ลบ</button>
        </td>
      </tr>`;
    })
    .join("");

  const inc = rows.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);
  const exp = rows.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);
  totalsCell.innerHTML =
    `รายรับ <span class="text-success fw-semibold">+${formatTHB(inc)}</span> · ` +
    `รายจ่าย <span class="text-danger fw-semibold">−${formatTHB(exp)}</span> · ` +
    `คงเหลือ <span class="fw-semibold">${formatTHB(inc - exp)}</span>`;
}

// --- modal ---
function openAdd() {
  form.reset();
  fldId.value = "";
  modalTitle.textContent = "เพิ่มรายการ";
  document.getElementById("type-expense").checked = true;
  fldDate.value = todayBangkok();
  fillModalCategories("expense");
  modal.show();
}

function openEdit(id) {
  const r = currentRows.find((x) => x.id === id);
  if (!r) return;
  form.reset();
  fldId.value = r.id;
  modalTitle.textContent = "แก้ไขรายการ";
  document.getElementById(r.type === "income" ? "type-income" : "type-expense").checked = true;
  fldAmount.value = r.amount;
  fldDate.value = r.txn_date;
  fldPayment.value = r.payment_method ?? "";
  fldNote.value = r.note ?? "";
  fillModalCategories(r.type, r.category_id ?? "");
  modal.show();
}

async function confirmDelete(id) {
  const res = await Swal.fire({
    title: "ลบรายการนี้?",
    text: "ลบแล้วกู้คืนไม่ได้",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ลบ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc3545",
  });
  if (!res.isConfirmed) return;
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return toast("error", "ลบไม่สำเร็จ: " + error.message);
  toast("success", "ลบแล้ว");
  loadTransactions();
}

// --- events ---
btnAdd.addEventListener("click", openAdd);

document.querySelectorAll("input[name=txn-type]").forEach((radio) =>
  radio.addEventListener("change", () => fillModalCategories(selectedType()))
);

tbody.addEventListener("click", (e) => {
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
    txn_date: fldDate.value,
    payment_method: fldPayment.value || null,
    note: fldNote.value.trim() || null,
  };
  const id = fldId.value;
  const btn = form.querySelector("button[type=submit]");

  btn.disabled = true;
  const { error } = id
    ? await supabase.from("transactions").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from("transactions").insert(payload);
  btn.disabled = false;

  if (error) return toast("error", "บันทึกไม่สำเร็จ: " + error.message);
  modal.hide();
  toast("success", id ? "แก้ไขแล้ว" : "เพิ่มรายการแล้ว");
  loadTransactions();
});

fType.addEventListener("change", loadTransactions);
fCategory.addEventListener("change", loadTransactions);
fMonth.addEventListener("change", loadTransactions);

let searchTimer;
fSearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadTransactions, 350);
});

fClear.addEventListener("click", () => {
  fMonth.value = todayBangkok().slice(0, 7);
  fType.value = "all";
  fCategory.value = "";
  fSearch.value = "";
  loadTransactions();
});

// --- init ---
async function init() {
  fMonth.value = todayBangkok().slice(0, 7); // เดือนปัจจุบันเป็น default
  await loadCategories();
  await loadTransactions();
}

document.addEventListener("auth:login", init);
document.addEventListener("auth:logout", () => {
  tbody.innerHTML = "";
  totalsCell.textContent = "";
});

// ซิงก์ dropdown หมวดหมู่เมื่อมีการเพิ่ม/แก้/ลบหมวดในแท็บหมวดหมู่
document.addEventListener("categories:changed", loadCategories);

// เผื่อหน้านี้โหลดตอน login อยู่แล้ว (auth:login ถูก dispatch ไปก่อนโมดูลนี้จะ subscribe)
const {
  data: { session },
} = await supabase.auth.getSession();
if (session) init();

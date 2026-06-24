import { supabase } from "./supabaseClient.js";
import { toast, formatTHB, todayBangkok, monthRange } from "./ui.js";

// --- DOM refs ---
const listEl = document.getElementById("budget-list");
const filterMonth = document.getElementById("budget-filter-month");
const btnAdd = document.getElementById("btn-add-budget");

const modalEl = document.getElementById("budget-modal");
const modal = new bootstrap.Modal(modalEl);
const form = document.getElementById("budget-form");
const modalTitle = document.getElementById("budget-modal-title");
const fldId = document.getElementById("budget-id");
const fldCategory = document.getElementById("budget-category");
const fldAmount = document.getElementById("budget-amount");
const fldMonth = document.getElementById("budget-month");

let budgets = [];
let expenseCats = [];

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ใช้ไปเท่าไหร่ของเดือนนั้น แยกตามหมวด + รวม
async function loadSpent(ym) {
  const { start, end } = monthRange(ym);
  const { data } = await supabase
    .from("transactions")
    .select("category_id, amount")
    .eq("type", "expense")
    .gte("txn_date", start)
    .lte("txn_date", end);
  const byCat = {};
  let total = 0;
  for (const t of data ?? []) {
    byCat[t.category_id] = (byCat[t.category_id] ?? 0) + Number(t.amount);
    total += Number(t.amount);
  }
  return { byCat, total };
}

async function load() {
  const ym = filterMonth.value || todayBangkok().slice(0, 7);
  const periodStart = `${ym}-01`;
  const [{ data, error }, spent, { data: cats }] = await Promise.all([
    supabase
      .from("budgets")
      .select("id, category_id, amount, category:categories(name)")
      .eq("period_type", "month")
      .eq("period_start", periodStart)
      .order("category_id", { nullsFirst: true }),
    loadSpent(ym),
    supabase.from("categories").select("id, name").eq("type", "expense").order("sort_order"),
  ]);
  if (error) return toast("error", "โหลดงบไม่สำเร็จ: " + error.message);

  budgets = data ?? [];
  expenseCats = cats ?? [];

  if (!budgets.length) {
    listEl.innerHTML = `<p class="text-muted mb-0">ยังไม่มีงบของเดือนนี้ — กด "+ ตั้งงบ"</p>`;
    return;
  }
  listEl.innerHTML = budgets.map((b) => renderRow(b, spent)).join("");
}

function renderRow(b, spent) {
  const overall = !b.category_id;
  const name = overall ? "รวมทุกหมวด" : b.category?.name ?? "ไม่ระบุ";
  const used = overall ? spent.total : spent.byCat[b.category_id] || 0;
  const budget = Number(b.amount);
  const ratio = budget > 0 ? used / budget : 0;
  let color, icon;
  if (ratio >= 1) { color = "bg-danger"; icon = "🔴"; }
  else if (ratio >= 0.8) { color = "bg-warning"; icon = "⚠️"; }
  else if (ratio >= 0.5) { color = "bg-info"; icon = "🟡"; }
  else { color = "bg-success"; icon = "🟢"; }
  const pct = Math.round(ratio * 100);

  return `<div class="mb-3">
    <div class="d-flex justify-content-between align-items-center small mb-1">
      <span>${icon} <span class="${overall ? "fw-semibold" : ""}">${escapeHtml(name)}</span> <span class="text-muted">${pct}%</span></span>
      <span class="d-flex align-items-center gap-2">
        <span class="${used > budget ? "text-danger fw-semibold" : ""}">${formatTHB(used)} / ${formatTHB(budget)}</span>
        <button class="btn btn-sm btn-outline-secondary py-0" data-edit="${b.id}">แก้</button>
        <button class="btn btn-sm btn-outline-danger py-0" data-del="${b.id}">ลบ</button>
      </span>
    </div>
    <div class="progress" style="height: 8px;">
      <div class="progress-bar ${color}" style="width: ${Math.min(100, ratio * 100)}%"></div>
    </div>
  </div>`;
}

function fillCategoryOptions(selectedId = "") {
  fldCategory.innerHTML =
    '<option value="">รวมทุกหมวด (ทั้งเดือน)</option>' +
    expenseCats
      .map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${escapeHtml(c.name)}</option>`)
      .join("");
}

function openAdd() {
  form.reset();
  fldId.value = "";
  modalTitle.textContent = "ตั้งงบ";
  fillCategoryOptions();
  fldMonth.value = filterMonth.value || todayBangkok().slice(0, 7);
  modal.show();
}

function openEdit(id) {
  const b = budgets.find((x) => x.id === id);
  if (!b) return;
  form.reset();
  fldId.value = b.id;
  modalTitle.textContent = "แก้ไขงบ";
  fillCategoryOptions(b.category_id ?? "");
  fldAmount.value = b.amount;
  fldMonth.value = (filterMonth.value || todayBangkok().slice(0, 7));
  modal.show();
}

async function confirmDelete(id) {
  const res = await Swal.fire({
    title: "ลบงบนี้?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ลบ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc3545",
  });
  if (!res.isConfirmed) return;
  const { error } = await supabase.from("budgets").delete().eq("id", id);
  if (error) return toast("error", "ลบไม่สำเร็จ: " + error.message);
  toast("success", "ลบแล้ว");
  load();
}

// --- events ---
btnAdd.addEventListener("click", openAdd);
filterMonth.addEventListener("change", load);

listEl.addEventListener("click", (e) => {
  const editId = e.target.closest("[data-edit]")?.dataset.edit;
  const delId = e.target.closest("[data-del]")?.dataset.del;
  if (editId) openEdit(editId);
  if (delId) confirmDelete(delId);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    category_id: fldCategory.value || null,
    amount: Number(fldAmount.value),
    period_type: "month",
    period_start: `${fldMonth.value}-01`,
  };
  const id = fldId.value;
  const btn = form.querySelector("button[type=submit]");

  btn.disabled = true;
  const { error } = id
    ? await supabase.from("budgets").update(payload).eq("id", id)
    : await supabase.from("budgets").insert(payload);
  btn.disabled = false;

  if (error) {
    // 23505 = ซ้ำ (หมวด+เดือนนี้มีงบอยู่แล้ว)
    const msg = error.code === "23505" ? "งบของหมวดนี้ในเดือนนี้มีอยู่แล้ว — แก้ที่รายการเดิม" : error.message;
    return toast("error", "บันทึกไม่สำเร็จ: " + msg);
  }
  modal.hide();
  toast("success", id ? "แก้ไขแล้ว" : "ตั้งงบแล้ว");
  filterMonth.value = fldMonth.value; // เด้งไปเดือนที่เพิ่งตั้ง
  load();
});

// โหลดเมื่อเปิดแท็บงบประมาณ (lazy)
document.addEventListener("view:change", (e) => {
  if (e.detail.view === "budgets") load();
});
document.addEventListener("auth:login", () => {
  filterMonth.value = todayBangkok().slice(0, 7);
});
document.addEventListener("auth:logout", () => {
  listEl.innerHTML = "";
});

filterMonth.value = todayBangkok().slice(0, 7);

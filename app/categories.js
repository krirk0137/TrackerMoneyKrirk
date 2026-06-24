import { supabase } from "./supabaseClient.js";
import { toast, formatTHB } from "./ui.js";

// --- DOM refs ---
const incomeList = document.getElementById("cat-income-list");
const expenseList = document.getElementById("cat-expense-list");
const btnAdd = document.getElementById("btn-add-cat");

const modalEl = document.getElementById("cat-modal");
const modal = new bootstrap.Modal(modalEl);
const form = document.getElementById("cat-form");
const modalTitle = document.getElementById("cat-modal-title");
const fldId = document.getElementById("cat-id");
const fldName = document.getElementById("cat-name");
const fldBudget = document.getElementById("cat-budget");
const fldParent = document.getElementById("cat-parent");

let cats = [];

const selectedType = () => document.querySelector("input[name=cat-type]:checked").value;
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- data ---
async function load() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, type, sort_order, monthly_budget, parent_id")
    .order("sort_order")
    .order("name");
  if (error) return toast("error", "โหลดหมวดหมู่ไม่สำเร็จ: " + error.message);
  cats = data ?? [];
  renderList(incomeList, cats.filter((c) => c.type === "income"));
  renderList(expenseList, cats.filter((c) => c.type === "expense"));
}

function itemHtml(c, isChild) {
  const budget = c.monthly_budget
    ? `<span class="badge bg-light text-secondary ms-2">งบ ${formatTHB(c.monthly_budget)}</span>`
    : "";
  return `<li class="list-group-item d-flex justify-content-between align-items-center ${isChild ? "ps-4" : ""}">
    <span>${isChild ? '<span class="text-muted">↳ </span>' : ""}${escapeHtml(c.name)}${budget}</span>
    <span class="text-nowrap">
      <button class="btn btn-sm btn-outline-secondary" data-edit="${c.id}">แก้</button>
      <button class="btn btn-sm btn-outline-danger" data-del="${c.id}">ลบ</button>
    </span>
  </li>`;
}

// แสดงเป็นลำดับชั้น: หมวดหลักตามด้วยหมวดย่อยของมัน (เยื้องเข้า)
function renderList(el, list) {
  if (!list.length) {
    el.innerHTML = `<li class="list-group-item text-muted">ยังไม่มีหมวดหมู่</li>`;
    return;
  }
  const tops = list.filter((c) => !c.parent_id);
  const childrenOf = (pid) => list.filter((c) => c.parent_id === pid);
  let html = tops.map((c) => itemHtml(c, false) + childrenOf(c.id).map((ch) => itemHtml(ch, true)).join("")).join("");
  // หมวดย่อยที่หมวดแม่ถูกลบ/คนละ type (กันตกหล่น) — แสดงท้ายสุด
  const orphans = list.filter((c) => c.parent_id && !tops.some((t) => t.id === c.parent_id));
  html += orphans.map((c) => itemHtml(c, true)).join("");
  el.innerHTML = html;
}

// ตัวเลือก "หมวดแม่" = หมวดหลัก (parent_id ว่าง) ประเภทเดียวกัน ยกเว้นตัวเอง
function fillParentOptions(type, excludeId = "", selectedId = "") {
  fldParent.innerHTML =
    '<option value="">— ไม่มี (หมวดหลัก) —</option>' +
    cats
      .filter((c) => c.type === type && !c.parent_id && c.id !== excludeId)
      .map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${escapeHtml(c.name)}</option>`)
      .join("");
}

// --- modal ---
function openAdd() {
  form.reset();
  fldId.value = "";
  modalTitle.textContent = "เพิ่มหมวดหมู่";
  document.getElementById("cat-type-expense").checked = true;
  fillParentOptions("expense");
  modal.show();
}

function openEdit(id) {
  const c = cats.find((x) => x.id === id);
  if (!c) return;
  form.reset();
  fldId.value = c.id;
  modalTitle.textContent = "แก้ไขหมวดหมู่";
  fldName.value = c.name;
  fldBudget.value = c.monthly_budget ?? "";
  document.getElementById(c.type === "income" ? "cat-type-income" : "cat-type-expense").checked = true;
  fillParentOptions(c.type, c.id, c.parent_id ?? "");
  modal.show();
}

async function confirmDelete(id) {
  const c = cats.find((x) => x.id === id);

  // นับจำนวน transaction ที่อ้างอิงหมวดนี้ (head:true = ไม่ดึงแถว เอาแค่ count)
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  const used = count ?? 0;
  const children = cats.filter((x) => x.parent_id === id).length;

  const parts = [];
  if (children > 0) parts.push(`มีหมวดย่อย ${children} หมวด — จะถูกลบไปด้วย`);
  if (used > 0) parts.push(`มี ${used} รายการใช้หมวดนี้ — จะกลายเป็น "ไม่ระบุหมวด"`);

  const res = await Swal.fire({
    title: `ลบหมวด "${c?.name ?? ""}"?`,
    text: parts.length ? parts.join(" · ") : "ลบแล้วกู้คืนไม่ได้",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ลบ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc3545",
  });
  if (!res.isConfirmed) return;

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return toast("error", "ลบไม่สำเร็จ: " + error.message);
  toast("success", "ลบแล้ว");
  await load();
  document.dispatchEvent(new CustomEvent("categories:changed"));
}

// --- events ---
btnAdd.addEventListener("click", openAdd);

document.querySelectorAll("input[name=cat-type]").forEach((r) =>
  r.addEventListener("change", () => fillParentOptions(selectedType()))
);

[incomeList, expenseList].forEach((el) =>
  el.addEventListener("click", (e) => {
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    const delId = e.target.closest("[data-del]")?.dataset.del;
    if (editId) openEdit(editId);
    if (delId) confirmDelete(delId);
  })
);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = fldId.value;
  const parentId = fldParent.value || null;
  // หมวดที่มีหมวดย่อยอยู่ ห้ามย้ายไปเป็นหมวดย่อยเอง (กันลึกเกิน 2 ชั้น/วน)
  if (id && parentId && cats.some((c) => c.parent_id === id)) {
    return toast("error", "หมวดนี้มีหมวดย่อยอยู่ — ย้ายเป็นหมวดย่อยไม่ได้");
  }
  const payload = {
    name: fldName.value.trim(),
    type: selectedType(),
    monthly_budget: fldBudget.value === "" ? null : Number(fldBudget.value),
    parent_id: parentId,
  };
  if (!payload.name) return;
  const btn = form.querySelector("button[type=submit]");

  btn.disabled = true;
  const { error } = id
    ? await supabase.from("categories").update(payload).eq("id", id)
    : await supabase.from("categories").insert(payload);
  btn.disabled = false;

  if (error) return toast("error", "บันทึกไม่สำเร็จ: " + error.message);
  modal.hide();
  toast("success", id ? "แก้ไขแล้ว" : "เพิ่มหมวดหมู่แล้ว");
  await load();
  document.dispatchEvent(new CustomEvent("categories:changed"));
});

// โหลด/รีเฟรชทุกครั้งที่เปิดแท็บหมวดหมู่
document.addEventListener("view:change", (e) => {
  if (e.detail.view === "categories") load();
});
document.addEventListener("auth:logout", () => {
  incomeList.innerHTML = "";
  expenseList.innerHTML = "";
});

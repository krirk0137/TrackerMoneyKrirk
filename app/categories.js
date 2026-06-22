import { supabase } from "./supabaseClient.js";
import { toast } from "./ui.js";

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

let cats = [];

const selectedType = () => document.querySelector("input[name=cat-type]:checked").value;
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- data ---
async function load() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, type, sort_order")
    .order("sort_order")
    .order("name");
  if (error) return toast("error", "โหลดหมวดหมู่ไม่สำเร็จ: " + error.message);
  cats = data ?? [];
  renderList(incomeList, cats.filter((c) => c.type === "income"));
  renderList(expenseList, cats.filter((c) => c.type === "expense"));
}

function renderList(el, list) {
  if (!list.length) {
    el.innerHTML = `<li class="list-group-item text-muted">ยังไม่มีหมวดหมู่</li>`;
    return;
  }
  el.innerHTML = list
    .map(
      (c) => `<li class="list-group-item d-flex justify-content-between align-items-center">
        <span>${escapeHtml(c.name)}</span>
        <span class="text-nowrap">
          <button class="btn btn-sm btn-outline-secondary" data-edit="${c.id}">แก้</button>
          <button class="btn btn-sm btn-outline-danger" data-del="${c.id}">ลบ</button>
        </span>
      </li>`
    )
    .join("");
}

// --- modal ---
function openAdd() {
  form.reset();
  fldId.value = "";
  modalTitle.textContent = "เพิ่มหมวดหมู่";
  document.getElementById("cat-type-expense").checked = true;
  modal.show();
}

function openEdit(id) {
  const c = cats.find((x) => x.id === id);
  if (!c) return;
  form.reset();
  fldId.value = c.id;
  modalTitle.textContent = "แก้ไขหมวดหมู่";
  fldName.value = c.name;
  document.getElementById(c.type === "income" ? "cat-type-income" : "cat-type-expense").checked = true;
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

  const res = await Swal.fire({
    title: `ลบหมวด "${c?.name ?? ""}"?`,
    text:
      used > 0
        ? `มี ${used} รายการใช้หมวดนี้อยู่ — ลบแล้วรายการเหล่านั้นจะกลายเป็น "ไม่ระบุหมวด"`
        : "ลบแล้วกู้คืนไม่ได้",
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
  const payload = { name: fldName.value.trim(), type: selectedType() };
  if (!payload.name) return;
  const id = fldId.value;
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

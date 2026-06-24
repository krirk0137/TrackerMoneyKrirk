import { supabase } from "./supabaseClient.js";
import { toast, formatTHB } from "./ui.js";

// --- DOM refs ---
const listEl = document.getElementById("account-list");
const networthEl = document.getElementById("acc-networth");
const btnAdd = document.getElementById("btn-add-account");

const modalEl = document.getElementById("account-modal");
const modal = new bootstrap.Modal(modalEl);
const form = document.getElementById("account-form");
const modalTitle = document.getElementById("account-modal-title");
const fldId = document.getElementById("account-id");
const fldName = document.getElementById("account-name");
const fldType = document.getElementById("account-type");
const fldInitial = document.getElementById("account-initial");

const TYPE_TH = {
  cash: "เงินสด", bank: "ธนาคาร", credit_card: "บัตรเครดิต",
  e_wallet: "e-Wallet", savings: "เงินออม", investment: "ลงทุน", other: "อื่นๆ",
};

let accounts = []; // จาก view account_balances (มี current_balance)

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- data ---
async function load() {
  const { data, error } = await supabase
    .from("account_balances")
    .select("account_id, name, type, is_archived, initial_balance, current_balance, sort_order")
    .order("sort_order")
    .order("name");
  if (error) return toast("error", "โหลดบัญชีไม่สำเร็จ: " + error.message);

  accounts = data ?? [];
  const active = accounts.filter((a) => !a.is_archived);
  const archived = accounts.filter((a) => a.is_archived);

  const networth = active.reduce((s, a) => s + Number(a.current_balance), 0);
  networthEl.textContent = formatTHB(networth);
  networthEl.classList.toggle("text-danger", networth < 0);

  if (!accounts.length) {
    listEl.innerHTML = `<div class="col-12"><p class="text-muted">ยังไม่มีบัญชี — กด "+ เพิ่มบัญชี" เพื่อเริ่มต้น</p></div>`;
    return;
  }
  listEl.innerHTML = active.map((a) => renderCard(a, false)).join("") + archived.map((a) => renderCard(a, true)).join("");
}

function renderCard(a, isArchived) {
  const bal = Number(a.current_balance);
  return `<div class="col-12 col-md-6 col-lg-4">
    <div class="card h-100 ${isArchived ? "opacity-50" : ""}"><div class="card-body">
      <div class="d-flex justify-content-between align-items-start mb-1">
        <h3 class="h6 mb-0">${escapeHtml(a.name)}</h3>
        <span class="badge bg-secondary-subtle text-secondary">${TYPE_TH[a.type] ?? a.type}</span>
      </div>
      <div class="fs-5 fw-semibold ${bal < 0 ? "text-danger" : ""}">${formatTHB(bal)}</div>
      <div class="small text-muted">ตั้งต้น ${formatTHB(a.initial_balance)}</div>
      <div class="mt-2 d-flex gap-1">
        ${isArchived
          ? `<button class="btn btn-sm btn-outline-success flex-fill" data-unarchive="${a.account_id}">คืนค่า</button>`
          : `<button class="btn btn-sm btn-outline-secondary flex-fill" data-edit="${a.account_id}">แก้</button>`}
        <button class="btn btn-sm btn-outline-danger" data-del="${a.account_id}">ลบ</button>
      </div>
    </div></div>
  </div>`;
}

// --- modal ---
function openAdd() {
  form.reset();
  fldId.value = "";
  fldType.value = "cash";
  fldInitial.value = 0;
  modalTitle.textContent = "เพิ่มบัญชี";
  modal.show();
}

function openEdit(id) {
  const a = accounts.find((x) => x.account_id === id);
  if (!a) return;
  form.reset();
  fldId.value = a.account_id;
  modalTitle.textContent = "แก้ไขบัญชี";
  fldName.value = a.name;
  fldType.value = a.type;
  fldInitial.value = a.initial_balance;
  modal.show();
}

async function setArchived(id, value) {
  const { error } = await supabase.from("accounts").update({ is_archived: value }).eq("id", id);
  if (error) return toast("error", "ไม่สำเร็จ: " + error.message);
  toast("success", value ? "ซ่อนบัญชีแล้ว" : "คืนค่าบัญชีแล้ว");
  load();
  document.dispatchEvent(new CustomEvent("accounts:changed"));
}

async function confirmDelete(id) {
  const a = accounts.find((x) => x.account_id === id);
  // บัญชีที่มีรายการอ้างอิงอยู่ ลบไม่ได้ (FK on delete restrict) → เสนอซ่อนแทน
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .or(`account_id.eq.${id},to_account_id.eq.${id}`);
  const used = count ?? 0;

  if (used > 0) {
    const res = await Swal.fire({
      title: `บัญชี "${a?.name ?? ""}" มี ${used} รายการ`,
      text: "ลบไม่ได้เพราะมีรายการอ้างอิงอยู่ — ซ่อนบัญชี (archive) แทนไหม? บัญชีจะหายจากตัวเลือก แต่ยอดเก่ายังอยู่",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "ซ่อนบัญชี",
      cancelButtonText: "ยกเลิก",
    });
    if (res.isConfirmed) setArchived(id, true);
    return;
  }

  const res = await Swal.fire({
    title: `ลบบัญชี "${a?.name ?? ""}"?`,
    text: "ลบแล้วกู้คืนไม่ได้",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ลบ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc3545",
  });
  if (!res.isConfirmed) return;
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) return toast("error", "ลบไม่สำเร็จ: " + error.message);
  toast("success", "ลบแล้ว");
  load();
  document.dispatchEvent(new CustomEvent("accounts:changed"));
}

// --- events ---
btnAdd.addEventListener("click", openAdd);

listEl.addEventListener("click", (e) => {
  const editId = e.target.closest("[data-edit]")?.dataset.edit;
  const delId = e.target.closest("[data-del]")?.dataset.del;
  const unId = e.target.closest("[data-unarchive]")?.dataset.unarchive;
  if (editId) openEdit(editId);
  if (delId) confirmDelete(delId);
  if (unId) setArchived(unId, false);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: fldName.value.trim(),
    type: fldType.value,
    initial_balance: fldInitial.value === "" ? 0 : Number(fldInitial.value),
  };
  if (!payload.name) return;
  const id = fldId.value;
  const btn = form.querySelector("button[type=submit]");

  btn.disabled = true;
  const { error } = id
    ? await supabase.from("accounts").update(payload).eq("id", id)
    : await supabase.from("accounts").insert(payload);
  btn.disabled = false;

  if (error) return toast("error", "บันทึกไม่สำเร็จ: " + error.message);
  modal.hide();
  toast("success", id ? "แก้ไขแล้ว" : "เพิ่มบัญชีแล้ว");
  load();
  document.dispatchEvent(new CustomEvent("accounts:changed"));
});

// โหลดเมื่อเปิดแท็บบัญชี (lazy + ยอดสดเสมอ)
document.addEventListener("view:change", (e) => {
  if (e.detail.view === "accounts") load();
});
document.addEventListener("auth:logout", () => {
  listEl.innerHTML = "";
  networthEl.textContent = "฿0.00";
});

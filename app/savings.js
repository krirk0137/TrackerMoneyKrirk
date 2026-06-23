import { supabase } from "./supabaseClient.js";
import { toast, formatTHB, todayBangkok } from "./ui.js";

// --- DOM refs ---
const listEl = document.getElementById("goal-list");
const btnAdd = document.getElementById("btn-add-goal");

const modalEl = document.getElementById("goal-modal");
const modal = new bootstrap.Modal(modalEl);
const form = document.getElementById("goal-form");
const modalTitle = document.getElementById("goal-modal-title");
const fldId = document.getElementById("goal-id");
const fldName = document.getElementById("goal-name");
const fldTarget = document.getElementById("goal-target");
const fldCurrent = document.getElementById("goal-current");
const fldDate = document.getElementById("goal-date");

let goals = [];

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// จำนวนวันจากวันนี้ (Asia/Bangkok) ถึง target_date — บวก=เหลืออีก, ลบ=เลยมาแล้ว
function daysLeft(targetDate) {
  const MS = 86400000;
  return Math.round((Date.parse(targetDate) - Date.parse(todayBangkok())) / MS);
}

// --- data ---
async function load() {
  const { data, error } = await supabase
    .from("savings_goals")
    .select("id, name, target_amount, current_amount, target_date")
    .order("created_at", { ascending: false });
  if (error) return toast("error", "โหลดเป้าหมายไม่สำเร็จ: " + error.message);

  goals = data ?? [];
  if (!goals.length) {
    listEl.innerHTML = `<div class="col-12"><p class="text-muted">ยังไม่มีเป้าหมายออมเงิน — กด "+ เพิ่มเป้าหมาย" เพื่อเริ่มต้น</p></div>`;
    return;
  }
  listEl.innerHTML = goals.map(renderCard).join("");
}

function renderCard(g) {
  const target = Number(g.target_amount);
  const current = Number(g.current_amount);
  const ratio = target > 0 ? current / target : 0;
  const pct = Math.round(ratio * 100);
  const done = current >= target;
  const color = done ? "bg-success" : ratio >= 0.5 ? "bg-info" : "bg-primary";

  let dateInfo = "";
  if (g.target_date) {
    const dl = daysLeft(g.target_date);
    dateInfo = done
      ? ` · 🎉 ถึงเป้าแล้ว`
      : dl >= 0
      ? ` · ⏳ เหลือ ${dl} วัน`
      : ` · ⚠️ เลยกำหนด ${-dl} วัน`;
  } else if (done) {
    dateInfo = ` · 🎉 ถึงเป้าแล้ว`;
  }

  return `<div class="col-12 col-md-6 col-lg-4">
    <div class="card h-100"><div class="card-body">
      <div class="d-flex justify-content-between align-items-start">
        <h3 class="h6 mb-1">${escapeHtml(g.name)} ${done ? "✅" : ""}</h3>
      </div>
      <div class="small text-muted mb-2">${formatTHB(current)} / ${formatTHB(target)} <span class="fw-semibold">(${pct}%)</span>${dateInfo}</div>
      <div class="progress mb-3" style="height: 10px;">
        <div class="progress-bar ${color}" style="width: ${Math.min(100, ratio * 100)}%"></div>
      </div>
      <div class="d-flex gap-1">
        <button class="btn btn-sm btn-success flex-fill" data-add="${g.id}">+ เพิ่มเงิน</button>
        <button class="btn btn-sm btn-outline-secondary" data-edit="${g.id}">แก้</button>
        <button class="btn btn-sm btn-outline-danger" data-del="${g.id}">ลบ</button>
      </div>
    </div></div>
  </div>`;
}

// --- modal เพิ่ม/แก้ไข ---
function openAdd() {
  form.reset();
  fldId.value = "";
  fldCurrent.value = 0;
  modalTitle.textContent = "เพิ่มเป้าหมาย";
  modal.show();
}

function openEdit(id) {
  const g = goals.find((x) => x.id === id);
  if (!g) return;
  form.reset();
  fldId.value = g.id;
  modalTitle.textContent = "แก้ไขเป้าหมาย";
  fldName.value = g.name;
  fldTarget.value = g.target_amount;
  fldCurrent.value = g.current_amount;
  fldDate.value = g.target_date ?? "";
  modal.show();
}

// เพิ่มเงินเข้าเป้าหมายแบบเร็ว (prompt จำนวนที่ออมเพิ่ม)
async function addMoney(id) {
  const g = goals.find((x) => x.id === id);
  if (!g) return;
  const res = await Swal.fire({
    title: `เพิ่มเงินเข้า "${g.name}"`,
    input: "number",
    inputLabel: "จำนวนที่ออมเพิ่ม (บาท)",
    inputAttributes: { min: "0.01", step: "0.01" },
    showCancelButton: true,
    confirmButtonText: "เพิ่ม",
    cancelButtonText: "ยกเลิก",
    inputValidator: (v) => (!v || Number(v) <= 0 ? "ใส่จำนวนที่มากกว่า 0" : undefined),
  });
  if (!res.isConfirmed) return;
  const next = Number(g.current_amount) + Number(res.value);
  const { error } = await supabase.from("savings_goals").update({ current_amount: next }).eq("id", id);
  if (error) return toast("error", "บันทึกไม่สำเร็จ: " + error.message);
  toast("success", `ออมเพิ่ม ${formatTHB(res.value)}`);
  load();
}

async function confirmDelete(id) {
  const g = goals.find((x) => x.id === id);
  const res = await Swal.fire({
    title: `ลบเป้าหมาย "${g?.name ?? ""}"?`,
    text: "ลบแล้วกู้คืนไม่ได้",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ลบ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc3545",
  });
  if (!res.isConfirmed) return;
  const { error } = await supabase.from("savings_goals").delete().eq("id", id);
  if (error) return toast("error", "ลบไม่สำเร็จ: " + error.message);
  toast("success", "ลบแล้ว");
  load();
}

// --- events ---
btnAdd.addEventListener("click", openAdd);

listEl.addEventListener("click", (e) => {
  const addId = e.target.closest("[data-add]")?.dataset.add;
  const editId = e.target.closest("[data-edit]")?.dataset.edit;
  const delId = e.target.closest("[data-del]")?.dataset.del;
  if (addId) addMoney(addId);
  if (editId) openEdit(editId);
  if (delId) confirmDelete(delId);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: fldName.value.trim(),
    target_amount: Number(fldTarget.value),
    current_amount: fldCurrent.value === "" ? 0 : Number(fldCurrent.value),
    target_date: fldDate.value || null,
  };
  if (!payload.name) return;
  const id = fldId.value;
  const btn = form.querySelector("button[type=submit]");

  btn.disabled = true;
  const { error } = id
    ? await supabase.from("savings_goals").update(payload).eq("id", id)
    : await supabase.from("savings_goals").insert(payload);
  btn.disabled = false;

  if (error) return toast("error", "บันทึกไม่สำเร็จ: " + error.message);
  modal.hide();
  toast("success", id ? "แก้ไขแล้ว" : "เพิ่มเป้าหมายแล้ว");
  load();
});

// โหลดเมื่อเปิดแท็บออมเงิน (lazy)
document.addEventListener("view:change", (e) => {
  if (e.detail.view === "savings") load();
});
document.addEventListener("auth:logout", () => {
  listEl.innerHTML = "";
});

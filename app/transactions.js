import { supabase } from "./supabaseClient.js";
import { toast, formatTHB, todayBangkok, monthRange, downloadFile } from "./ui.js";

// --- DOM refs ---
const tbody = document.getElementById("txn-tbody");
const totalsCell = document.getElementById("txn-totals");
const fMonth = document.getElementById("f-month");
const fType = document.getElementById("f-type");
const fCategory = document.getElementById("f-category");
const fSearch = document.getElementById("f-search");
const fClear = document.getElementById("f-clear");
const btnAdd = document.getElementById("btn-add-txn");
const btnExport = document.getElementById("btn-export");

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
const fldAccount = document.getElementById("txn-account");
const fldToAccount = document.getElementById("txn-to-account");
const accountLabel = document.getElementById("txn-account-label");
const toAccountWrap = document.getElementById("txn-to-account-wrap");
const categoryWrap = document.getElementById("txn-category-wrap");
const paymentWrap = document.getElementById("txn-payment-wrap");

// modal "เพิ่มหลายวัน"
const btnAddMulti = document.getElementById("btn-add-multi");
const multiModalEl = document.getElementById("multi-modal");
const multiModal = new bootstrap.Modal(multiModalEl);
const multiForm = document.getElementById("multi-form");
const mAmount = document.getElementById("multi-amount");
const mMonth = document.getElementById("multi-month");
const mCategory = document.getElementById("multi-category");
const mPayment = document.getElementById("multi-payment");
const mNote = document.getElementById("multi-note");
const mDays = document.getElementById("multi-days");
const mCount = document.getElementById("multi-count");
const mAccount = document.getElementById("multi-account");

// แท็ก
const txnTags = document.getElementById("txn-tags");
const txnTagNew = document.getElementById("txn-tag-new");
const txnTagAdd = document.getElementById("txn-tag-add");
const fTag = document.getElementById("f-tag");
const tagModal = new bootstrap.Modal(document.getElementById("tag-modal"));
const tagManageList = document.getElementById("tag-manage-list");
const fTagManage = document.getElementById("f-tag-manage");

const TH_TYPE = { income: "รายรับ", expense: "รายจ่าย", transfer: "โอน" };

let categories = [];
let accounts = [];
let tags = [];
let selectedTagIds = new Set(); // แท็กที่เลือกในฟอร์มรายการปัจจุบัน
let currentRows = [];

// --- helpers ---
const selectedType = () => document.querySelector("input[name=txn-type]:checked").value;

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- data ---
async function loadCategories() {
  const { data, error } = await supabase.from("categories").select("id, name, type, parent_id").order("sort_order");
  if (error) return toast("error", "โหลดหมวดหมู่ไม่สำเร็จ: " + error.message);
  categories = data ?? [];
  fCategory.innerHTML =
    '<option value="">ทั้งหมด</option>' +
    categories
      .map((c) => `<option value="${c.id}">${c.parent_id ? "↳ " : ""}${escapeHtml(c.name)} (${TH_TYPE[c.type]})</option>`)
      .join("");
}

// เรียงหมวดของ type แบบลำดับชั้น: หมวดหลักตามด้วยหมวดย่อยของมัน
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

// โหลดบัญชี (ไม่เอาที่ซ่อนไว้) ไว้เติม dropdown ในฟอร์ม
async function loadAccounts() {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, type")
    .eq("is_archived", false)
    .order("sort_order")
    .order("name");
  if (error) return toast("error", "โหลดบัญชีไม่สำเร็จ: " + error.message);
  accounts = data ?? [];
  const opts = accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  fldAccount.innerHTML = opts;
  fldToAccount.innerHTML = opts;
  mAccount.innerHTML = opts;
}

// สลับฟิลด์ในฟอร์มตามประเภท: โอน → ซ่อนหมวด/วิธีจ่าย, โชว์บัญชีปลายทาง
function applyTypeUI(type) {
  const transfer = type === "transfer";
  accountLabel.textContent = transfer ? "จากบัญชี" : "บัญชี";
  toAccountWrap.classList.toggle("d-none", !transfer);
  categoryWrap.classList.toggle("d-none", transfer);
  paymentWrap.classList.toggle("d-none", transfer);
  if (!transfer) fillModalCategories(type, fldCategory.value);
}

// --- แท็ก ---
async function loadTags() {
  const { data, error } = await supabase.from("tags").select("id, name").order("name");
  if (error) return toast("error", "โหลดแท็กไม่สำเร็จ: " + error.message);
  tags = data ?? [];
  fTag.innerHTML = '<option value="">ทั้งหมด</option>' + tags.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  renderTagChips();
}

function renderTagChips() {
  if (!tags.length) {
    txnTags.innerHTML = '<span class="text-muted small">ยังไม่มีแท็ก — พิมพ์ด้านล่างเพื่อสร้าง</span>';
    return;
  }
  txnTags.innerHTML = tags
    .map((t) => {
      const on = selectedTagIds.has(t.id);
      return `<button type="button" class="btn btn-sm ${on ? "btn-primary" : "btn-outline-secondary"}" data-tag="${t.id}">${escapeHtml(t.name)}</button>`;
    })
    .join("");
}

async function addNewTag() {
  const name = txnTagNew.value.trim();
  if (!name) return;
  const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    selectedTagIds.add(existing.id);
    txnTagNew.value = "";
    return renderTagChips();
  }
  const { data, error } = await supabase.from("tags").insert({ name }).select("id, name").single();
  if (error) return toast("error", "เพิ่มแท็กไม่สำเร็จ: " + error.message);
  txnTagNew.value = "";
  await loadTags();
  selectedTagIds.add(data.id);
  renderTagChips();
}

// ซิงก์แท็กของรายการ: ลบของเดิมทั้งหมดแล้วใส่ที่เลือก (N น้อย ทำตรง ๆ ถูกต้องสุด)
async function syncTransactionTags(txnId) {
  await supabase.from("transaction_tags").delete().eq("transaction_id", txnId);
  const ids = [...selectedTagIds];
  if (!ids.length) return;
  const { error } = await supabase.from("transaction_tags").insert(ids.map((tag_id) => ({ transaction_id: txnId, tag_id })));
  if (error) toast("error", "บันทึกแท็กไม่สำเร็จ: " + error.message);
}

function renderTagManage() {
  if (!tags.length) {
    tagManageList.innerHTML = '<li class="list-group-item text-muted">ยังไม่มีแท็ก</li>';
    return;
  }
  tagManageList.innerHTML = tags
    .map(
      (t) => `<li class="list-group-item d-flex justify-content-between align-items-center">
        <span>${escapeHtml(t.name)}</span>
        <span class="text-nowrap">
          <button class="btn btn-sm btn-outline-secondary" data-tag-rename="${t.id}">เปลี่ยนชื่อ</button>
          <button class="btn btn-sm btn-outline-danger" data-tag-del="${t.id}">ลบ</button>
        </span>
      </li>`
    )
    .join("");
}

async function loadTransactions() {
  // กรองตามแท็ก: หา transaction_id ที่ติดแท็กนั้นก่อน
  let tagFilterIds = null;
  if (fTag.value) {
    const { data: tt } = await supabase.from("transaction_tags").select("transaction_id").eq("tag_id", fTag.value);
    tagFilterIds = (tt ?? []).map((x) => x.transaction_id);
    if (!tagFilterIds.length) tagFilterIds = ["00000000-0000-0000-0000-000000000000"]; // ไม่มี → คืนว่าง
  }

  let q = supabase
    .from("transactions")
    .select(
      "id, type, amount, txn_date, note, payment_method, category_id, account_id, to_account_id, " +
        "category:categories(name), " +
        "account:accounts!transactions_account_id_fkey(name), " +
        "to_account:accounts!transactions_to_account_id_fkey(name), " +
        "transaction_tags(tag_id, tag:tags(name))"
    )
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (fMonth.value) {
    const { start, end } = monthRange(fMonth.value);
    q = q.gte("txn_date", start).lte("txn_date", end);
  }
  if (fType.value !== "all") q = q.eq("type", fType.value);
  if (fCategory.value) q = q.eq("category_id", fCategory.value);
  if (fSearch.value.trim()) q = q.ilike("note", `%${fSearch.value.trim()}%`);
  if (tagFilterIds) q = q.in("id", tagFilterIds);

  const { data, error } = await q;
  if (error) return toast("error", "โหลดรายการไม่สำเร็จ: " + error.message);
  currentRows = data ?? [];
  renderTable(currentRows);
}

function renderTable(rows) {
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">ไม่มีรายการ</td></tr>`;
    totalsCell.textContent = "";
    return;
  }

  const dash = '<span class="text-muted">—</span>';
  tbody.innerHTML = rows
    .map((r) => {
      const transfer = r.type === "transfer";
      const income = r.type === "income";
      const amtCls = transfer ? "text-info" : income ? "text-success" : "text-danger";
      const amtSign = transfer ? "" : income ? "+" : "−";
      const badge = transfer
        ? "bg-info-subtle text-info"
        : income
        ? "bg-success-subtle text-success"
        : "bg-danger-subtle text-danger";
      const acct = transfer
        ? `${escapeHtml(r.account?.name ?? "—")} → ${escapeHtml(r.to_account?.name ?? "—")}`
        : r.account?.name
        ? escapeHtml(r.account.name)
        : dash;
      const tagBadges = (r.transaction_tags ?? [])
        .map((tt) => `<span class="badge bg-secondary-subtle text-secondary ms-1">${escapeHtml(tt.tag?.name ?? "")}</span>`)
        .join("");
      return `<tr>
        <td class="text-nowrap">${r.txn_date}</td>
        <td><span class="badge ${badge}">${TH_TYPE[r.type]}</span></td>
        <td>${transfer ? dash : r.category?.name ? escapeHtml(r.category.name) : dash}</td>
        <td class="text-nowrap small">${acct}</td>
        <td class="text-end fw-semibold ${amtCls} text-nowrap">${amtSign}${formatTHB(r.amount)}</td>
        <td>${r.payment_method ? escapeHtml(r.payment_method) : dash}</td>
        <td>${r.note ? escapeHtml(r.note) : dash}${tagBadges}</td>
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
  if (!accounts.length) return toast("error", "เพิ่มบัญชีในแท็บ \"บัญชี\" ก่อนนะ");
  form.reset();
  fldId.value = "";
  modalTitle.textContent = "เพิ่มรายการ";
  document.getElementById("type-expense").checked = true;
  fldDate.value = todayBangkok();
  applyTypeUI("expense");
  selectedTagIds = new Set();
  txnTagNew.value = "";
  renderTagChips();
  modal.show();
}

function openEdit(id) {
  const r = currentRows.find((x) => x.id === id);
  if (!r) return;
  form.reset();
  fldId.value = r.id;
  modalTitle.textContent = "แก้ไขรายการ";
  const typeRadio = { income: "type-income", expense: "type-expense", transfer: "type-transfer" }[r.type];
  document.getElementById(typeRadio).checked = true;
  fldAmount.value = r.amount;
  fldDate.value = r.txn_date;
  fldPayment.value = r.payment_method ?? "";
  fldNote.value = r.note ?? "";
  fldAccount.value = r.account_id ?? "";
  fldToAccount.value = r.to_account_id ?? "";
  applyTypeUI(r.type);
  if (r.type !== "transfer") fillModalCategories(r.type, r.category_id ?? "");
  selectedTagIds = new Set((r.transaction_tags ?? []).map((tt) => tt.tag_id));
  txnTagNew.value = "";
  renderTagChips();
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

// --- export CSV (ตามตัวกรองปัจจุบัน) ---
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function exportCsv() {
  if (!currentRows.length) return toast("error", "ไม่มีรายการให้ export");
  const header = ["วันที่", "ประเภท", "หมวดหมู่", "บัญชี", "จำนวน", "วิธีจ่าย", "โน้ต"];
  const body = currentRows.map((r) => [
    r.txn_date,
    TH_TYPE[r.type],
    r.type === "transfer" ? "" : r.category?.name ?? "",
    r.type === "transfer" ? `${r.account?.name ?? ""} → ${r.to_account?.name ?? ""}` : r.account?.name ?? "",
    r.amount,
    r.payment_method ?? "",
    r.note ?? "",
  ]);
  const csv = [header, ...body].map((cols) => cols.map(csvCell).join(",")).join("\r\n");
  const bom = String.fromCharCode(0xfeff); // ให้ Excel อ่านภาษาไทยถูก
  downloadFile(`transactions-${fMonth.value || "all"}.csv`, bom + csv, "text/csv;charset=utf-8");
}

// --- เพิ่มหลายวันพร้อมกัน ---
const multiSelectedType = () => document.querySelector("input[name=multi-type]:checked").value;

function fillMultiCategories(type) {
  mCategory.innerHTML =
    '<option value="">— ไม่ระบุ —</option>' +
    orderedCategories(type)
      .map(({ c, child }) => `<option value="${c.id}">${child ? "↳ " : ""}${escapeHtml(c.name)}</option>`)
      .join("");
}

// วาดปุ่มวันที่ 1..31 ของเดือนที่เลือก — วันเกินจำนวนวันจริงของเดือนจะถูกปิด
function renderDays() {
  const ym = mMonth.value || todayBangkok().slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  mDays.innerHTML = Array.from({ length: 31 }, (_, i) => {
    const d = i + 1;
    const disabled = d > lastDay ? "disabled" : "";
    return `<button type="button" class="btn btn-sm btn-outline-secondary multi-day" data-day="${d}" ${disabled}>${d}</button>`;
  }).join("");
  updateMultiCount();
}

function selectedDays() {
  return [...mDays.querySelectorAll(".multi-day.active")].map((b) => Number(b.dataset.day));
}

function updateMultiCount() {
  const n = selectedDays().length;
  mCount.textContent = n ? `เลือกแล้ว ${n} วัน` : "ยังไม่เลือกวัน";
}

function openMultiAdd() {
  if (!accounts.length) return toast("error", "เพิ่มบัญชีในแท็บ \"บัญชี\" ก่อนนะ");
  multiForm.reset();
  document.getElementById("multi-type-expense").checked = true;
  mMonth.value = fMonth.value || todayBangkok().slice(0, 7);
  fillMultiCategories("expense");
  renderDays();
  multiModal.show();
}

mDays.addEventListener("click", (e) => {
  const btn = e.target.closest(".multi-day");
  if (!btn || btn.disabled) return;
  btn.classList.toggle("active");
  updateMultiCount();
});

document.getElementById("multi-all").addEventListener("click", () => {
  mDays.querySelectorAll(".multi-day:not([disabled])").forEach((b) => b.classList.add("active"));
  updateMultiCount();
});
document.getElementById("multi-none").addEventListener("click", () => {
  mDays.querySelectorAll(".multi-day").forEach((b) => b.classList.remove("active"));
  updateMultiCount();
});

document.querySelectorAll("input[name=multi-type]").forEach((radio) =>
  radio.addEventListener("change", () => fillMultiCategories(multiSelectedType()))
);
mMonth.addEventListener("change", renderDays);

multiForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const days = selectedDays();
  if (!days.length) return toast("error", "ยังไม่ได้เลือกวัน");
  if (!mAccount.value) return toast("error", "เลือกบัญชีก่อน");
  const ym = mMonth.value;
  const base = {
    type: multiSelectedType(),
    amount: Number(mAmount.value),
    account_id: mAccount.value,
    category_id: mCategory.value || null,
    payment_method: mPayment.value || null,
    note: mNote.value.trim() || null,
  };
  const payload = days.map((d) => ({ ...base, txn_date: `${ym}-${String(d).padStart(2, "0")}` }));
  const btn = multiForm.querySelector("button[type=submit]");

  btn.disabled = true;
  const { error } = await supabase.from("transactions").insert(payload);
  btn.disabled = false;

  if (error) return toast("error", "บันทึกไม่สำเร็จ: " + error.message);
  multiModal.hide();
  toast("success", `เพิ่ม ${days.length} รายการแล้ว`);
  loadTransactions();
});

// --- events ---
btnAdd.addEventListener("click", openAdd);
btnAddMulti.addEventListener("click", openMultiAdd);
btnExport.addEventListener("click", exportCsv);

document.querySelectorAll("input[name=txn-type]").forEach((radio) =>
  radio.addEventListener("change", () => applyTypeUI(selectedType()))
);

tbody.addEventListener("click", (e) => {
  const editId = e.target.closest("[data-edit]")?.dataset.edit;
  const delId = e.target.closest("[data-del]")?.dataset.del;
  if (editId) openEdit(editId);
  if (delId) confirmDelete(delId);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = selectedType();
  const transfer = type === "transfer";

  if (!fldAccount.value) return toast("error", "เลือกบัญชีก่อน");
  if (transfer) {
    if (!fldToAccount.value) return toast("error", "เลือกบัญชีปลายทาง");
    if (fldToAccount.value === fldAccount.value) return toast("error", "บัญชีต้นทาง/ปลายทางต้องคนละบัญชี");
  }

  const payload = {
    type,
    amount: Number(fldAmount.value),
    txn_date: fldDate.value,
    account_id: fldAccount.value,
    to_account_id: transfer ? fldToAccount.value : null,
    category_id: transfer ? null : fldCategory.value || null,
    payment_method: transfer ? null : fldPayment.value || null,
    note: fldNote.value.trim() || null,
  };
  const id = fldId.value;
  const btn = form.querySelector("button[type=submit]");

  btn.disabled = true;
  let error, txnId = id;
  if (id) {
    ({ error } = await supabase.from("transactions").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id));
  } else {
    const res = await supabase.from("transactions").insert(payload).select("id").single();
    error = res.error;
    txnId = res.data?.id;
  }
  if (!error && txnId) await syncTransactionTags(txnId);
  btn.disabled = false;

  if (error) return toast("error", "บันทึกไม่สำเร็จ: " + error.message);
  modal.hide();
  toast("success", id ? "แก้ไขแล้ว" : "เพิ่มรายการแล้ว");
  loadTransactions();
});

fType.addEventListener("change", loadTransactions);
fCategory.addEventListener("change", loadTransactions);
fMonth.addEventListener("change", loadTransactions);
fTag.addEventListener("change", loadTransactions);

let searchTimer;
fSearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadTransactions, 350);
});

fClear.addEventListener("click", () => {
  fMonth.value = todayBangkok().slice(0, 7);
  fType.value = "all";
  fCategory.value = "";
  fTag.value = "";
  fSearch.value = "";
  loadTransactions();
});

// --- แท็ก: เลือก/เพิ่ม/จัดการ ---
txnTags.addEventListener("click", (e) => {
  const id = e.target.closest("[data-tag]")?.dataset.tag;
  if (!id) return;
  if (selectedTagIds.has(id)) selectedTagIds.delete(id);
  else selectedTagIds.add(id);
  renderTagChips();
});
txnTagAdd.addEventListener("click", addNewTag);
txnTagNew.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addNewTag();
  }
});

fTagManage.addEventListener("click", () => {
  renderTagManage();
  tagModal.show();
});
tagManageList.addEventListener("click", async (e) => {
  const renameId = e.target.closest("[data-tag-rename]")?.dataset.tagRename;
  const delId = e.target.closest("[data-tag-del]")?.dataset.tagDel;
  if (renameId) {
    const t = tags.find((x) => x.id === renameId);
    const { value, isConfirmed } = await Swal.fire({
      title: "เปลี่ยนชื่อแท็ก",
      input: "text",
      inputValue: t?.name ?? "",
      showCancelButton: true,
      confirmButtonText: "บันทึก",
      cancelButtonText: "ยกเลิก",
      inputValidator: (v) => (!v.trim() ? "ใส่ชื่อแท็ก" : undefined),
    });
    if (!isConfirmed) return;
    const { error } = await supabase.from("tags").update({ name: value.trim() }).eq("id", renameId);
    if (error) return toast("error", "เปลี่ยนชื่อไม่สำเร็จ: " + error.message);
    await loadTags();
    renderTagManage();
    loadTransactions();
  }
  if (delId) {
    const t = tags.find((x) => x.id === delId);
    const res = await Swal.fire({
      title: `ลบแท็ก "${t?.name ?? ""}"?`,
      text: "จะถูกเอาออกจากทุกรายการที่ติดไว้",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#dc3545",
    });
    if (!res.isConfirmed) return;
    const { error } = await supabase.from("tags").delete().eq("id", delId);
    if (error) return toast("error", "ลบไม่สำเร็จ: " + error.message);
    selectedTagIds.delete(delId);
    if (fTag.value === delId) fTag.value = "";
    await loadTags();
    renderTagManage();
    loadTransactions();
  }
});

// --- init ---
async function init() {
  fMonth.value = todayBangkok().slice(0, 7); // เดือนปัจจุบันเป็น default
  await Promise.all([loadCategories(), loadAccounts(), loadTags()]);
  await loadTransactions();
}

document.addEventListener("auth:login", init);
document.addEventListener("auth:logout", () => {
  tbody.innerHTML = "";
  totalsCell.textContent = "";
});

// ซิงก์ dropdown หมวดหมู่เมื่อมีการเพิ่ม/แก้/ลบหมวดในแท็บหมวดหมู่
document.addEventListener("categories:changed", loadCategories);

// ซิงก์ dropdown บัญชีเมื่อมีการเพิ่ม/แก้/ลบบัญชี
document.addEventListener("accounts:changed", loadAccounts);

// รีเฟรชยอดบัญชีเมื่อรายการเปลี่ยน (เผื่อแท็บบัญชีเปิดอยู่ภายหลัง) — แท็บบัญชีโหลด lazy อยู่แล้ว

// รีโหลดตารางเมื่อมีการสร้างรายการประจำอัตโนมัติ
document.addEventListener("transactions:changed", loadTransactions);

// เผื่อหน้านี้โหลดตอน login อยู่แล้ว (auth:login ถูก dispatch ไปก่อนโมดูลนี้จะ subscribe)
const {
  data: { session },
} = await supabase.auth.getSession();
if (session) init();

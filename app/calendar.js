import { supabase } from "./supabaseClient.js";
import { toast, formatTHB, todayBangkok, monthRange } from "./ui.js";

// --- DOM refs ---
const elMonth = document.getElementById("cal-month");
const elGrid = document.getElementById("cal-grid");
const elDayCard = document.getElementById("cal-day-card");
const elDayTitle = document.getElementById("cal-day-title");
const elDayList = document.getElementById("cal-day-list");

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const TH_TYPE = { income: "รายรับ", expense: "รายจ่าย", transfer: "โอน" };
const compact = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let byDay = {}; // วันที่ (1..31) → { inc, exp, rows:[...] }

async function load() {
  const ym = elMonth.value || todayBangkok().slice(0, 7);
  const { start, end } = monthRange(ym);
  const { data, error } = await supabase
    .from("transactions")
    .select("type, amount, txn_date, note, payment_method, category:categories(name)")
    .gte("txn_date", start)
    .lte("txn_date", end)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return toast("error", "โหลดปฏิทินไม่สำเร็จ: " + error.message);

  byDay = {};
  for (const r of data ?? []) {
    const d = Number(r.txn_date.slice(8, 10));
    const cell = (byDay[d] ??= { inc: 0, exp: 0, rows: [] });
    if (r.type === "income") cell.inc += Number(r.amount);
    else if (r.type === "expense") cell.exp += Number(r.amount); // โอนไม่นับเป็นรับ/จ่าย แต่ยังโชว์ในรายการของวัน
    cell.rows.push(r);
  }
  renderGrid(ym);
  elDayCard.classList.add("d-none"); // ซ่อนรายการรายวันเก่าตอนเปลี่ยนเดือน
}

function renderGrid(ym) {
  const [y, m] = ym.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay(); // 0=อาทิตย์
  const lastDay = new Date(y, m, 0).getDate();
  const today = todayBangkok();

  const cells = WEEKDAYS.map((w) => `<div class="cal-head">${w}</div>`);
  for (let i = 0; i < firstWeekday; i++) cells.push(`<div class="cal-cell cal-empty"></div>`);

  for (let d = 1; d <= lastDay; d++) {
    const c = byDay[d];
    const dateStr = `${ym}-${String(d).padStart(2, "0")}`;
    const isToday = dateStr === today ? " cal-today" : "";
    const has = c ? " cal-has" : "";
    const inc = c?.inc ? `<div class="cal-amt text-success">+${compact.format(c.inc)}</div>` : "";
    const exp = c?.exp ? `<div class="cal-amt text-danger">−${compact.format(c.exp)}</div>` : "";
    cells.push(
      `<div class="cal-cell${isToday}${has}" data-day="${d}">
        <div class="cal-day">${d}</div>${inc}${exp}
      </div>`
    );
  }
  elGrid.innerHTML = cells.join("");
}

function showDay(d) {
  const c = byDay[d];
  if (!c) return;
  elDayTitle.textContent = `รายการวันที่ ${d} (รับ +${compact.format(c.inc)} · จ่าย −${compact.format(c.exp)})`;
  elDayList.innerHTML = c.rows
    .map((r) => {
      const transfer = r.type === "transfer";
      const income = r.type === "income";
      const cls = transfer ? "text-info" : income ? "text-success" : "text-danger";
      const badge = transfer
        ? "bg-info-subtle text-info"
        : income
        ? "bg-success-subtle text-success"
        : "bg-danger-subtle text-danger";
      const sign = transfer ? "" : income ? "+" : "−";
      const label = transfer ? "โอนเงิน" : r.category?.name ?? r.note ?? TH_TYPE[r.type];
      return `<tr>
        <td><span class="badge ${badge}">${TH_TYPE[r.type]}</span></td>
        <td>${escapeHtml(label)}${r.note && r.category?.name ? ` <span class="text-muted small">📝 ${escapeHtml(r.note)}</span>` : ""}</td>
        <td class="text-end fw-semibold ${cls} text-nowrap">${sign}${formatTHB(r.amount)}</td>
      </tr>`;
    })
    .join("");
  elDayCard.classList.remove("d-none");
}

// --- events ---
elGrid.addEventListener("click", (e) => {
  const cell = e.target.closest(".cal-cell[data-day]");
  if (!cell || !cell.classList.contains("cal-has")) return;
  showDay(Number(cell.dataset.day));
});

elMonth.addEventListener("change", load);

// โหลดเมื่อเปิดแท็บปฏิทิน (lazy + ข้อมูลสดเสมอ)
document.addEventListener("view:change", (e) => {
  if (e.detail.view === "calendar") load();
});

document.addEventListener("auth:login", () => {
  elMonth.value = todayBangkok().slice(0, 7);
});
document.addEventListener("auth:logout", () => {
  elGrid.innerHTML = "";
  elDayCard.classList.add("d-none");
});

elMonth.value = todayBangkok().slice(0, 7);

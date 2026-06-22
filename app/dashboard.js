import { supabase } from "./supabaseClient.js";
import { toast, formatTHB, todayBangkok, monthRange } from "./ui.js";

// --- DOM refs ---
const elMonth = document.getElementById("dash-month");
const elIncome = document.getElementById("dash-income");
const elExpense = document.getElementById("dash-expense");
const elBalance = document.getElementById("dash-balance");
const elRecent = document.getElementById("dash-recent");
const elPieEmpty = document.getElementById("dash-pie-empty");
const pieCanvas = document.getElementById("dash-pie");
const barCanvas = document.getElementById("dash-bar");

const PALETTE = ["#0d6efd", "#dc3545", "#198754", "#ffc107", "#6f42c1", "#fd7e14", "#20c997", "#6c757d", "#d63384", "#0dcaf0"];
const TH_TYPE = { income: "รายรับ", expense: "รายจ่าย" };

let pieChart, barChart;

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit" }).format(new Date(y, m - 1, 1));
}

// 6 เดือนย้อนหลังที่จบที่เดือน ym (รวม ym) → ['YYYY-MM', ...]
function lastSixMonths(ym) {
  const [y, m] = ym.split("-").map(Number);
  const arr = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return arr;
}

// การ์ดสรุป 3 ใบ + กราฟวงกลม (จากข้อมูลเดือนที่เลือก)
async function loadCardsAndPie(ym) {
  const { start, end } = monthRange(ym);
  const { data, error } = await supabase
    .from("transactions")
    .select("type, amount, category:categories(name)")
    .gte("txn_date", start)
    .lte("txn_date", end);
  if (error) return toast("error", "โหลดสรุปไม่สำเร็จ: " + error.message);

  const rows = data ?? [];
  const inc = rows.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);
  const exp = rows.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);

  elIncome.textContent = formatTHB(inc);
  elExpense.textContent = formatTHB(exp);
  elBalance.textContent = formatTHB(inc - exp);
  elBalance.classList.toggle("text-danger", inc - exp < 0);

  renderPie(rows.filter((r) => r.type === "expense"));
}

function renderPie(expenseRows) {
  const byCat = {};
  for (const r of expenseRows) {
    const name = r.category?.name ?? "ไม่ระบุ";
    byCat[name] = (byCat[name] ?? 0) + Number(r.amount);
  }
  const labels = Object.keys(byCat);
  const values = Object.values(byCat);

  elPieEmpty.classList.toggle("d-none", labels.length > 0);
  pieCanvas.classList.toggle("d-none", labels.length === 0);

  pieChart?.destroy();
  if (!labels.length) return;
  pieChart = new Chart(pieCanvas, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]) }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } },
  });
}

// กราฟแท่ง รายรับ vs รายจ่าย 6 เดือน
async function loadBar(ym) {
  const months = lastSixMonths(ym);
  const start = `${months[0]}-01`;
  const { end } = monthRange(months[5]);

  const { data, error } = await supabase
    .from("transactions")
    .select("type, amount, txn_date")
    .gte("txn_date", start)
    .lte("txn_date", end);
  if (error) return toast("error", "โหลดกราฟไม่สำเร็จ: " + error.message);

  const inc = Object.fromEntries(months.map((m) => [m, 0]));
  const exp = Object.fromEntries(months.map((m) => [m, 0]));
  for (const r of data ?? []) {
    const m = r.txn_date.slice(0, 7);
    if (!(m in inc)) continue;
    if (r.type === "income") inc[m] += Number(r.amount);
    else exp[m] += Number(r.amount);
  }

  barChart?.destroy();
  barChart = new Chart(barCanvas, {
    type: "bar",
    data: {
      labels: months.map(monthLabel),
      datasets: [
        { label: "รายรับ", data: months.map((m) => inc[m]), backgroundColor: "#198754" },
        { label: "รายจ่าย", data: months.map((m) => exp[m]), backgroundColor: "#dc3545" },
      ],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } },
  });
}

async function loadRecent() {
  const { data, error } = await supabase
    .from("transactions")
    .select("type, amount, txn_date, note, category:categories(name)")
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) return;

  const rows = data ?? [];
  if (!rows.length) {
    elRecent.innerHTML = `<tr><td class="text-muted text-center py-3">ยังไม่มีรายการ</td></tr>`;
    return;
  }
  elRecent.innerHTML = rows
    .map((r) => {
      const income = r.type === "income";
      const cls = income ? "text-success" : "text-danger";
      const label = r.category?.name ?? r.note ?? TH_TYPE[r.type];
      return `<tr>
        <td class="text-nowrap text-muted small">${r.txn_date}</td>
        <td>${escapeHtml(label)}</td>
        <td class="text-end fw-semibold ${cls} text-nowrap">${income ? "+" : "−"}${formatTHB(r.amount)}</td>
      </tr>`;
    })
    .join("");
}

async function load() {
  const ym = elMonth.value || todayBangkok().slice(0, 7);
  await Promise.all([loadCardsAndPie(ym), loadBar(ym), loadRecent()]);
}

// --- events ---
elMonth.addEventListener("change", load);

// โหลด/รีเฟรชทุกครั้งที่เปิดแท็บ Dashboard (lazy + ข้อมูลสดเสมอ)
document.addEventListener("view:change", (e) => {
  if (e.detail.view === "dashboard") load();
});

document.addEventListener("auth:login", () => {
  elMonth.value = todayBangkok().slice(0, 7);
});
document.addEventListener("auth:logout", () => {
  pieChart?.destroy();
  barChart?.destroy();
  pieChart = barChart = null;
});

elMonth.value = todayBangkok().slice(0, 7);

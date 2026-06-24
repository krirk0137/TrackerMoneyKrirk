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
const elBudgetSection = document.getElementById("dash-budget-section");
const elBudgetList = document.getElementById("dash-budget-list");

const PALETTE = ["#0d6efd", "#dc3545", "#198754", "#ffc107", "#6f42c1", "#fd7e14", "#20c997", "#6c757d", "#d63384", "#0dcaf0"];
const TH_TYPE = { income: "รายรับ", expense: "รายจ่าย", transfer: "โอน" };

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
    .select("type, amount, note, category:categories(name)")
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
  const notesByCat = {}; // หมวด → [โน้ต] เอาไว้โชว์ใน tooltip
  for (const r of expenseRows) {
    const name = r.category?.name ?? "ไม่ระบุ";
    byCat[name] = (byCat[name] ?? 0) + Number(r.amount);
    if (r.note) (notesByCat[name] ??= []).push(r.note);
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
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            // ต่อท้าย tooltip ด้วยรายการโน้ตของหมวดนั้น (สูงสุด 5 บรรทัด)
            afterBody: (items) => {
              const notes = notesByCat[items[0].label] ?? [];
              if (!notes.length) return [];
              const lines = notes.slice(0, 5).map((n) => "• " + n);
              if (notes.length > 5) lines.push(`… อีก ${notes.length - 5} รายการ`);
              return ["", ...lines];
            },
          },
        },
      },
    },
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
    .select("type, amount, txn_date, note, payment_method, category:categories(name)")
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
    .map((r, i) => {
      const transfer = r.type === "transfer";
      const income = r.type === "income";
      const cls = transfer ? "text-info" : income ? "text-success" : "text-danger";
      const sign = transfer ? "" : income ? "+" : "−";
      const label = transfer ? "โอนเงิน" : r.category?.name ?? r.note ?? TH_TYPE[r.type];
      const detail = [
        r.note ? `📝 ${escapeHtml(r.note)}` : "ไม่มีโน้ต",
        r.payment_method ? `· ${escapeHtml(r.payment_method)}` : "",
      ].join(" ");
      return `<tr role="button" data-recent="${i}">
        <td class="text-nowrap text-muted small">${r.txn_date}</td>
        <td>${escapeHtml(label)} <span class="text-muted small">${r.note ? "📝" : ""}</span></td>
        <td class="text-end fw-semibold ${cls} text-nowrap">${sign}${formatTHB(r.amount)}</td>
      </tr>
      <tr class="d-none" data-recent-detail="${i}">
        <td colspan="3" class="small text-muted bg-body-secondary">${detail}</td>
      </tr>`;
    })
    .join("");
}

// คลิกแถวรายการล่าสุด → กาง/พับ แถวรายละเอียด (โน้ต + วิธีจ่าย)
elRecent.addEventListener("click", (e) => {
  const tr = e.target.closest("[data-recent]");
  if (!tr) return;
  const detail = elRecent.querySelector(`[data-recent-detail="${tr.dataset.recent}"]`);
  detail?.classList.toggle("d-none");
});

// งบประมาณเดือนนี้: หมวดรายจ่ายที่ตั้งงบ → ใช้ไปเท่าไหร่ vs งบ (progress bar)
async function loadBudget(ym) {
  const { data: cats } = await supabase
    .from("categories")
    .select("id, name, monthly_budget")
    .eq("type", "expense")
    .not("monthly_budget", "is", null);
  if (!cats?.length) {
    elBudgetSection.classList.add("d-none");
    return;
  }

  const { start, end } = monthRange(ym);
  const { data: tx } = await supabase
    .from("transactions")
    .select("category_id, amount")
    .eq("type", "expense")
    .gte("txn_date", start)
    .lte("txn_date", end);
  const spent = {};
  for (const t of tx ?? []) spent[t.category_id] = (spent[t.category_id] ?? 0) + Number(t.amount);

  elBudgetSection.classList.remove("d-none");

  // นับหมวดที่ถึงเกณฑ์เตือน เพื่อสรุปเป็นแบนเนอร์ด้านบน
  let nOver = 0, nNear = 0;
  const rows = cats.map((c) => {
    const used = spent[c.id] || 0;
    const budget = Number(c.monthly_budget);
    const ratio = budget > 0 ? used / budget : 0;
    let color, icon;
    if (ratio >= 1) { color = "bg-danger"; icon = "🔴"; nOver++; }
    else if (ratio >= 0.8) { color = "bg-warning"; icon = "⚠️"; nNear++; }
    else if (ratio >= 0.5) { color = "bg-info"; icon = "🟡"; }
    else { color = "bg-success"; icon = "🟢"; }
    const pct = Math.round(ratio * 100);
    return `<div class="mb-2">
        <div class="d-flex justify-content-between small">
          <span>${icon} ${escapeHtml(c.name)} <span class="text-muted">${pct}%</span></span>
          <span class="${used > budget ? "text-danger fw-semibold" : ""}">${formatTHB(used)} / ${formatTHB(budget)}</span>
        </div>
        <div class="progress" style="height: 8px;">
          <div class="progress-bar ${color}" style="width: ${Math.min(100, ratio * 100)}%"></div>
        </div>
      </div>`;
  });

  const alerts = [];
  if (nOver) alerts.push(`<div class="alert alert-danger py-2 px-3 small mb-2">🔴 มี ${nOver} หมวดใช้งบเกิน 100% แล้ว</div>`);
  if (nNear) alerts.push(`<div class="alert alert-warning py-2 px-3 small mb-2">⚠️ มี ${nNear} หมวดใกล้เต็มงบ (80%+)</div>`);
  elBudgetList.innerHTML = alerts.join("") + rows.join("");
}

async function load() {
  const ym = elMonth.value || todayBangkok().slice(0, 7);
  await Promise.all([loadCardsAndPie(ym), loadBar(ym), loadBudget(ym), loadRecent()]);
}

// --- events ---
elMonth.addEventListener("change", load);

// โหลด/รีเฟรชทุกครั้งที่เปิดแท็บ Dashboard (lazy + ข้อมูลสดเสมอ)
document.addEventListener("view:change", (e) => {
  if (e.detail.view === "dashboard") load();
});

// สลับธีม → วาดกราฟใหม่ด้วยสีตัวอักษรของธีมใหม่ (เฉพาะตอนแท็บ Dashboard เปิดอยู่)
document.addEventListener("theme:change", () => {
  if (!document.getElementById("view-dashboard").classList.contains("d-none")) load();
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

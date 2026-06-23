// สลับธีมสว่าง/มืด (Bootstrap 5.3 data-bs-theme) — จำค่าใน localStorage
// ค่าเริ่มต้นถูกตั้งใน <head> แล้ว (กัน flash) — ที่นี่แค่ผูกปุ่ม + อัปเดตสี Chart.js
const btn = document.getElementById("theme-toggle");

function apply(theme) {
  document.documentElement.setAttribute("data-bs-theme", theme);
  btn.textContent = theme === "dark" ? "☀️" : "🌙";
  // Chart.js ใช้สีตายตัว — ปรับสีตัวอักษร/เส้นกริดให้อ่านออกในธีมมืด
  if (window.Chart) {
    Chart.defaults.color = theme === "dark" ? "#adb5bd" : "#666";
    Chart.defaults.borderColor = theme === "dark" ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.1)";
  }
  // แจ้งโมดูลที่มีกราฟให้ render ใหม่ถ้ากำลังเปิดอยู่
  document.dispatchEvent(new CustomEvent("theme:change", { detail: { theme } }));
}

apply(localStorage.getItem("theme") || "light");

btn.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  apply(next);
});

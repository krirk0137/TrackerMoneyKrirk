// สลับแท็บ: คลิกปุ่มที่มี data-view → แสดง section #view-<view> ที่ตรงกัน
const tabs = document.getElementById("main-tabs");

tabs.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (!btn) return;

  tabs.querySelectorAll(".nav-link").forEach((b) => b.classList.toggle("active", b === btn));

  const view = btn.dataset.view;
  document
    .querySelectorAll(".app-view-section")
    .forEach((s) => s.classList.toggle("d-none", s.id !== `view-${view}`));

  // แจ้งโมดูลอื่นว่าเปลี่ยนแท็บ (เผื่อ dashboard อยากโหลดตอนถูกเปิด)
  document.dispatchEvent(new CustomEvent("view:change", { detail: { view } }));
});

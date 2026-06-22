// helper ใช้ร่วมทั้งแอป

// toast แจ้งเตือนมุมขวาบน (ใช้ SweetAlert2 global)
export const toast = (icon, title) =>
  Swal.fire({
    toast: true,
    position: "top-end",
    icon,
    title,
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
  });

// format เงินแบบไทย: ฿1,234.50
const baht = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 2,
});
export const formatTHB = (n) => baht.format(Number(n) || 0);

// วันที่วันนี้ตาม Asia/Bangkok เป็น YYYY-MM-DD (ใช้เป็น default ของช่องวันที่ — กันบั๊ก UTC off-by-one)
export const todayBangkok = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

// ช่วงวันของเดือน 'YYYY-MM' → { start, end } (YYYY-MM-DD)
export function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // m เป็น 1-based → day 0 ของเดือนถัดไป = วันสุดท้ายของเดือน m
  return { start: `${ym}-01`, end: `${ym}-${String(lastDay).padStart(2, "0")}` };
}

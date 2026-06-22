import { supabase } from "./supabaseClient.js";
import { toast } from "./ui.js";

const loginView = document.getElementById("login-view");
const appView   = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const logoutBtn = document.getElementById("logout-btn");
const userEmail = document.getElementById("user-email");

// session guard: มี session → แสดงแอป, ไม่มี → แสดงหน้า login
// แจ้งโมดูลอื่น (transactions/dashboard/...) ผ่าน event เฉพาะตอนสถานะเปลี่ยนจริง
let lastLoggedIn = null;
function render(session) {
  const loggedIn = !!session;
  loginView.classList.toggle("d-none", loggedIn);
  appView.classList.toggle("d-none", !loggedIn);
  if (loggedIn) userEmail.textContent = session.user.email;

  if (loggedIn !== lastLoggedIn) {
    lastLoggedIn = loggedIn;
    document.dispatchEvent(new CustomEvent(loggedIn ? "auth:login" : "auth:logout"));
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = loginForm.email.value.trim();
  const password = loginForm.password.value;
  const btn = loginForm.querySelector("button[type=submit]");

  btn.disabled = true;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false;

  if (error) {
    toast("error", "เข้าสู่ระบบไม่สำเร็จ: " + error.message);
    return;
  }
  loginForm.reset();
});

logoutBtn.addEventListener("click", () => supabase.auth.signOut());

// แสดงผลตาม session ปัจจุบัน แล้วติดตามการเปลี่ยนสถานะ (login/logout/refresh)
const { data: { session } } = await supabase.auth.getSession();
render(session);
supabase.auth.onAuthStateChange((_event, session) => render(session));

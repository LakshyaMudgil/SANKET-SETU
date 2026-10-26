const root = document.documentElement;
const btn = document.getElementById("themeToggle");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- theme ---------- */
function applyTheme(t, save) {
  root.dataset.theme = t;
  btn.setAttribute("aria-pressed", String(t === "dark"));
  btn.setAttribute("aria-label", "Switch to " + (t === "dark" ? "light" : "dark") + " theme");
  document.querySelector('meta[name="theme-color"]').content = t === "dark" ? "#050b24" : "#2a0f1c";
  if (save) { try { localStorage.setItem("ss-theme", t); } catch (e) {} }
  syncVideo();
}
btn.addEventListener("click", () => applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true));
// follow the OS setting until the visitor picks a theme themselves
matchMedia("(prefers-color-scheme: light)").addEventListener("change", e => {
  try { if (localStorage.getItem("ss-theme")) return; } catch (x) {}
  applyTheme(e.matches ? "light" : "dark", false);
});

/* ---------- background videos: one per theme, kept looping no matter what ---------- */
const vids = { light: document.getElementById("vidLight"), dark: document.getElementById("vidDark") };
const active = () => vids[root.dataset.theme];
const wanted = () => !document.hidden && !reduce.matches;
const saveData = navigator.connection && navigator.connection.saveData;
const lowBandwidth = saveData || matchMedia("(max-width: 700px)").matches;

// Looping needs the browser to seek back to 0. Some dev servers/previews can't serve byte ranges,
// so the video just freezes at the end. Loading the file into memory once makes seeking always work.
async function ready(v) {
  if (lowBandwidth) return; // keep the poster image on mobile or Save-Data connections
  if (v.dataset.ready) return;
  v.dataset.ready = "1";
  const src = v.querySelector("source").src;
  try {
    if (!/^https?:/.test(location.protocol)) throw 0;           // file:// can't fetch; plain loading works there
    const res = await fetch(src);
    if (!res.ok) throw 0;                                        // video file not added yet -> keep the plain background
    v.src = URL.createObjectURL(await res.blob());
  } catch (e) { v.preload = "auto"; }
  v.load();
}
async function syncVideo() {
  const on = active(), off = on === vids.light ? vids.dark : vids.light;
  if (wanted() && !lowBandwidth) { await ready(on); on.play().catch(() => document.addEventListener("pointerdown", () => on.play(), { once: true })); }
  setTimeout(() => { if (off !== active()) off.pause(); }, 950);   // pause the hidden one after the fade
  if (!wanted()) on.pause();
}
Object.values(vids).forEach(v => {
  v.muted = true;
  v.addEventListener("ended", () => { v.currentTime = 0; v.play().catch(() => {}); });   // if `loop` is ignored
});
document.addEventListener("visibilitychange", syncVideo);
reduce.addEventListener("change", syncVideo);

// watchdog: if the visible video ever stalls, freezes or stops, nudge it, then reload it
let lastT = -1, stuck = 0;
setInterval(() => {
  const v = active();
  if (!v || !wanted() || !v.dataset.ready || v.readyState < 2) return;
  const frozen = v.paused || v.ended || v.currentTime === lastT;
  stuck = frozen ? stuck + 1 : 0; lastT = v.currentTime;
  if (stuck === 1) { v.currentTime = 0; v.play().catch(() => {}); }
  else if (stuck >= 2) { v.load(); v.play().catch(() => {}); stuck = 0; }
}, 1500);

/* ---------- nav + actions ---------- */
const links = document.querySelectorAll(".links a");
links.forEach(a => a.addEventListener("click", e => {
  links.forEach(l => l.classList.remove("active"));
  a.classList.add("active");
  const id = a.getAttribute("href");
  if (id.startsWith("#") && id !== "#top" && !document.querySelector(id)) e.preventDefault(); // section not built yet
}));
// where each button / tile on the home page goes (kept in one place)
const ROUTES = {
  "live": "/sign-to-speech",
  "sign-to-speech": "/sign-to-speech",
  "speech-to-sign": "/speech-to-sign",
  "demo": "/speech-to-sign?demo=1"
};
document.querySelectorAll("[data-action]").forEach(el => el.addEventListener("click", e => {
  e.preventDefault();
  const action = el.dataset.action;
  document.dispatchEvent(new CustomEvent("sanketsetu:action", { detail: { action } }));
  const dest = ROUTES[action];
  if (dest) location.href = dest;
}));

applyTheme(root.dataset.theme || "dark", false);

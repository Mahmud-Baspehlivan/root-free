// ═══════════════════════════════════════
// STATE
// ═══════════════════════════════════════
const STORE_KEY = "rootfree_v3";
let state = { people: {}, relationships: [], nextId: 1 };
let editingId = null,
  relSourceId = null,
  selectedRelType = "parent",
  selectedPickId = null;
let currentPhoto = null,
  currentZoom = 1,
  currentView = "canvas";


// ═══════════════════════════════════════
// PERSIST
// ═══════════════════════════════════════
function loadState() {
  try {
    const d = localStorage.getItem(STORE_KEY);
    if (d) state = JSON.parse(d);
  } catch (e) {}
  render();
}
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    showToast("Storage full — try removing large photos");
  }
}

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
function initials(p) {
  return ((p.first || "?")[0] + (p.last || "")[0]).toUpperCase();
}
function gClass(g) {
  return g === "male" ? "male" : g === "female" ? "female" : "other";
}
function lifespan(p) {
  if (p.birth && p.death) return p.birth + "–" + p.death;
  if (p.birth) return "b. " + p.birth;
  if (p.death) return "d. " + p.death;
  return "";
}
function fullName(p) {
  return (
    ((p.first || "") + (p.last ? " " + p.last : "")).trim() || "Unknown"
  );
}
function showToast(msg, dur = 2600) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), dur);
}

// person icon SVG
function personSVG(gc) {
  const col =
    gc === "female" ? "#6b4fa0" : gc === "male" ? "#2d6a4f" : "#7a7060";
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
}

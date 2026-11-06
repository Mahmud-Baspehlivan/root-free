// ═══════════════════════════════════════
// DARK MODE
// ═══════════════════════════════════════
function toggleDark() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("rootfree_dark", isDark ? "1" : "0");
  document.getElementById("dark-toggle").textContent = isDark ? "○" : "◐";
}
function initDark() {
  const saved = localStorage.getItem("rootfree_dark");
  // Also respect OS preference if no saved preference
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (saved === "1" || (saved === null && prefersDark)) {
    document.body.classList.add("dark");
    document.getElementById("dark-toggle").textContent = "○";
  }
}

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
initDark();
initCanvasPan();
loadState();

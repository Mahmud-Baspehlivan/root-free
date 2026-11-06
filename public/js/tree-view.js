// ═══════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════
function switchView(v) {
  currentView = v;
  ["canvas", "gen", "list"].forEach((n) => {
    document.getElementById("view-" + n).style.display =
      n === v ? "block" : "none";
    const wrap = document.getElementById("view-" + n);
    if (n === "canvas")
      wrap.style.display = v === "canvas" ? "block" : "none";
    document
      .getElementById("tab-" + n)
      .classList.toggle("active", n === v);
  });
  document.getElementById("main-toolbar").style.display =
    v === "canvas" ? "flex" : "none";
  document.getElementById("main-legend").style.display =
    v === "canvas" ? "block" : "none";
  if (v === "gen") renderGenView();
  if (v === "list") renderListView();
}

// ═══════════════════════════════════════
// RENDER — CANVAS
// ═══════════════════════════════════════
function render() {
  const canvas = document.getElementById("tree-canvas");
  canvas.querySelectorAll(".person-card").forEach((e) => e.remove());
  const ids = Object.keys(state.people);
  document.getElementById("welcome-msg").style.display = ids.length
    ? "none"
    : "block";
  const { badge } = marriageInfo();
  ids.forEach((id) => {
    const p = state.people[id];
    const gc = gClass(p.gender);
    const card = document.createElement("div");
    card.className = "person-card";
    card.id = "card-" + id;
    card.style.left = (p.x || 100) + "px";
    card.style.top = (p.y || 100) + "px";
    const photoHtml = p.photo
      ? `<img class="card-photo" src="${p.photo}" alt="${fullName(p)}">`
      : `<div class="card-photo-placeholder ${gc}">${personSVG(gc)}</div>`;
    card.innerHTML = `${photoHtml}${badge[id] ? `<span class="card-badge">${badge[id]}</span>` : ""}
<div class="card-body">
  <div class="card-name">${fullName(p)}</div>
  <div class="card-life">${lifespan(p) || "&nbsp;"}</div>
  ${p.place ? `<div class="card-meta">${p.place}</div>` : ""}
</div>
<div class="card-footer">
  <button class="card-action" onclick="viewPerson('${id}')">View</button>
  <button class="card-action primary" onclick="openAddRel('${id}')">Connect</button>
</div>`;
    makeDraggable(card, id);
    canvas.appendChild(card);
  });
  updateCanvasSize();
  requestAnimationFrame(() => requestAnimationFrame(drawConnectors));
}

function updateCanvasSize() {
  const canvas = document.getElementById("tree-canvas");
  let maxX = 900,
    maxY = 600;
  Object.values(state.people).forEach((p) => {
    maxX = Math.max(maxX, (p.x || 0) + 220);
    maxY = Math.max(maxY, (p.y || 0) + 280);
  });
  // Always cover the visible area, whatever the zoom.
  const view = document.getElementById("view-canvas");
  maxX = Math.max(maxX, view.clientWidth / currentZoom);
  maxY = Math.max(maxY, view.clientHeight / currentZoom);
  canvas.style.minWidth = maxX + "px";
  canvas.style.minHeight = maxY + "px";
  applyZoom();
}


function makeDraggable(card, id) {
  let ox = 0,
    oy = 0,
    moved = false,
    startX = 0,
    startY = 0;
  card.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON") return;
    e.preventDefault();
    const p = state.people[id];
    const wrap = document.getElementById("view-canvas");
    const rect = wrap.getBoundingClientRect();
    ox =
      (e.clientX - rect.left + wrap.scrollLeft) / currentZoom -
      (p.x || 0);
    oy =
      (e.clientY - rect.top + wrap.scrollTop) / currentZoom - (p.y || 0);
    startX = e.clientX;
    startY = e.clientY;
    moved = false;
    card.classList.add("dragging");
    const mm = (ev) => {
      if (
        Math.abs(ev.clientX - startX) > 4 ||
        Math.abs(ev.clientY - startY) > 4
      )
        moved = true;
      const bnd = wrap.getBoundingClientRect();
      p.x = Math.max(
        0,
        (ev.clientX - bnd.left + wrap.scrollLeft) / currentZoom - ox,
      );
      p.y = Math.max(
        0,
        (ev.clientY - bnd.top + wrap.scrollTop) / currentZoom - oy,
      );
      card.style.left = p.x + "px";
      card.style.top = p.y + "px";
      updateCanvasSize();
      requestAnimationFrame(drawConnectors);
    };
    const mu = () => {
      card.classList.remove("dragging");
      if (moved) {
        saveState();
      }
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    };
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  });
}

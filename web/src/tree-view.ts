// The tree canvas: switching views, drawing the person cards, dragging them.

import { applyZoom } from "./canvas-nav.ts";
import { drawConnectors } from "./connectors.ts";
import { marriageInfo } from "./layout.ts";
import { el, esc, fullName, gClass, lifespan, personSVG, photoSrc, state, ui } from "./state.ts";
import { saveState } from "./sync.ts";
import type { View } from "./types.ts";
import { renderGenView, renderListView } from "./views.ts";

export function switchView(v: View): void {
  ui.view = v;
  for (const n of ["canvas", "gen", "list"] as const) {
    el("view-" + n).style.display = n === v ? "block" : "none";
    el("tab-" + n).classList.toggle("active", n === v);
  }
  el("main-toolbar").style.display = v === "canvas" ? "flex" : "none";
  el("main-legend").style.display = v === "canvas" ? "block" : "none";
  if (v === "gen") renderGenView();
  if (v === "list") renderListView();
}

export function render(): void {
  const canvas = el("tree-canvas");
  canvas.querySelectorAll(".person-card").forEach((e) => e.remove());
  const ids = Object.keys(state.people);
  el("welcome-msg").style.display = ids.length ? "none" : "block";
  const { badge } = marriageInfo();
  ids.forEach((id) => {
    const p = state.people[id];
    const gc = gClass(p.gender);
    const card = document.createElement("div");
    card.className = "person-card";
    card.id = "card-" + id;
    card.style.left = (p.x || 100) + "px";
    card.style.top = (p.y || 100) + "px";
    const photo = photoSrc(p);
    const photoHtml = photo
      ? `<img class="card-photo" src="${esc(photo)}" alt="${esc(fullName(p))}">`
      : `<div class="card-photo-placeholder ${gc}">${personSVG(gc)}</div>`;
    card.innerHTML = `${photoHtml}${badge[id] ? `<span class="card-badge">${esc(badge[id])}</span>` : ""}
<div class="card-body">
  <div class="card-name">${esc(fullName(p))}</div>
  <div class="card-life">${esc(lifespan(p)) || "&nbsp;"}</div>
  ${p.place ? `<div class="card-meta">${esc(p.place)}</div>` : ""}
</div>
<div class="card-footer">
  <button class="card-action" data-action="viewPerson" data-id="${esc(id)}">View</button>
  <button class="card-action primary" data-action="openAddRel" data-id="${esc(id)}">Connect</button>
</div>`;
    makeDraggable(card, id);
    canvas.appendChild(card);
  });
  updateCanvasSize();
  requestAnimationFrame(() => requestAnimationFrame(drawConnectors));
}

export function updateCanvasSize(): void {
  const canvas = el("tree-canvas");
  let maxX = 900,
    maxY = 600;
  Object.values(state.people).forEach((p) => {
    maxX = Math.max(maxX, (p.x || 0) + 220);
    maxY = Math.max(maxY, (p.y || 0) + 280);
  });
  // Always cover the visible area, whatever the zoom.
  const view = el("view-canvas");
  maxX = Math.max(maxX, view.clientWidth / ui.zoom);
  maxY = Math.max(maxY, view.clientHeight / ui.zoom);
  canvas.style.minWidth = maxX + "px";
  canvas.style.minHeight = maxY + "px";
  applyZoom();
}

function makeDraggable(card: HTMLElement, id: string): void {
  let ox = 0,
    oy = 0,
    moved = false,
    startX = 0,
    startY = 0;
  card.addEventListener("mousedown", (e) => {
    if ((e.target as Element).tagName === "BUTTON") return;
    e.preventDefault();
    const p = state.people[id];
    const wrap = el("view-canvas");
    const rect = wrap.getBoundingClientRect();
    ox = (e.clientX - rect.left + wrap.scrollLeft) / ui.zoom - (p.x || 0);
    oy = (e.clientY - rect.top + wrap.scrollTop) / ui.zoom - (p.y || 0);
    startX = e.clientX;
    startY = e.clientY;
    moved = false;
    card.classList.add("dragging");
    const mm = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4) moved = true;
      const bnd = wrap.getBoundingClientRect();
      p.x = Math.max(0, (ev.clientX - bnd.left + wrap.scrollLeft) / ui.zoom - ox);
      p.y = Math.max(0, (ev.clientY - bnd.top + wrap.scrollTop) / ui.zoom - oy);
      card.style.left = p.x + "px";
      card.style.top = p.y + "px";
      updateCanvasSize();
      requestAnimationFrame(drawConnectors);
    };
    const mu = () => {
      card.classList.remove("dragging");
      if (moved) saveState();
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    };
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  });
}

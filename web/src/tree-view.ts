// The tree canvas: switching views, drawing the person cards, dragging them.

import { applyZoom } from "./canvas-nav.ts";
import { branchState, hasClosedBranches, isPartialView, refreshView, shownTree } from "./collapse.ts";
import { drawConnectors } from "./connectors.ts";
import { t } from "./i18n.ts";
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
  // Shown again by clearing the override, so the stylesheet decides (the
  // legend stays hidden on phones).
  el("main-toolbar").style.display = v === "canvas" ? "" : "none";
  el("main-legend").style.display = v === "canvas" ? "" : "none";
  el("search").style.display = v === "canvas" ? "" : "none";
  if (v === "gen") renderGenView();
  if (v === "list") renderListView();
}

export function render(): void {
  const canvas = el("tree-canvas");
  canvas.querySelectorAll(".person-card").forEach((e) => e.remove());
  // With closed branches only part of the tree is shown, at its own positions.
  const shown = refreshView();
  el("welcome-msg").style.display = Object.keys(state.people).length ? "none" : "block";
  el("expand-all").style.display = hasClosedBranches() ? "" : "none";
  canvas.classList.toggle("partial", isPartialView());
  const { badge } = marriageInfo();
  Object.keys(shown.people).forEach((id) => {
    const p = shown.people[id];
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
<button class="card-add" data-action="openAddRelative" data-id="${esc(id)}" title="${esc(t("addRelative"))}" aria-label="${esc(t("addRelative"))}">+</button>
<div class="card-body">
  <div class="card-name">${esc(fullName(p))}</div>
  <div class="card-life">${esc(lifespan(p)) || "&nbsp;"}</div>
  ${p.place ? `<div class="card-meta">${esc(p.place)}</div>` : ""}
</div>
<div class="card-footer">
  <button class="card-action" data-action="viewPerson" data-id="${esc(id)}">${esc(t("view"))}</button>
  <button class="card-action primary" data-action="openAddRel" data-id="${esc(id)}">${esc(t("connect"))}</button>
</div>${branchButton(id)}`;
    makeDraggable(card, id);
    canvas.appendChild(card);
  });
  updateCanvasSize();
  requestAnimationFrame(() => requestAnimationFrame(drawConnectors));
}

/** "▾" under a parent's card closes the branch below; "▸ 12" shows how many are hidden and opens it. */
function branchButton(id: string): string {
  const b = branchState(id);
  if (!b) return "";
  const title = b.open ? t("hideBranch") : t("showBranch", { n: b.count });
  return `<button class="card-branch${b.open ? "" : " closed"}" data-action="toggleBranch" data-id="${esc(id)}" title="${esc(title)}" aria-label="${esc(title)}" aria-expanded="${b.open}">${b.open ? "▾" : `▸ ${b.count}`}</button>`;
}

/** Scroll the canvas to the top row of the tree, so it is not opened on empty space. */
export function revealTree(): void {
  const people = Object.values(shownTree().people);
  if (!people.length) return;
  const first = people.reduce((a, b) => ((b.y || 0) < (a.y || 0) || ((b.y || 0) === (a.y || 0) && (b.x || 0) < (a.x || 0)) ? b : a));
  const wrap = el("view-canvas");
  wrap.scrollLeft = Math.max(0, (first.x || 0) * ui.zoom - 24);
  wrap.scrollTop = Math.max(0, (first.y || 0) * ui.zoom - 24);
}

/** The area the cards take up, unzoomed. */
export function treeSize(): { width: number; height: number } {
  let width = 900,
    height = 600;
  Object.values(shownTree().people).forEach((p) => {
    width = Math.max(width, (p.x || 0) + 220);
    height = Math.max(height, (p.y || 0) + 280);
  });
  return { width, height };
}

export function updateCanvasSize(): void {
  const canvas = el("tree-canvas");
  const size = treeSize();
  // Always cover the visible area, whatever the zoom.
  const view = el("view-canvas");
  const maxX = Math.max(size.width, view.clientWidth / ui.zoom);
  const maxY = Math.max(size.height, view.clientHeight / ui.zoom);
  canvas.style.minWidth = maxX + "px";
  canvas.style.minHeight = maxY + "px";
  drawGrid(maxX, maxY);
  applyZoom();
}

const GRID = 40;

/** One line every 40px across the canvas; redrawn only when the canvas needs more or fewer lines. */
function drawGrid(width: number, height: number): void {
  const grid = el("grid");
  const cols = Math.ceil(width / GRID),
    rows = Math.ceil(height / GRID);
  if (grid.dataset.size === cols + "x" + rows) return;
  grid.dataset.size = cols + "x" + rows;
  let html = "";
  for (let i = 0; i < cols; i++) html += `<i class="gx" style="left:${i * GRID}px"></i>`;
  for (let i = 0; i < rows; i++) html += `<i class="gy" style="top:${i * GRID}px"></i>`;
  grid.innerHTML = html;
}

function makeDraggable(card: HTMLElement, id: string): void {
  let ox = 0,
    oy = 0,
    moved = false,
    startX = 0,
    startY = 0;
  card.addEventListener("mousedown", (e) => {
    if ((e.target as Element).tagName === "BUTTON") return;
    // With closed branches the positions are only for viewing: no dragging.
    if (isPartialView()) return;
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

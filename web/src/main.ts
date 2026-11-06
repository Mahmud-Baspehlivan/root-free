// Entry point: wires up the page and loads the tree from the server.

import "./style.css";
import { initCanvasPan, initCanvasZoom, resetZoom, zoomIn, zoomOut } from "./canvas-nav.ts";
import { confirmDeleteAll, deleteAllData, doGedcomImport, exportGedcom, exportJson, importJson, openGedcomImport } from "./data.ts";
import { genLayout, gridLayout } from "./layout.ts";
import {
  handlePhotoUpload,
  openAddPerson,
  openAddRel,
  removeParents,
  removePhoto,
  removeRelationship,
  saveRelationship,
  savePerson,
  selectRelType,
  triggerPhotoUpload,
  viewPerson,
} from "./people.ts";
import { closeModal, el } from "./state.ts";
import { hasUnsavedChanges, loadState } from "./sync.ts";
import { switchView } from "./tree-view.ts";
import type { RelType, View } from "./types.ts";

// Buttons and links say what they do with data-action (and data-* arguments);
// one listener dispatches every click.
const actions: Record<string, (target: HTMLElement, event: MouseEvent) => void> = {
  openAddPerson,
  savePerson,
  triggerPhotoUpload: (_, e) => triggerPhotoUpload(e),
  removePhoto: (_, e) => {
    e.stopPropagation();
    removePhoto();
  },
  viewPerson: (t) => viewPerson(t.dataset.id!),
  openAddRel: (t) => openAddRel(t.dataset.id!),
  selectRelType: (t) => selectRelType(t),
  saveRelationship,
  removeRelationship: (t) =>
    removeRelationship({ a: t.dataset.a!, b: t.dataset.b!, type: t.dataset.type as RelType }, t.dataset.id!),
  removeParents: (t) => removeParents(t.dataset.id!),
  closeModal: (t) => closeModal(t.dataset.modal!),
  switchView: (t) => switchView(t.dataset.view as View),
  genLayout,
  gridLayout,
  zoomIn,
  zoomOut,
  resetZoom,
  openGedcomImport,
  doGedcomImport: () => void doGedcomImport(),
  exportGedcom,
  exportJson,
  exportFirst: () => {
    exportJson();
    closeModal("modal-delete");
  },
  importJson,
  confirmDeleteAll,
  deleteAllData,
  toggleDark,
};

document.addEventListener("click", (e) => {
  const target = (e.target as Element).closest<HTMLElement>("[data-action]");
  if (!target) return;
  const action = actions[target.dataset.action!];
  if (!action) return;
  if (target.tagName === "A") e.preventDefault();
  action(target, e);
});
el("photo-file-input").addEventListener("change", handlePhotoUpload);

// Warn before leaving while a save is still on its way to the server.
window.addEventListener("beforeunload", (e) => {
  if (hasUnsavedChanges()) e.preventDefault();
});

// ── Dark mode ──

function toggleDark(): void {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("rootfree_dark", isDark ? "1" : "0");
  el("dark-toggle").textContent = isDark ? "○" : "◐";
}

function initDark(): void {
  const saved = localStorage.getItem("rootfree_dark");
  // Follow the system setting until the user picks one.
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  if (saved === "1" || (saved === null && prefersDark)) {
    document.body.classList.add("dark");
    el("dark-toggle").textContent = "○";
  }
}

initDark();
initCanvasPan();
initCanvasZoom();
void loadState();

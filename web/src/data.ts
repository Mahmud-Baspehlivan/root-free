// Delete all, JSON backup / restore, GEDCOM import / export.

import { t } from "./i18n.ts";
import { closeModal, el, newId, openModal, showToast, state } from "./state.ts";
import { buildGedcom, parseGedcom } from "./gedcom.ts";
import { saveState } from "./sync.ts";
import { render } from "./tree-view.ts";
import type { Person, Relationship, Tree } from "./types.ts";

export function confirmDeleteAll(): void {
  openModal("modal-delete");
}

export function deleteAllData(): void {
  state.people = {};
  state.relationships = [];
  saveState();
  render();
  closeModal("modal-delete");
  showToast(t("allDeleted"));
}

// ── JSON backup ──

export function exportJson(): void {
  download(JSON.stringify(state, null, 2), "application/json", "rootfree-backup.json");
  showToast(t("backupDownloaded"));
}

export function importJson(): void {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".json";
  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    let imp: Partial<Tree>;
    try {
      imp = JSON.parse(await file.text());
    } catch {
      alert(t("cannotParse"));
      return;
    }
    if (!imp.people || !Array.isArray(imp.relationships)) {
      alert(t("invalidBackup"));
      return;
    }
    if (!confirm(t("confirmMerge"))) return;
    // Imported people get new ids so they never clash with existing ones.
    const idMap: Record<string, string> = {};
    Object.values(imp.people).forEach((p: Person) => {
      const nid = newId();
      idMap[p.id] = nid;
      state.people[nid] = { ...p, id: nid };
    });
    imp.relationships.forEach((r: Relationship) => {
      const a = idMap[r.a],
        b = idMap[r.b];
      if (a && b) state.relationships.push({ a, b, type: r.type });
    });
    saveState();
    render();
    showToast(t("merged"));
  };
  picker.click();
}

// ── GEDCOM ──

export function openGedcomImport(): void {
  const fileInput = el<HTMLInputElement>("gedcom-file");
  fileInput.value = "";
  el("gedcom-preview").style.display = "none";
  openModal("modal-gedcom");
  fileInput.onchange = async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const lines = (await f.text()).split(/\r?\n/);
    const inds = lines.filter((l) => l.includes("@") && l.includes("INDI")).length;
    const fams = lines.filter((l) => l.includes("@") && l.includes("FAM")).length;
    const prev = el("gedcom-preview");
    prev.textContent = t("gedFound", { i: inds, f: fams });
    prev.style.display = "block";
  };
}

export async function doGedcomImport(): Promise<void> {
  const file = el<HTMLInputElement>("gedcom-file").files?.[0];
  if (!file) {
    alert(t("pickGed"));
    return;
  }
  // Importing adds the file's people to the tree; into a tree that already
  // has them, everyone would be there twice.
  const existing = Object.keys(state.people).length;
  if (existing && !confirm(t("confirmGedMerge", { n: existing }))) return;
  try {
    const imported = parseGedcom(await file.text());
    const idMap: Record<string, string> = {};
    imported.people.forEach((p) => {
      const nid = newId();
      idMap[p.gedId] = nid;
      const n = Object.keys(state.people).length;
      const cols = Math.max(1, Math.ceil(Math.sqrt(n + 1)));
      state.people[nid] = {
        id: nid,
        first: p.first,
        last: p.last,
        birth: p.birth,
        death: p.death,
        gender: p.gender,
        place: p.place,
        occupation: p.occupation,
        notes: p.notes,
        photo: null,
        x: 80 + (n % cols) * 210,
        y: 80 + Math.floor(n / cols) * 230,
      };
    });
    imported.relationships.forEach((rel) => {
      const a = idMap[rel.a],
        b = idMap[rel.b];
      if (a && b) state.relationships.push({ a, b, type: rel.type });
    });
    saveState();
    render();
    closeModal("modal-gedcom");
    showToast(t("imported", { n: imported.people.length }));
  } catch (ex) {
    alert(t("gedError", { msg: ex instanceof Error ? ex.message : String(ex) }));
  }
}

export function exportGedcom(): void {
  if (!Object.keys(state.people).length) {
    showToast(t("nothingToExport"));
    return;
  }
  download(buildGedcom(state), "text/plain", "rootfree-export.ged");
  showToast(t("gedExported"));
}

function download(content: string, type: string, name: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

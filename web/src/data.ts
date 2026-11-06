// Delete all, JSON backup / restore, GEDCOM import / export.

import { t } from "./i18n.ts";
import { closeModal, el, newId, openModal, showToast, state } from "./state.ts";
import { saveState } from "./sync.ts";
import { render } from "./tree-view.ts";
import type { Gender, Person, Relationship, Tree } from "./types.ts";

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

interface GedPerson {
  gedId: string;
  first: string;
  last: string;
  birth: string;
  death: string;
  gender: Gender;
  place: string;
  occupation: string;
  notes: string;
}

/** People and relationships of a GEDCOM file, with GEDCOM ids (@I1@). */
export function parseGedcom(text: string): { people: GedPerson[]; relationships: Relationship[] } {
  const lines = text.split(/\r?\n/);
  const parse = (line: string) => {
    const m = line.match(/^(\d+)\s+(@\S+@|\S+)\s*(.*)?$/);
    return m ? { lvl: m[1], tag: m[2], val: (m[3] || "").trim() } : null;
  };
  const people: GedPerson[] = [];
  const relationships: Relationship[] = [];

  let cur: GedPerson | null = null;
  let inTag: "BIRT" | "DEAT" | null = null;
  lines.forEach((line) => {
    const m = parse(line);
    if (!m) return;
    const { lvl, tag, val } = m;
    if (lvl === "0" && tag.startsWith("@") && val === "INDI") {
      cur = {
        gedId: tag,
        first: "",
        last: "",
        birth: "",
        death: "",
        gender: "unknown",
        place: "",
        occupation: "",
        notes: "",
      };
      inTag = null;
      people.push(cur);
    } else if (lvl === "0") {
      cur = null;
      inTag = null;
    } else if (cur) {
      if (tag === "NAME") {
        const sM = val.match(/\/([^/]*)\//);
        cur.last = sM ? sM[1].trim() : "";
        cur.first = val.replace(/\/[^/]*\//, "").trim();
      } else if (tag === "SEX") cur.gender = val === "M" ? "male" : val === "F" ? "female" : "other";
      else if (tag === "BIRT") inTag = "BIRT";
      else if (tag === "DEAT") inTag = "DEAT";
      else if (tag === "OCCU") cur.occupation = val;
      else if (tag === "NOTE") cur.notes = (cur.notes + " " + val).trim();
      else if (tag === "DATE") {
        if (inTag === "BIRT") cur.birth = parseGedDate(val);
        else if (inTag === "DEAT") cur.death = parseGedDate(val);
      } else if (tag === "PLAC") {
        if (inTag === "BIRT") cur.place = val;
        inTag = null;
      } else inTag = null;
    }
  });

  // Families: the partner link first, then each parent's children, in file order.
  let inFam = false;
  let husb: string | null = null,
    wife: string | null = null,
    childs: string[] = [];
  const flush = () => {
    if (husb && wife) relationships.push({ a: husb, b: wife, type: "partner" });
    for (const parent of [husb, wife]) if (parent) childs.forEach((c) => relationships.push({ a: parent, b: c, type: "parent" }));
    husb = null;
    wife = null;
    childs = [];
  };
  lines.forEach((line) => {
    const m = parse(line);
    if (!m) return;
    const { lvl, tag, val } = m;
    if (lvl === "0") {
      flush();
      inFam = tag.startsWith("@") && val === "FAM";
    } else if (inFam) {
      if (tag === "HUSB") husb = val;
      else if (tag === "WIFE") wife = val;
      else if (tag === "CHIL") childs.push(val);
    }
  });
  flush();
  return { people, relationships };
}

function parseGedDate(d: string): string {
  if (!d) return "";
  const m = d.match(/(\d{4})/);
  return m ? m[1] : d;
}

export function exportGedcom(): void {
  const ids = Object.keys(state.people);
  if (!ids.length) {
    showToast(t("nothingToExport"));
    return;
  }
  let ged =
    "0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n1 SOUR ROOTFREE\n2 NAME RootFree\n2 VERS 3.0\n0 @SUBM@ SUBM\n1 NAME RootFree User\n";
  ids.forEach((id) => {
    const p = state.people[id];
    const gid = "@" + id.toUpperCase() + "@";
    ged += `0 ${gid} INDI\n1 NAME ${(p.first || "").trim()} /${(p.last || "").trim()}/\n`;
    if (p.first) ged += `2 GIVN ${p.first}\n`;
    if (p.last) ged += `2 SURN ${p.last}\n`;
    if (p.gender) ged += `1 SEX ${p.gender === "male" ? "M" : p.gender === "female" ? "F" : "U"}\n`;
    if (p.birth) {
      ged += `1 BIRT\n2 DATE ${p.birth}\n`;
      if (p.place) ged += `2 PLAC ${p.place}\n`;
    }
    if (p.death) ged += `1 DEAT\n2 DATE ${p.death}\n`;
    if (p.occupation) ged += `1 OCCU ${p.occupation}\n`;
    if (p.notes) ged += `1 NOTE ${p.notes.replace(/\n/g, " ")}\n`;
  });
  state.relationships
    .filter((r) => r.type === "partner")
    .forEach((rel, i) => {
      const fid = `@F${i + 1}@`;
      const pA = state.people[rel.a];
      const husb = pA && pA.gender === "female" ? rel.b : rel.a;
      const wife = husb === rel.a ? rel.b : rel.a;
      ged += `0 ${fid} FAM\n1 HUSB @${husb.toUpperCase()}@\n1 WIFE @${wife.toUpperCase()}@\n`;
      const ch = new Set<string>();
      state.relationships
        .filter((r) => r.type === "parent" && (r.a === rel.a || r.a === rel.b))
        .forEach((r) => ch.add(r.b));
      ch.forEach((cid) => (ged += `1 CHIL @${cid.toUpperCase()}@\n`));
    });
  ged += "0 TRLR\n";
  download(ged, "text/plain", "rootfree-export.ged");
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

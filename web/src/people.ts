// Adding, editing, viewing and deleting people, and connecting them.

import {
  closeModal,
  el,
  esc,
  fullName,
  gClass,
  newId,
  openModal,
  photoSrc,
  showToast,
  state,
  ui,
} from "./state.ts";
import { openAddRelative } from "./relatives.ts";
import { saveState } from "./sync.ts";
import { render } from "./tree-view.ts";
import type { Gender, Person, RelType, Relationship } from "./types.ts";

const input = (id: string) => el<HTMLInputElement>(id);
const FORM_FIELDS = ["f-first", "f-last", "f-birth", "f-death", "f-place", "f-occ", "f-notes"];

// ── Person dialog ──

export function openAddPerson(): void {
  ui.editingId = null;
  ui.currentPhoto = null;
  el("modal-add-title").textContent = "Add Person";
  FORM_FIELDS.forEach((i) => (input(i).value = ""));
  el<HTMLSelectElement>("f-gender").value = "unknown";
  resetPhotoPreview();
  openModal("modal-add");
}

export function editPerson(id: string): void {
  ui.editingId = id;
  const p = state.people[id];
  el("modal-add-title").textContent = "Edit Person";
  input("f-first").value = p.first || "";
  input("f-last").value = p.last || "";
  input("f-birth").value = p.birth || "";
  input("f-death").value = p.death || "";
  el<HTMLSelectElement>("f-gender").value = p.gender || "unknown";
  input("f-place").value = p.place || "";
  input("f-occ").value = p.occupation || "";
  el<HTMLTextAreaElement>("f-notes").value = p.notes || "";
  ui.currentPhoto = photoSrc(p);
  if (ui.currentPhoto) showPhotoPreview(ui.currentPhoto);
  else resetPhotoPreview();
  openModal("modal-add");
}

export function savePerson(): void {
  const first = input("f-first").value.trim();
  const last = input("f-last").value.trim();
  if (!first && !last) {
    alert("Please enter at least a name.");
    return;
  }
  const data = {
    first,
    last,
    birth: input("f-birth").value || "",
    death: input("f-death").value || "",
    gender: el<HTMLSelectElement>("f-gender").value as Gender,
    place: input("f-place").value.trim(),
    occupation: input("f-occ").value.trim(),
    notes: el<HTMLTextAreaElement>("f-notes").value.trim(),
    photo: ui.currentPhoto,
  };
  const editing = ui.editingId;
  if (editing) {
    Object.assign(state.people[editing], data);
  } else {
    const id = newId();
    const n = Object.keys(state.people).length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n + 1)));
    state.people[id] = {
      ...data,
      id,
      x: 80 + (n % cols) * 210,
      y: 80 + Math.floor(n / cols) * 230,
    };
  }
  saveState();
  render();
  closeModal("modal-add");
  showToast(editing ? "Person updated" : "Person added");
}

export function deletePerson(id: string): void {
  delete state.people[id];
  state.relationships = state.relationships.filter((r) => r.a !== id && r.b !== id);
  saveState();
  render();
  showToast("Person deleted");
}

// ── Photo ──

export function triggerPhotoUpload(e: Event): void {
  if ((e.target as Element).id === "photo-file-input") return;
  input("photo-file-input").click();
}

export function handlePhotoUpload(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast("Photo must be under 5MB");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    ui.currentPhoto = String(reader.result);
    showPhotoPreview(ui.currentPhoto);
  };
  reader.readAsDataURL(file);
}

export function removePhoto(): void {
  ui.currentPhoto = null;
  resetPhotoPreview();
}

function showPhotoPreview(src: string): void {
  const prev = el<HTMLImageElement>("photo-preview");
  prev.src = src;
  prev.style.display = "block";
  el("photo-placeholder").style.display = "none";
  el("photo-remove").style.display = "block";
}

function resetPhotoPreview(): void {
  const prev = el<HTMLImageElement>("photo-preview");
  prev.style.display = "none";
  prev.src = "";
  el("photo-placeholder").style.display = "block";
  el("photo-remove").style.display = "none";
  input("photo-file-input").value = "";
}

// ── Person details ──

const REVERSE: Record<RelType, RelType> = { parent: "child", child: "parent", partner: "partner", sibling: "sibling" };
/** How a relationship reads from `id`'s side: "child" means id is the child. */
const labelFor = (r: Relationship, id: string): RelType => (r.a === id ? r.type : REVERSE[r.type]);

export function viewPerson(id: string): void {
  const p = state.people[id];
  if (!p) return;
  const gc = gClass(p.gender);
  el("view-header").style.borderBottom =
    "2px solid " + (gc === "male" ? "var(--green)" : gc === "female" ? "#6b4fa0" : "var(--border-mid)");
  el("view-name").textContent = fullName(p);

  // All parents go on one line ("child of Thomas & Margaret") instead of one
  // line per parent.
  const raw = state.relationships.filter((r) => r.a === id || r.b === id);
  const parentRels = raw.filter((r) => labelFor(r, id) === "child");
  const otherRels = raw.filter((r) => labelFor(r, id) !== "child");
  const personLink = (pid: string, name: string) =>
    `<a class="rel-name" href="#" data-action="viewPerson" data-id="${esc(pid)}">${esc(name)}</a>`;

  const relItems: string[] = [];
  const parentLinks = parentRels
    .map((r) => (r.a === id ? r.b : r.a))
    .filter((pid) => state.people[pid])
    .map((pid) => personLink(pid, fullName(state.people[pid])));
  if (parentLinks.length) {
    relItems.push(
      `<div class="rel-item"><span class="rel-tag">child of</span>${parentLinks.join(" &amp; ")}<button class="rel-remove" data-action="removeParents" data-id="${esc(id)}">Remove</button></div>`,
    );
  }
  otherRels.forEach((rel) => {
    const oid = rel.a === id ? rel.b : rel.a;
    const other = state.people[oid];
    if (!other) return;
    relItems.push(
      `<div class="rel-item"><span class="rel-tag">${esc(labelFor(rel, id))}</span>${personLink(oid, fullName(other))}<button class="rel-remove" data-action="removeRelationship" data-a="${esc(rel.a)}" data-b="${esc(rel.b)}" data-type="${esc(rel.type)}" data-id="${esc(id)}">Remove</button></div>`,
    );
  });

  const photo = photoSrc(p);
  el("view-body").innerHTML = `
    ${photo ? `<img class="detail-photo" src="${esc(photo)}" alt="${esc(fullName(p))}">` : ""}
    <table class="detail-table">
${p.birth ? `<tr><td>Born</td><td>${esc(p.birth)}${p.place ? " · " + esc(p.place) : ""}</td></tr>` : ""}
${p.death ? `<tr><td>Died</td><td>${esc(p.death)}</td></tr>` : ""}
<tr><td>Gender</td><td style="text-transform:capitalize">${esc(p.gender || "Unknown")}</td></tr>
${p.occupation ? `<tr><td>Occupation</td><td>${esc(p.occupation)}</td></tr>` : ""}
${p.notes ? `<tr><td>Notes</td><td style="line-height:1.6">${esc(p.notes)}</td></tr>` : ""}
    </table>
    ${relItems.length ? `<div class="rels-section"><div class="section-label" style="margin-top:16px">Connections</div>${relItems.join("")}</div>` : '<div style="margin-top:16px;font-size:12px;color:var(--text-light)">No connections added yet.</div>'}`;
  el("view-edit-btn").onclick = () => {
    closeModal("modal-view");
    editPerson(id);
  };
  el("view-relative-btn").onclick = () => {
    closeModal("modal-view");
    openAddRelative(id);
  };
  el("view-delete-btn").onclick = () => {
    if (confirm("Delete " + fullName(p) + "?")) {
      deletePerson(id);
      closeModal("modal-view");
    }
  };
  openModal("modal-view");
}

export function removeRelationship(rel: Relationship, personId: string): void {
  if (!confirm("Remove this connection?")) return;
  state.relationships = state.relationships.filter(
    (r) => !(r.a === rel.a && r.b === rel.b && r.type === rel.type),
  );
  saveState();
  render();
  viewPerson(personId);
  showToast("Connection removed");
}

/** Remove every parent connection of one person. */
export function removeParents(childId: string): void {
  if (!confirm("Remove all parent connections for this person?")) return;
  state.relationships = state.relationships.filter(
    (r) => !((r.a === childId || r.b === childId) && labelFor(r, childId) === "child"),
  );
  saveState();
  render();
  viewPerson(childId);
  showToast("Parent connections removed");
}

// ── Connection dialog ──

const DOT_COLORS: Record<string, string> = {
  male: "#2d6a4f",
  female: "#6b4fa0",
  other: "#7a7060",
  unknown: "#7a7060",
};

export function openAddRel(id: string): void {
  ui.relSourceId = id;
  ui.selectedPickId = null;
  const list = el("person-pick-list");
  list.innerHTML = "";
  const others = Object.values(state.people).filter((p: Person) => p.id !== id);
  if (!others.length) {
    list.innerHTML =
      '<div style="padding:12px;font-size:13px;color:var(--text-light)">Add more people first.</div>';
  } else
    others.forEach((p) => {
      const div = document.createElement("div");
      div.className = "person-pick-item";
      div.dataset.id = p.id;
      div.innerHTML = `<div class="person-pick-dot" style="background:${DOT_COLORS[p.gender] || "#888"}"></div><span class="person-pick-name">${esc(fullName(p))}</span><span class="person-pick-life">${esc(p.birth || "")}</span>`;
      div.onclick = () => {
        list.querySelectorAll(".person-pick-item").forEach((i) => i.classList.remove("selected"));
        div.classList.add("selected");
        ui.selectedPickId = p.id;
      };
      list.appendChild(div);
    });
  document.querySelectorAll(".rel-option").forEach((o) => o.classList.remove("selected"));
  document.querySelector('[data-rel="parent"]')?.classList.add("selected");
  ui.selectedRelType = "parent";
  openModal("modal-rel");
}

export function selectRelType(option: HTMLElement): void {
  document.querySelectorAll(".rel-option").forEach((o) => o.classList.remove("selected"));
  option.classList.add("selected");
  ui.selectedRelType = option.dataset.rel as RelType;
}

export function saveRelationship(): void {
  const a = ui.relSourceId,
    b = ui.selectedPickId;
  if (!a || !b) {
    alert("Select a person to connect to.");
    return;
  }
  if (state.relationships.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))) {
    showToast("Already connected");
    return;
  }
  state.relationships.push({ a, b, type: ui.selectedRelType });
  saveState();
  render();
  closeModal("modal-rel");
  showToast("Connected");
}

// ═══════════════════════════════════════
// PERSON CRUD
// ═══════════════════════════════════════
function openAddPerson() {
  const canEdit = !peer || isHost || shareMode === "edit";
  if (!canEdit) {
    showToast("View only — cannot add people");
    return;
  }
  editingId = null;
  currentPhoto = null;
  document.getElementById("modal-add-title").textContent = "Add Person";
  [
    "f-first",
    "f-last",
    "f-birth",
    "f-death",
    "f-place",
    "f-occ",
    "f-notes",
  ].forEach((i) => (document.getElementById(i).value = ""));
  document.getElementById("f-gender").value = "unknown";
  resetPhotoPreview();
  document.getElementById("modal-add").style.display = "flex";
}

function triggerPhotoUpload() {
  if (event.target.id === "photo-file-input") return;
  document.getElementById("photo-file-input").click();
}
function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast("Photo must be under 5MB");
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    currentPhoto = ev.target.result;
    const prev = document.getElementById("photo-preview");
    prev.src = currentPhoto;
    prev.style.display = "block";
    document.getElementById("photo-placeholder").style.display = "none";
    document.getElementById("photo-remove").style.display = "block";
  };
  reader.readAsDataURL(file);
}
function removePhoto(e) {
  e.stopPropagation();
  currentPhoto = null;
  resetPhotoPreview();
}
function resetPhotoPreview() {
  document.getElementById("photo-preview").style.display = "none";
  document.getElementById("photo-preview").src = "";
  document.getElementById("photo-placeholder").style.display = "block";
  document.getElementById("photo-remove").style.display = "none";
  document.getElementById("photo-file-input").value = "";
}

function savePerson() {
  const first = document.getElementById("f-first").value.trim();
  const last = document.getElementById("f-last").value.trim();
  if (!first && !last) {
    alert("Please enter at least a name.");
    return;
  }
  const data = {
    first,
    last,
    birth: document.getElementById("f-birth").value || "",
    death: document.getElementById("f-death").value || "",
    gender: document.getElementById("f-gender").value,
    place: document.getElementById("f-place").value.trim(),
    occupation: document.getElementById("f-occ").value.trim(),
    notes: document.getElementById("f-notes").value.trim(),
    photo: currentPhoto,
  };
  if (editingId) {
    Object.assign(state.people[editingId], data);
  } else {
    const id = "p" + state.nextId++;
    const n = Object.keys(state.people).length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n + 1)));
    data.id = id;
    data.x = 80 + (n % cols) * 210;
    data.y = 80 + Math.floor(n / cols) * 230;
    state.people[id] = data;
  }
  saveState();
  render();
  broadcast();
  closeModal("modal-add");
  showToast(editingId ? "Person updated" : "Person added");
}

function editPerson(id) {
  editingId = id;
  const p = state.people[id];
  document.getElementById("modal-add-title").textContent = "Edit Person";
  document.getElementById("f-first").value = p.first || "";
  document.getElementById("f-last").value = p.last || "";
  document.getElementById("f-birth").value = p.birth || "";
  document.getElementById("f-death").value = p.death || "";
  document.getElementById("f-gender").value = p.gender || "unknown";
  document.getElementById("f-place").value = p.place || "";
  document.getElementById("f-occ").value = p.occupation || "";
  document.getElementById("f-notes").value = p.notes || "";
  currentPhoto = p.photo || null;
  if (currentPhoto) {
    document.getElementById("photo-preview").src = currentPhoto;
    document.getElementById("photo-preview").style.display = "block";
    document.getElementById("photo-placeholder").style.display = "none";
    document.getElementById("photo-remove").style.display = "block";
  } else resetPhotoPreview();
  document.getElementById("modal-add").style.display = "flex";
}

function deletePerson(id) {
  delete state.people[id];
  state.relationships = state.relationships.filter(
    (r) => r.a !== id && r.b !== id,
  );
  saveState();
  render();
  broadcast();
  showToast("Person deleted");
}

function viewPerson(id) {
  const p = state.people[id];
  const gc = gClass(p.gender);
  document.getElementById("view-header").style.borderBottom =
    "2px solid " +
    (gc === "male"
      ? "var(--green)"
      : gc === "female"
        ? "#6b4fa0"
        : "var(--border-mid)");
  document.getElementById("view-name").textContent = fullName(p);
  const canEdit = !peer || isHost || shareMode === "edit";

  // Build deduplicated relationship list.
  // Problem: if James is child of both Thomas AND Margaret, we get two separate
  // "child of Thomas" and "child of Margaret" entries which looks cluttered.
  // Fix: group parent relationships — if multiple people are all parents of this
  // person, show them on one line: "child of Thomas Ellis & Margaret Ellis"
  const raw = state.relationships.filter((r) => r.a === id || r.b === id);
  const rev = {
    parent: "child",
    child: "parent",
    partner: "partner",
    sibling: "sibling",
  };

  // Separate parent-of-this-person rels from everything else
  const parentRels = raw.filter((r) => {
    const label = r.a === id ? r.type : rev[r.type];
    return label === "child"; // "this person is child of..."
  });
  const otherRels = raw.filter((r) => {
    const label = r.a === id ? r.type : rev[r.type];
    return label !== "child";
  });

  const relItems = [];

  // Group all parents into one line
  if (parentRels.length > 0) {
    const parentIds = parentRels.map((r) => (r.a === id ? r.b : r.a));
    const parentNames = parentIds
      .map((pid) => {
        const op = state.people[pid];
        if (!op) return null;
        return `<a class="rel-name" href="#" onclick="closeModal('modal-view');viewPerson('${pid}');return false">${fullName(op)}</a>`;
      })
      .filter(Boolean);
    if (parentNames.length) {
      const removeBtn = canEdit
        ? `<button class="rel-remove" onclick="removeRelationshipGroup(${JSON.stringify(parentIds)},'${id}')">Remove</button>`
        : "";
      relItems.push(
        `<div class="rel-item"><span class="rel-tag">child of</span>${parentNames.join(" &amp; ")}${removeBtn}</div>`,
      );
    }
  }

  // All other relationships
  otherRels.forEach((rel) => {
    const oid = rel.a === id ? rel.b : rel.a;
    const other = state.people[oid];
    if (!other) return;
    const label = rel.a === id ? rel.type : rev[rel.type] || rel.type;
    const relIdx = state.relationships.indexOf(rel);
    const removeBtn = canEdit
      ? `<button class="rel-remove" onclick="removeRelationship(${relIdx},'${id}')">Remove</button>`
      : "";
    relItems.push(
      `<div class="rel-item"><span class="rel-tag">${label}</span><a class="rel-name" href="#" onclick="closeModal('modal-view');viewPerson('${oid}');return false">${fullName(other)}</a>${removeBtn}</div>`,
    );
  });

  document.getElementById("view-body").innerHTML = `
    ${p.photo ? `<img class="detail-photo" src="${p.photo}" alt="${fullName(p)}">` : ""}
    <table class="detail-table">
${p.birth ? `<tr><td>Born</td><td>${p.birth}${p.place ? " · " + p.place : ""}</td></tr>` : ""}
${p.death ? `<tr><td>Died</td><td>${p.death}</td></tr>` : ""}
<tr><td>Gender</td><td style="text-transform:capitalize">${p.gender || "Unknown"}</td></tr>
${p.occupation ? `<tr><td>Occupation</td><td>${p.occupation}</td></tr>` : ""}
${p.notes ? `<tr><td>Notes</td><td style="line-height:1.6">${p.notes}</td></tr>` : ""}
    </table>
    ${relItems.length ? `<div class="rels-section"><div class="section-label" style="margin-top:16px">Connections</div>${relItems.join("")}</div>` : '<div style="margin-top:16px;font-size:12px;color:var(--text-light)">No connections added yet.</div>'}`;
  document.getElementById("view-edit-btn").style.display = canEdit
    ? ""
    : "none";
  document.getElementById("view-delete-btn").style.display = canEdit
    ? ""
    : "none";
  document.getElementById("view-edit-btn").onclick = () => {
    closeModal("modal-view");
    editPerson(id);
  };
  document.getElementById("view-delete-btn").onclick = () => {
    if (confirm("Delete " + fullName(p) + "?")) {
      deletePerson(id);
      closeModal("modal-view");
    }
  };
  document.getElementById("modal-view").style.display = "flex";
}

function removeRelationship(idx, personId) {
  if (!confirm("Remove this connection?")) return;
  state.relationships.splice(idx, 1);
  saveState();
  render();
  broadcast();
  viewPerson(personId); // refresh the modal
  showToast("Connection removed");
}

function removeRelationshipGroup(parentIds, childId) {
  if (!confirm("Remove all parent connections for this person?")) return;
  state.relationships = state.relationships.filter((r) => {
    // Remove any rel that is a parent→child or child→parent between these parents and this child
    const isParentRel =
      (r.a === childId || r.b === childId) &&
      parentIds.includes(r.a === childId ? r.b : r.a);
    return !isParentRel;
  });
  saveState();
  render();
  broadcast();
  viewPerson(childId);
  showToast("Parent connections removed");
}

// ═══════════════════════════════════════
// RELATIONSHIPS
// ═══════════════════════════════════════
function openAddRel(id) {
  const canEdit = !peer || isHost || shareMode === "edit";
  if (!canEdit) {
    showToast("View only — cannot add connections");
    return;
  }
  relSourceId = id;
  selectedPickId = null;
  const gColors = {
    male: "#2d6a4f",
    female: "#6b4fa0",
    other: "#7a7060",
    unknown: "#7a7060",
  };
  const list = document.getElementById("person-pick-list");
  list.innerHTML = "";
  const others = Object.values(state.people).filter((p) => p.id !== id);
  if (!others.length) {
    list.innerHTML =
      '<div style="padding:12px;font-size:13px;color:var(--text-light)">Add more people first.</div>';
  } else
    others.forEach((p) => {
      const div = document.createElement("div");
      div.className = "person-pick-item";
      div.dataset.id = p.id;
      div.innerHTML = `<div class="person-pick-dot" style="background:${gColors[p.gender] || "#888"}"></div><span class="person-pick-name">${fullName(p)}</span><span class="person-pick-life">${p.birth || ""}</span>`;
      div.onclick = () => {
        list
          .querySelectorAll(".person-pick-item")
          .forEach((i) => i.classList.remove("selected"));
        div.classList.add("selected");
        selectedPickId = p.id;
      };
      list.appendChild(div);
    });
  document
    .querySelectorAll(".rel-option")
    .forEach((o) => o.classList.remove("selected"));
  document.querySelector('[data-rel="parent"]').classList.add("selected");
  selectedRelType = "parent";
  document.getElementById("modal-rel").style.display = "flex";
}

function selectRelType(el) {
  document
    .querySelectorAll(".rel-option")
    .forEach((o) => o.classList.remove("selected"));
  el.classList.add("selected");
  selectedRelType = el.dataset.rel;
}

function saveRelationship() {
  if (!selectedPickId) {
    alert("Select a person to connect to.");
    return;
  }
  if (
    state.relationships.some(
      (r) =>
        (r.a === relSourceId && r.b === selectedPickId) ||
        (r.a === selectedPickId && r.b === relSourceId),
    )
  ) {
    showToast("Already connected");
    return;
  }
  state.relationships.push({
    a: relSourceId,
    b: selectedPickId,
    type: selectedRelType,
  });
  saveState();
  render();
  broadcast();
  closeModal("modal-rel");
  showToast("Connected");
}

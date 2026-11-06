// ═══════════════════════════════════════
// MODALS
// ═══════════════════════════════════════
function closeModal(id) {
  document.getElementById(id).style.display = "none";
}
function confirmDeleteAll() {
  document.getElementById("modal-delete").style.display = "flex";
}
function deleteAllData() {
  state = { people: {}, relationships: [], nextId: 1 };
  try {
    localStorage.removeItem(STORE_KEY);
  } catch (e) {}
  render();
  closeModal("modal-delete");
  showToast("All data deleted");
}

// ═══════════════════════════════════════
// EXPORT / IMPORT
// ═══════════════════════════════════════
function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rootfree-backup.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Backup downloaded");
}
function importJson() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imp = JSON.parse(ev.target.result);
        if (imp.people && imp.relationships) {
          if (confirm("Merge imported data with current tree?")) {
            const idMap = {};
            Object.values(imp.people).forEach((p) => {
              const nid = "p" + state.nextId++;
              idMap[p.id] = nid;
              state.people[nid] = { ...p, id: nid };
            });
            imp.relationships.forEach((r) => {
              const na = idMap[r.a],
                nb = idMap[r.b];
              if (na && nb)
                state.relationships.push({ ...r, a: na, b: nb });
            });
            saveState();
            render();
            broadcast();
            showToast("Data imported and merged");
          }
        } else alert("Invalid RootFree backup file.");
      } catch (ex) {
        alert("Could not parse file.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ═══════════════════════════════════════
// GEDCOM
// ═══════════════════════════════════════
function openGedcomImport() {
  document.getElementById("gedcom-file").value = "";
  document.getElementById("gedcom-preview").style.display = "none";
  document.getElementById("modal-gedcom").style.display = "flex";
  document.getElementById("gedcom-file").onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      const lines = ev.target.result.split(/\r?\n/);
      const inds = lines.filter(
        (l) => l.includes("@") && l.includes("INDI"),
      ).length;
      const fams = lines.filter(
        (l) => l.includes("@") && l.includes("FAM"),
      ).length;
      const prev = document.getElementById("gedcom-preview");
      prev.textContent = `Found ${inds} individuals and ${fams} families — ready to import.`;
      prev.style.display = "block";
    };
    r.readAsText(f);
  };
}

function doGedcomImport() {
  const file = document.getElementById("gedcom-file").files[0];
  if (!file) {
    alert("Please select a .ged file.");
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const imported = parseGedcom(ev.target.result);
      const idMap = {};
      let added = 0;
      imported.people.forEach((p) => {
        const nid = "p" + state.nextId++;
        idMap[p.gedId] = nid;
        const n = Object.keys(state.people).length;
        const cols = Math.max(1, Math.ceil(Math.sqrt(n + 1)));
        state.people[nid] = {
          id: nid,
          first: p.first || "",
          last: p.last || "",
          birth: p.birth || "",
          death: p.death || "",
          gender: p.gender || "unknown",
          place: p.place || "",
          occupation: p.occupation || "",
          notes: p.notes || "",
          photo: null,
          x: 80 + (n % cols) * 210,
          y: 80 + Math.floor(n / cols) * 230,
        };
        added++;
      });
      imported.relationships.forEach((rel) => {
        const a = idMap[rel.a],
          b = idMap[rel.b];
        if (a && b) state.relationships.push({ a, b, type: rel.type });
      });
      saveState();
      render();
      broadcast();
      closeModal("modal-gedcom");
      showToast("Imported " + added + " people");
    } catch (ex) {
      alert("Error parsing GEDCOM: " + ex.message);
    }
  };
  reader.readAsText(file);
}

function parseGedcom(text) {
  const lines = text.split(/\r?\n/);
  const people = [];
  const relationships = [];
  let cur = null,
    inTag = null;
  lines.forEach((line) => {
    const m = line.match(/^(\d+)\s+(@\S+@|\S+)\s*(.*)?$/);
    if (!m) return;
    const lvl = m[1],
      tag = m[2],
      val = (m[3] || "").trim();
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
      } else if (tag === "SEX")
        cur.gender =
          val === "M" ? "male" : val === "F" ? "female" : "other";
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
      } else if (!["BIRT", "DEAT"].includes(tag)) inTag = null;
    }
  });
  cur = null;
  let husb = null,
    wife = null,
    childs = [];
  lines.forEach((line) => {
    const m = line.match(/^(\d+)\s+(@\S+@|\S+)\s*(.*)?$/);
    if (!m) return;
    const lvl = m[1],
      tag = m[2],
      val = (m[3] || "").trim();
    if (lvl === "0" && tag.startsWith("@") && val === "FAM") {
      if (husb && wife)
        relationships.push({ a: husb, b: wife, type: "partner" });
      if (husb)
        childs.forEach((c) =>
          relationships.push({ a: husb, b: c, type: "parent" }),
        );
      if (wife)
        childs.forEach((c) =>
          relationships.push({ a: wife, b: c, type: "parent" }),
        );
      husb = null;
      wife = null;
      childs = [];
      cur = "fam";
    } else if (lvl === "0") {
      if (husb && wife)
        relationships.push({ a: husb, b: wife, type: "partner" });
      if (husb)
        childs.forEach((c) =>
          relationships.push({ a: husb, b: c, type: "parent" }),
        );
      if (wife)
        childs.forEach((c) =>
          relationships.push({ a: wife, b: c, type: "parent" }),
        );
      husb = null;
      wife = null;
      childs = [];
      cur = null;
    } else if (cur === "fam") {
      if (tag === "HUSB") husb = val;
      else if (tag === "WIFE") wife = val;
      else if (tag === "CHIL") childs.push(val);
    }
  });
  if (husb && wife)
    relationships.push({ a: husb, b: wife, type: "partner" });
  if (husb)
    childs.forEach((c) =>
      relationships.push({ a: husb, b: c, type: "parent" }),
    );
  if (wife)
    childs.forEach((c) =>
      relationships.push({ a: wife, b: c, type: "parent" }),
    );
  return { people, relationships };
}
function parseGedDate(d) {
  if (!d) return "";
  const m = d.match(/(\d{4})/);
  return m ? m[1] : d;
}

function exportGedcom() {
  const ids = Object.keys(state.people);
  if (!ids.length) {
    showToast("No people to export");
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
    if (p.gender)
      ged += `1 SEX ${p.gender === "male" ? "M" : p.gender === "female" ? "F" : "U"}\n`;
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
      const ch = new Set();
      state.relationships
        .filter(
          (r) => r.type === "parent" && (r.a === rel.a || r.a === rel.b),
        )
        .forEach((r) => ch.add(r.b));
      ch.forEach((cid) => (ged += `1 CHIL @${cid.toUpperCase()}@\n`));
    });
  ged += "0 TRLR\n";
  const blob = new Blob([ged], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rootfree-export.ged";
  a.click();
  URL.revokeObjectURL(url);
  showToast("GEDCOM exported");
}

// ═══════════════════════════════════════
// GENERATION VIEW
// ═══════════════════════════════════════
function computeGenerations() {
  const children = {},
    parents = {};
  Object.keys(state.people).forEach((id) => {
    children[id] = [];
    parents[id] = [];
  });
  state.relationships.forEach((rel) => {
    if (rel.type === "parent") {
      children[rel.a].push(rel.b);
      parents[rel.b].push(rel.a);
    } else if (rel.type === "child") {
      children[rel.b].push(rel.a);
      parents[rel.a].push(rel.b);
    }
  });
  const gen = {};
  const roots = Object.keys(state.people).filter(
    (id) => parents[id].length === 0,
  );
  if (!roots.length) return { gen: {}, maxGen: 0 };
  const queue = [...roots];
  roots.forEach((r) => (gen[r] = 0));
  while (queue.length) {
    const cur = queue.shift();
    (children[cur] || []).forEach((ch) => {
      if (gen[ch] === undefined) {
        gen[ch] = (gen[cur] || 0) + 1;
        queue.push(ch);
      } else gen[ch] = Math.max(gen[ch], (gen[cur] || 0) + 1);
    });
  }
  Object.keys(state.people).forEach((id) => {
    if (gen[id] === undefined) gen[id] = 0;
  });
  return { gen, maxGen: Math.max(0, ...Object.values(gen)) };
}

function renderGenView() {
  const { blocksByGen, maxGen } = buildFamilyLayoutBlocks();
  const { badge } = marriageInfo();
  const content = document.getElementById("gen-content");
  content.innerHTML = "";
  if (!Object.keys(state.people).length) {
    content.innerHTML =
      '<div style="text-align:center;color:var(--text-light);padding:60px 0;font-size:13px">Add people in the Tree view first.</div>';
    return;
  }
  const genLabels = [
    "Great-great-grandparents",
    "Great-grandparents",
    "Grandparents",
    "Parents",
    "You / Siblings",
    "Children",
    "Grandchildren",
    "Great-grandchildren",
  ];
  for (let g = 0; g <= maxGen; g++) {
    const blocks = blocksByGen[g] || [];
    if (!blocks.length) continue;
    if (g > 0) {
      const div = document.createElement("div");
      div.className = "gen-divider";
      content.appendChild(div);
    }
    const label = document.createElement("div");
    label.className = "gen-label";
    label.textContent = genLabels[g] || "Generation " + (g + 1);
    content.appendChild(label);
    const row = document.createElement("div");
    row.className = "gen-row";
    blocks.forEach((block) => {
      const couple = document.createElement("div");
      couple.className = "gen-couple";
      block.members.forEach((id) => {
        const p = state.people[id];
        const gc = gClass(p.gender);
        const card = document.createElement("div");
        card.className = "gen-card";
        card.onclick = () => viewPerson(id);
        const photoHtml = p.photo
          ? `<img class="gen-card-photo" src="${p.photo}" alt="">`
          : `<div class="gen-card-placeholder ${gc}">${personSVG(gc)}</div>`;
        card.innerHTML = `${photoHtml}<div class="gen-card-body"><div class="gen-card-name">${fullName(p)}</div><div class="gen-card-life">${lifespan(p) || "&nbsp;"}</div>${badge[id] ? `<div class="gen-card-badge">${badge[id]}</div>` : ""}</div>`;
        couple.appendChild(card);
      });
      row.appendChild(couple);
    });
    content.appendChild(row);
  }
}

// ═══════════════════════════════════════
// LIST VIEW
// ═══════════════════════════════════════
function renderListView() {
  const ids = Object.keys(state.people);
  document.getElementById("list-count").textContent =
    ids.length + " " + (ids.length === 1 ? "person" : "people");
  if (!ids.length) {
    document.getElementById("list-body").innerHTML =
      '<div style="text-align:center;color:var(--text-light);padding:40px 0;font-size:13px">No people added yet.</div>';
    return;
  }
  const sorted = [...ids].sort((a, b) =>
    fullName(state.people[a]).localeCompare(fullName(state.people[b])),
  );
  document.getElementById("list-body").innerHTML = `
    <table class="data-table">
<thead><tr>
  <th>Name</th><th>Life</th><th>Place</th><th>Connections</th><th></th>
</tr></thead>
<tbody>${sorted
  .map((id) => {
    const p = state.people[id];
    const rels = state.relationships.filter(
      (r) => r.a === id || r.b === id,
    ).length;
    const gc = gClass(p.gender);
    const avatarHtml = p.photo
      ? `<img class="person-avatar-sm" src="${p.photo}" alt="">`
      : `<div class="person-avatar-dot ${gc}"></div>`;
    return `<tr>
    <td><div style="display:flex;align-items:center;gap:10px">${avatarHtml}<span style="font-weight:500">${fullName(p)}</span></div></td>
    <td style="color:var(--text-mid)">${lifespan(p) || "—"}</td>
    <td style="color:var(--text-mid)">${p.place || "—"}</td>
    <td style="color:var(--text-mid)">${rels}</td>
    <td><button onclick="viewPerson('${id}')" class="btn" style="padding:4px 10px;font-size:11px">View</button></td>
  </tr>`;
  })
  .join("")}</tbody>
    </table>`;
}

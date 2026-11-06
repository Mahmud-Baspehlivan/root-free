// The Generations view and the People list.

import { t, type Key } from "./i18n.ts";
import { buildFamilyLayoutBlocks, marriageInfo } from "./layout.ts";
import { el, esc, fullName, gClass, lifespan, personSVG, photoSrc, state } from "./state.ts";

const GEN_LABELS: Key[] = ["gen0", "gen1", "gen2", "gen3", "gen4", "gen5", "gen6", "gen7"];

export function renderGenView(): void {
  // Same generations as the tree's Generation Layout, with partners kept together.
  const { blocksByGen, maxGen } = buildFamilyLayoutBlocks();
  const { badge } = marriageInfo();
  const content = el("gen-content");
  content.innerHTML = "";
  if (!Object.keys(state.people).length) {
    content.innerHTML =
      `<div style="text-align:center;color:var(--text-light);padding:60px 0;font-size:13px">${esc(t("addInTreeFirst"))}</div>`;
    return;
  }
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
    label.textContent = GEN_LABELS[g] ? t(GEN_LABELS[g]) : t("genN", { n: g + 1 });
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
        card.dataset.action = "viewPerson";
        card.dataset.id = id;
        const photo = photoSrc(p);
        const photoHtml = photo
          ? `<img class="gen-card-photo" src="${esc(photo)}" alt="">`
          : `<div class="gen-card-placeholder ${gc}">${personSVG(gc)}</div>`;
        card.innerHTML = `${photoHtml}<div class="gen-card-body"><div class="gen-card-name">${esc(fullName(p))}</div><div class="gen-card-life">${esc(lifespan(p)) || "&nbsp;"}</div>${badge[id] ? `<div class="gen-card-badge">${esc(badge[id])}</div>` : ""}</div>`;
        couple.appendChild(card);
      });
      row.appendChild(couple);
    });
    content.appendChild(row);
  }
}

export function renderListView(): void {
  const ids = Object.keys(state.people);
  el("list-count").textContent = ids.length === 1 ? t("onePerson") : t("nPeople", { n: ids.length });
  if (!ids.length) {
    el("list-body").innerHTML =
      `<div style="text-align:center;color:var(--text-light);padding:40px 0;font-size:13px">${esc(t("noPeople"))}</div>`;
    return;
  }
  const sorted = [...ids].sort((a, b) => fullName(state.people[a]).localeCompare(fullName(state.people[b])));
  const rows = sorted
    .map((id) => {
      const p = state.people[id];
      const rels = state.relationships.filter((r) => r.a === id || r.b === id).length;
      const gc = gClass(p.gender);
      const photo = photoSrc(p);
      const avatarHtml = photo
        ? `<img class="person-avatar-sm" src="${esc(photo)}" alt="">`
        : `<div class="person-avatar-dot ${gc}"></div>`;
      return `<tr>
    <td><div style="display:flex;align-items:center;gap:10px">${avatarHtml}<span style="font-weight:500">${esc(fullName(p))}</span></div></td>
    <td style="color:var(--text-mid)">${esc(lifespan(p)) || "—"}</td>
    <td style="color:var(--text-mid)">${esc(p.place) || "—"}</td>
    <td style="color:var(--text-mid)">${rels}</td>
    <td><button data-action="viewPerson" data-id="${esc(id)}" class="btn" style="padding:4px 10px;font-size:11px">${esc(t("view"))}</button></td>
  </tr>`;
    })
    .join("");
  el("list-body").innerHTML = `
    <table class="data-table">
<thead><tr>
  <th>${esc(t("colName"))}</th><th>${esc(t("colLife"))}</th><th>${esc(t("colPlace"))}</th><th>${esc(t("colConnections"))}</th><th></th>
</tr></thead>
<tbody>${rows}</tbody>
    </table>`;
}

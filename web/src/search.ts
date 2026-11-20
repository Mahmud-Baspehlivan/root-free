// Finding someone in the tree: type a name, pick them, and the tree scrolls to
// their card and lights it up. Matching is in search-match.ts.

import { reveal } from "./collapse.ts";
import { t } from "./i18n.ts";
import { findPeople } from "./search-match.ts";
import { el, esc, fullName, lifespan, state, ui } from "./state.ts";
import { render, switchView } from "./tree-view.ts";

const input = () => el<HTMLInputElement>("search-input");
const results = () => el("search-results");
let active = 0;

export function initSearch(): void {
  input().addEventListener("input", () => {
    active = 0;
    showResults();
  });
  input().addEventListener("focus", showResults);
  input().addEventListener("keydown", (e) => {
    const items = results().querySelectorAll<HTMLElement>(".search-item");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
      highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = items[active] ?? items[0];
      if (pick) goToPerson(pick.dataset.id!);
    } else if (e.key === "Escape") {
      closeSearch();
      input().blur();
    }
  });
  // A click anywhere else closes the list (and, on phones, the box).
  document.addEventListener("click", (e) => {
    if (!(e.target as Element).closest("#search")) closeSearch();
  });
  // "/" jumps to the search box, as on many sites.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as Element).closest("input, textarea, select, [contenteditable]")) return;
    if (ui.view !== "canvas" || [...document.querySelectorAll<HTMLElement>(".modal-overlay")].some((m) => m.style.display === "flex")) return;
    e.preventDefault();
    openSearch();
  });
}

/** Phones show only a 🔍 button; it opens the box. */
export function openSearch(): void {
  el("search").classList.add("open");
  input().focus();
  input().select();
}

function closeSearch(): void {
  hideResults();
  el("search").classList.remove("open");
}

function hideResults(): void {
  results().hidden = true;
  input().setAttribute("aria-expanded", "false");
}

function showResults(): void {
  const query = input().value;
  const ids = findPeople(state, query);
  const list = results();
  if (!query.trim()) {
    hideResults();
    return;
  }
  list.innerHTML = ids.length
    ? ids
        .map(
          (id, i) =>
            `<button type="button" class="search-item" role="option" id="search-opt-${i}" data-action="goToPerson" data-id="${esc(id)}">
  <span class="search-name">${esc(fullName(state.people[id]))}</span>
  <span class="search-meta">${esc(describe(id))}</span>
</button>`,
        )
        .join("")
    : `<div class="search-empty">${esc(t("searchNone"))}</div>`;
  list.hidden = false;
  input().setAttribute("aria-expanded", "true");
  highlight();
}

function highlight(): void {
  const items = results().querySelectorAll<HTMLElement>(".search-item");
  items.forEach((item, i) => item.classList.toggle("active", i === active));
  if (items[active]) input().setAttribute("aria-activedescendant", items[active].id);
  else input().removeAttribute("aria-activedescendant");
}

/** Years, place and parents (or spouse), to tell apart people with the same name. */
function describe(id: string): string {
  const p = state.people[id];
  const names = (ids: string[]) => ids.map((x) => fullName(state.people[x])).join(", ");
  const parents = state.relationships.filter((r) => r.type === "parent" && r.b === id && state.people[r.a]).map((r) => r.a);
  const partners = state.relationships
    .filter((r) => r.type === "partner" && (r.a === id || r.b === id))
    .map((r) => (r.a === id ? r.b : r.a))
    .filter((x) => state.people[x]);
  const family = parents.length
    ? t("searchParents", { names: names(parents) })
    : partners.length
      ? t("searchSpouse", { names: names(partners) })
      : "";
  return [lifespan(p), p.place, family].filter(Boolean).join(" · ");
}

/** Show a person's card: open the tree view and any closed branch they are in, scroll to them, light them up. */
export function goToPerson(id: string): void {
  if (!state.people[id]) return;
  closeSearch();
  input().blur();
  if (ui.view !== "canvas") switchView("canvas");
  if (!document.getElementById("card-" + id)) {
    reveal([id]);
    render();
  }
  const card = document.getElementById("card-" + id);
  if (!card) return;
  card.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  card.classList.remove("found");
  void card.offsetWidth; // restart the animation when the same person is picked again
  card.classList.add("found");
  setTimeout(() => card.classList.remove("found"), 2600);
}

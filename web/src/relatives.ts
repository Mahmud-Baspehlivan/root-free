// "Add a relative": add people through someone already in the tree, so the
// connections are made at the same time (see relatives-plan.ts).

import { arrangeByGeneration, marriageInfo, marriageLabel } from "./layout.ts";
import {
  MANY,
  defaultGender,
  defaultLastName,
  defaultOtherParent,
  partnersOf,
  planRelatives,
  splitNames,
  type Relation,
} from "./relatives-plan.ts";
import { closeModal, el, fullName, newId, openModal, showToast, state, ui } from "./state.ts";
import { saveState } from "./sync.ts";
import { render } from "./tree-view.ts";
import type { Gender } from "./types.ts";
import { renderGenView, renderListView } from "./views.ts";

const WORD: Record<Relation, [string, string]> = {
  father: ["father", "father"],
  mother: ["mother", "mother"],
  spouse: ["spouse", "spouse"],
  son: ["son", "sons"],
  daughter: ["daughter", "daughters"],
  brother: ["brother", "brothers"],
  sister: ["sister", "sisters"],
};

let personId: string | null = null;
let relation: Relation | null = null;
/** Once the user types a surname, picking another relation no longer replaces it. */
let lastNameTouched = false;

const names = () => el<HTMLInputElement>("relative-first");
const lastName = () => el<HTMLInputElement>("relative-last");
const otherParent = () => el<HTMLSelectElement>("relative-other");
const isChild = (r: Relation | null) => r === "son" || r === "daughter";

export function initRelatives(): void {
  lastName().addEventListener("input", () => (lastNameTouched = true));
  otherParent().addEventListener("change", updateLastName);
  for (const id of ["relative-first", "relative-last", "relative-birth"])
    el(id).addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") saveRelatives();
    });
}

export function openAddRelative(id: string): void {
  const p = state.people[id];
  if (!p) return;
  personId = id;
  relation = null;
  lastNameTouched = false;
  el("relative-title").textContent = "Add a relative of " + fullName(p);
  names().value = "";
  lastName().value = "";
  el<HTMLInputElement>("relative-birth").value = "";
  el<HTMLSelectElement>("relative-gender").value = "unknown";
  el("relative-other-group").style.display = "none";
  el("relative-form").style.display = "none";
  document.querySelectorAll("#modal-relative .relation-option").forEach((o) => o.classList.remove("selected"));
  openModal("modal-relative");
}

export function pickRelation(option: HTMLElement): void {
  if (!personId) return;
  relation = option.dataset.relation as Relation;
  document
    .querySelectorAll("#modal-relative .relation-option")
    .forEach((o) => o.classList.toggle("selected", o === option));
  const p = state.people[personId];
  const many = MANY.has(relation);
  el("relative-title").textContent = `Add ${WORD[relation][many ? 1 : 0]} of ${fullName(p)}`;
  el("relative-form").style.display = "block";
  el("relative-first-label").textContent = many ? "First name(s)" : "First name";
  names().placeholder = many ? "e.g. Hasan, Yusuf, Seher" : "First name";
  el("relative-names-hint").style.display = many ? "block" : "none";
  el<HTMLSelectElement>("relative-gender").value = defaultGender(state, personId, relation);
  fillOtherParent();
  updateLastName();
  names().focus();
}

/** For a son or daughter of someone with partners: which partner is the other parent. */
function fillOtherParent(): void {
  const group = el("relative-other-group");
  const select = otherParent();
  const partners = personId && isChild(relation) ? partnersOf(state, personId) : [];
  if (!partners.length) {
    group.style.display = "none";
    select.innerHTML = "";
    return;
  }
  const numbers = marriageInfo().number;
  const option = (value: string, text: string) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    return o;
  };
  select.replaceChildren(
    ...(partners.length > 1 ? [option("", "Choose…")] : []),
    ...partners.map((id) => {
      const no = numbers[[personId!, id].sort().join("|")];
      return option(id, fullName(state.people[id]) + (no ? ` (${marriageLabel(no)})` : ""));
    }),
    option("none", "Someone else / unknown"),
  );
  select.value = defaultOtherParent(state, personId!) ?? "";
  group.style.display = "block";
}

function chosenOtherParent(): string | null {
  const v = otherParent().value;
  return v && v !== "none" ? v : null;
}

function updateLastName(): void {
  if (!personId || !relation || lastNameTouched) return;
  lastName().value = defaultLastName(state, personId, relation, chosenOtherParent());
}

export function saveRelatives(): void {
  if (!personId) return;
  if (!relation) {
    alert("Choose how they are related.");
    return;
  }
  const list = splitNames(names().value, relation);
  if (!list.length) {
    alert("Enter a name.");
    names().focus();
    return;
  }
  if (isChild(relation) && el("relative-other-group").style.display !== "none" && otherParent().value === "") {
    alert("Choose the other parent.");
    otherParent().focus();
    return;
  }
  const plan = planRelatives(
    state,
    {
      personId,
      relation,
      names: list,
      last: lastName().value,
      birth: el<HTMLInputElement>("relative-birth").value,
      gender: el<HTMLSelectElement>("relative-gender").value as Gender,
      otherParentId: isChild(relation) ? chosenOtherParent() : null,
    },
    newId,
  );
  plan.people.forEach((p) => (state.people[p.id] = p));
  state.relationships.push(...plan.relationships);
  // The tree is rearranged so the new people stand next to their family.
  arrangeByGeneration();
  saveState();
  render();
  if (ui.view === "gen") renderGenView();
  if (ui.view === "list") renderListView();
  closeModal("modal-relative");
  showToast(plan.people.length === 1 ? `${fullName(plan.people[0])} added` : `${plan.people.length} people added`);
  if (ui.view === "canvas") showNewCards(plan.people.map((p) => p.id));
}

/** Scroll to the new cards and highlight them for a moment. */
function showNewCards(ids: string[]): void {
  const cards = ids.map((id) => document.getElementById("card-" + id)).filter((c): c is HTMLElement => !!c);
  if (!cards.length) return;
  cards[Math.floor((cards.length - 1) / 2)].scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  cards.forEach((c) => c.classList.add("just-added"));
  setTimeout(() => cards.forEach((c) => c.classList.remove("just-added")), 2500);
}

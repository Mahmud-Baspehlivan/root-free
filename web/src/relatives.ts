// "Add a relative": add people through someone already in the tree, so the
// connections are made at the same time (see relatives-plan.ts).

import { t, type Key } from "./i18n.ts";
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

/** The relation as a word in the dialog title. */
const WORD: Record<Relation, Key> = {
  father: "w_father",
  mother: "w_mother",
  spouse: "w_spouse",
  son: "w_son",
  daughter: "w_daughter",
  brother: "w_brother",
  sister: "w_sister",
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
  el("relative-title").textContent = t("addRelativeOf", { name: fullName(p) });
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
  el("relative-title").textContent = t("addWhatOf", { what: t(WORD[relation]), name: fullName(p) });
  el("relative-form").style.display = "block";
  el("relative-first-label").textContent = many ? t("firstNames") : t("firstName");
  names().placeholder = many ? t("namesPh") : t("firstName");
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
    ...(partners.length > 1 ? [option("", t("choose"))] : []),
    ...partners.map((id) => {
      const no = numbers[[personId!, id].sort().join("|")];
      return option(id, fullName(state.people[id]) + (no ? ` (${marriageLabel(no)})` : ""));
    }),
    option("none", t("someoneElse")),
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
    alert(t("chooseRelation"));
    return;
  }
  const list = splitNames(names().value, relation);
  if (!list.length) {
    alert(t("enterName"));
    names().focus();
    return;
  }
  if (isChild(relation) && el("relative-other-group").style.display !== "none" && otherParent().value === "") {
    alert(t("chooseOtherParent"));
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
  showToast(plan.people.length === 1 ? t("addedOne", { name: fullName(plan.people[0]) }) : t("addedMany", { n: plan.people.length }));
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

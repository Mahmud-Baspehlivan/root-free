// Closing branches of the tree: "▾" on a card hides that person's children,
// everything below them and the people who married into those families (see
// collapse-plan.ts). The tree is then laid out again without them, for
// viewing only: the saved positions do not change. Which branches are closed
// is remembered on this device only, so each person in the family chooses
// their own view.

import { branchOf, hiddenBy, toOpen, toReveal } from "./collapse-plan.ts";
import { withPartOfTree } from "./layout.ts";
import { state } from "./state.ts";
import type { Person, Tree } from "./types.ts";

const KEY = "rootfree_collapsed";

/** People whose branch below is closed. */
const closed = new Set<string>(load());

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function store(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...closed]));
  } catch {
    // Private mode or blocked storage: the view is just not remembered.
  }
}

/** What the canvas shows: the whole tree, or the visible part at its own positions. */
let view: { tree: Tree; hidden: Set<string> } = { tree: state, hidden: new Set() };

export const shownTree = (): Tree => view.tree;

/** True while people are hidden: the positions on the canvas are then for viewing only. */
export const isPartialView = (): boolean => view.hidden.size > 0;

export const hasClosedBranches = (): boolean => closed.size > 0;

/** Work out what the canvas shows. Called by render(), after every change. */
export function refreshView(): Tree {
  for (const id of closed) if (!state.people[id]) closed.delete(id);
  const hidden = hiddenBy(state, closed);
  if (!hidden.size) {
    view = { tree: state, hidden };
    return state;
  }
  // Copies of the visible people, laid out on their own.
  const people: Record<string, Person> = {};
  for (const [id, p] of Object.entries(state.people)) if (!hidden.has(id)) people[id] = { ...p };
  const relationships = state.relationships.filter((r) => people[r.a] && people[r.b]);
  withPartOfTree(people, relationships);
  view = { tree: { people, relationships }, hidden };
  return view.tree;
}

/** How a card's branch button looks; null when the person has no children. */
export const branchState = (id: string) => branchOf(state, view.hidden, id);

/** Close the branch below a person, or open it again. */
export function toggleBranch(id: string): void {
  const b = branchState(id);
  if (!b) return;
  if (b.open) closed.add(id);
  else toOpen(state, id).forEach((p) => closed.delete(p));
  store();
}

export function expandAll(): void {
  closed.clear();
  store();
}

/** Open the branches that hide these people (new relatives added under a closed branch). */
export function reveal(ids: string[]): void {
  const open = toReveal(state, closed, ids);
  if (!open.length) return;
  open.forEach((id) => closed.delete(id));
  store();
}

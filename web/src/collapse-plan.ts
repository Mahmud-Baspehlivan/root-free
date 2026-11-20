// Which people closed branches hide. Pure functions over a tree, so they can be
// tested without a page (see collapse.ts for the UI side).

import type { Tree } from "./types.ts";

/** Children by parent and parents by child, over people that exist. */
export function family(tree: Tree): { kids: Record<string, string[]>; parents: Record<string, string[]> } {
  const kids: Record<string, string[]> = {},
    parents: Record<string, string[]> = {};
  for (const r of tree.relationships) {
    const [p, c] = r.type === "parent" ? [r.a, r.b] : r.type === "child" ? [r.b, r.a] : [null, null];
    if (!p || !c || p === c || !tree.people[p] || !tree.people[c]) continue;
    (kids[p] ??= []).push(c);
    (parents[c] ??= []).push(p);
  }
  return { kids, parents };
}

function neighbours(tree: Tree): Record<string, string[]> {
  const adj: Record<string, string[]> = {};
  for (const r of tree.relationships) {
    if (!tree.people[r.a] || !tree.people[r.b]) continue;
    (adj[r.a] ??= []).push(r.b);
    (adj[r.b] ??= []).push(r.a);
  }
  return adj;
}

/** Everyone hidden when these people's branches are closed: all their
 * descendants, and the people who married into those families together with
 * their ancestors, when they hang off the tree only through hidden people. */
export function hiddenBy(tree: Tree, closed: Set<string>): Set<string> {
  const { kids } = family(tree);
  const hidden = new Set<string>();
  const stack = [...closed].filter((id) => tree.people[id]).flatMap((id) => kids[id] || []);
  while (stack.length) {
    const id = stack.pop()!;
    if (hidden.has(id)) continue;
    hidden.add(id);
    stack.push(...(kids[id] || []));
  }
  if (!hidden.size) return hidden;
  // People who are there only because they married into a hidden family: the
  // spouses of hidden people, their parents, grandparents and so on.
  const { parents } = family(tree);
  const inLaw = new Set<string>();
  const up: string[] = [];
  for (const r of tree.relationships) {
    if (r.type !== "partner") continue;
    if (hidden.has(r.a) && !hidden.has(r.b)) up.push(r.b);
    if (hidden.has(r.b) && !hidden.has(r.a)) up.push(r.a);
  }
  while (up.length) {
    const id = up.pop()!;
    if (inLaw.has(id) || !tree.people[id]) continue;
    inLaw.add(id);
    up.push(...(parents[id] || []));
  }
  // Group the rest by their connections. A group that touches the hidden
  // people and is made only of such in-laws goes too (Gönül and her father
  // under a closed Abdullah). A group with anyone else stays: a spouse's own
  // family with brothers, sisters and children is a branch of its own, and
  // the group holding a closed person is the part being looked at.
  const adj = neighbours(tree);
  const seen = new Set<string>();
  for (const start of Object.keys(tree.people)) {
    if (hidden.has(start) || seen.has(start)) continue;
    const group = [start];
    let touchesHidden = false,
      onlyInLaws = true;
    seen.add(start);
    for (let i = 0; i < group.length; i++) {
      const id = group[i];
      if (closed.has(id) || !inLaw.has(id)) onlyInLaws = false;
      for (const o of adj[id] || []) {
        if (hidden.has(o)) touchesHidden = true;
        else if (!seen.has(o)) {
          seen.add(o);
          group.push(o);
        }
      }
    }
    if (touchesHidden && onlyInLaws) group.forEach((id) => hidden.add(id));
  }
  return hidden;
}

/** A card's branch button: null without children; closed when every child is
 * hidden, with the number of hidden people below the person. */
export function branchOf(tree: Tree, hidden: Set<string>, id: string): { open: boolean; count: number } | null {
  const own = family(tree).kids[id] || [];
  if (!own.length) return null;
  if (own.some((c) => !hidden.has(c))) return { open: true, count: 0 };
  const adj = neighbours(tree);
  const below = new Set<string>();
  const stack = [...own];
  while (stack.length) {
    const x = stack.pop()!;
    if (below.has(x) || !hidden.has(x)) continue;
    below.add(x);
    stack.push(...(adj[x] || []));
  }
  return { open: false, count: below.size };
}

/** The closed people to reopen so a person's children show again: the
 * person, and the other parent of each child (who may be the one closed). */
export function toOpen(tree: Tree, id: string): string[] {
  const { kids, parents } = family(tree);
  return [...new Set([id, ...(kids[id] || []).flatMap((c) => parents[c] || [])])];
}

/** The closed people to reopen so these people are visible again (after
 * adding a relative under a closed branch). Every closed ancestor; if that is
 * not enough (someone who married in), every closed branch. */
export function toReveal(tree: Tree, closed: Set<string>, ids: string[]): string[] {
  const { parents } = family(tree);
  const left = new Set(closed);
  for (;;) {
    const hidden = hiddenBy(tree, left);
    const missing = ids.filter((id) => hidden.has(id));
    if (!missing.length || !left.size) break;
    let opened = false;
    const stack = [...missing];
    const seen = new Set<string>();
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      for (const p of parents[x] || []) {
        if (left.delete(p)) opened = true;
        stack.push(p);
      }
    }
    if (!opened) left.clear();
  }
  return [...closed].filter((id) => !left.has(id));
}

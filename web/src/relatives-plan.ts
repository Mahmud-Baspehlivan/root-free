// Adding someone through a relative: which people and connections that means.
// Pure functions (no DOM), so they can be tested on their own.

import type { Gender, Person, Relationship, Tree } from "./types.ts";

export type Relation = "father" | "mother" | "spouse" | "son" | "daughter" | "brother" | "sister";

/** Relations that can add several people at once (comma-separated names). */
export const MANY: ReadonlySet<Relation> = new Set(["son", "daughter", "brother", "sister"]);

export interface RelativeInput {
  personId: string;
  relation: Relation;
  /** One name, or several for children and siblings. */
  names: string[];
  last: string;
  /** Only used when one person is added. */
  birth: string;
  gender: Gender;
  /** For a son or daughter: the partner who is the other parent, or null if unknown. */
  otherParentId: string | null;
}

export interface RelativePlan {
  people: Person[];
  relationships: Relationship[];
}

/** Parents of a person, from parent and child relationships. */
export function parentsOf(tree: Tree, id: string): string[] {
  const out: string[] = [];
  for (const r of tree.relationships) {
    const parent = r.type === "parent" && r.b === id ? r.a : r.type === "child" && r.a === id ? r.b : null;
    if (parent && tree.people[parent] && !out.includes(parent)) out.push(parent);
  }
  return out;
}

/** Partners of a person, in the order the partnerships were added. */
export function partnersOf(tree: Tree, id: string): string[] {
  const out: string[] = [];
  for (const r of tree.relationships) {
    if (r.type !== "partner") continue;
    const other = r.a === id ? r.b : r.b === id ? r.a : null;
    if (other && tree.people[other] && !out.includes(other)) out.push(other);
  }
  return out;
}

/** "Hasan, Yusuf,  Seher" → ["Hasan", "Yusuf", "Seher"]; one name for single relations. */
export function splitNames(text: string, relation: Relation): string[] {
  const parts = MANY.has(relation) ? text.split(/[,\n]/) : [text];
  return parts.map((s) => s.trim()).filter(Boolean);
}

export function defaultGender(tree: Tree, personId: string, relation: Relation): Gender {
  if (relation === "father" || relation === "son" || relation === "brother") return "male";
  if (relation === "mother" || relation === "daughter" || relation === "sister") return "female";
  const g = tree.people[personId]?.gender;
  return g === "male" ? "female" : g === "female" ? "male" : "unknown";
}

/** Children take the father's surname; a mother's or spouse's is left for the user. */
export function defaultLastName(tree: Tree, personId: string, relation: Relation, otherParentId: string | null): string {
  const p = tree.people[personId];
  if (!p) return "";
  if (relation === "father") return p.last;
  if (relation === "son" || relation === "daughter") {
    const other = otherParentId ? tree.people[otherParentId] : undefined;
    if (p.gender !== "male" && other?.gender === "male") return other.last;
    return p.last;
  }
  if (relation === "brother" || relation === "sister") {
    const father = parentsOf(tree, personId)
      .map((id) => tree.people[id])
      .find((q) => q.gender === "male");
    return father ? father.last : p.last;
  }
  return "";
}

/** The other parent to suggest for a new child: the only partner, if there is just one. */
export function defaultOtherParent(tree: Tree, personId: string): string | null {
  const partners = partnersOf(tree, personId);
  return partners.length === 1 ? partners[0] : null;
}

/**
 * The people and connections that adding relatives means:
 * - father / mother: parent of the person; if the person already has exactly
 *   one parent, the two parents are also linked as partners
 * - spouse: partner of the person
 * - son / daughter: child of the person and, if chosen, of the other parent
 * - brother / sister: child of the person's parents (a plain sibling link
 *   only when no parents are recorded)
 * New people start at the person's position; the layout moves them.
 */
export function planRelatives(tree: Tree, input: RelativeInput, makeId: () => string): RelativePlan {
  const person = tree.people[input.personId];
  if (!person) throw new Error("Unknown person");
  const names = MANY.has(input.relation) ? input.names : input.names.slice(0, 1);
  if (!names.length) throw new Error("Enter a name");

  const people: Person[] = names.map((first) => ({
    id: makeId(),
    first,
    last: input.last.trim(),
    birth: names.length === 1 ? input.birth.trim() : "",
    death: "",
    gender: input.gender,
    place: "",
    occupation: "",
    notes: "",
    photo: null,
    x: person.x,
    y: person.y,
  }));
  const relationships: Relationship[] = [];
  const link = (a: string, b: string, type: Relationship["type"]) => relationships.push({ a, b, type });

  switch (input.relation) {
    case "father":
    case "mother": {
      const parent = people[0].id;
      const existing = parentsOf(tree, person.id);
      link(parent, person.id, "parent");
      if (existing.length === 1 && !partnersOf(tree, existing[0]).includes(parent)) {
        // keep the usual order: husband first
        const [a, b] = input.relation === "mother" ? [existing[0], parent] : [parent, existing[0]];
        link(a, b, "partner");
      }
      break;
    }
    case "spouse":
      link(person.id, people[0].id, "partner");
      break;
    case "son":
    case "daughter": {
      const other = input.otherParentId && tree.people[input.otherParentId] ? input.otherParentId : null;
      for (const child of people) {
        link(person.id, child.id, "parent");
        if (other) link(other, child.id, "parent");
      }
      break;
    }
    case "brother":
    case "sister": {
      const parents = parentsOf(tree, person.id);
      for (const sib of people) {
        if (parents.length) parents.forEach((par) => link(par, sib.id, "parent"));
        else link(person.id, sib.id, "sibling");
      }
      break;
    }
  }
  return { people, relationships };
}

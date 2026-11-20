// GEDCOM 5.5.1: writing the tree to a file and reading one back. Pure
// functions, so a round trip can be tested without a page (see data.ts).

import type { Gender, Relationship, Tree } from "./types.ts";

export interface GedPerson {
  gedId: string;
  first: string;
  last: string;
  birth: string;
  death: string;
  gender: Gender;
  place: string;
  occupation: string;
  notes: string;
}

/** People and relationships of a GEDCOM file, with GEDCOM ids (@I1@). */
export function parseGedcom(text: string): { people: GedPerson[]; relationships: Relationship[] } {
  const lines = text.split(/\r?\n/);
  const parse = (line: string) => {
    const m = line.match(/^(\d+)\s+(@\S+@|\S+)\s*(.*)?$/);
    return m ? { lvl: m[1], tag: m[2], val: (m[3] || "").trim() } : null;
  };
  const people: GedPerson[] = [];
  const relationships: Relationship[] = [];

  let cur: GedPerson | null = null;
  let inTag: "BIRT" | "DEAT" | null = null;
  lines.forEach((line) => {
    const m = parse(line);
    if (!m) return;
    const { lvl, tag, val } = m;
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
      } else if (tag === "SEX") cur.gender = val === "M" ? "male" : val === "F" ? "female" : "other";
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
      } else inTag = null;
    }
  });

  // Families: the partner link first, then each parent's children, in file order.
  let inFam = false;
  let husb: string | null = null,
    wife: string | null = null,
    childs: string[] = [];
  const flush = () => {
    if (husb && wife) relationships.push({ a: husb, b: wife, type: "partner" });
    for (const parent of [husb, wife]) if (parent) childs.forEach((c) => relationships.push({ a: parent, b: c, type: "parent" }));
    husb = null;
    wife = null;
    childs = [];
  };
  lines.forEach((line) => {
    const m = parse(line);
    if (!m) return;
    const { lvl, tag, val } = m;
    if (lvl === "0") {
      flush();
      inFam = tag.startsWith("@") && val === "FAM";
    } else if (inFam) {
      if (tag === "HUSB") husb = val;
      else if (tag === "WIFE") wife = val;
      else if (tag === "CHIL") childs.push(val);
    }
  });
  flush();
  return { people, relationships };
}

function parseGedDate(d: string): string {
  if (!d) return "";
  const m = d.match(/(\d{4})/);
  return m ? m[1] : d;
}

/** The tree as a GEDCOM file. A family (FAM) is a couple or a single parent
 * with exactly the children they have together, so every parent link survives
 * a round trip: children of someone with no partner in the tree, and each
 * marriage's own children when someone married more than once. Couples come
 * first in the order they were added, which keeps the marriage numbering.
 * GEDCOM has no plain sibling link; siblings with the same parents are
 * siblings through their family. */
export function buildGedcom(tree: Tree): string {
  const ids = Object.keys(tree.people);
  const gid = (id: string) => "@" + id.toUpperCase() + "@";
  let ged =
    "0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n1 SOUR ROOTFREE\n2 NAME RootFree\n2 VERS 3.0\n0 @SUBM@ SUBM\n1 NAME RootFree User\n";
  ids.forEach((id) => {
    const p = tree.people[id];
    ged += `0 ${gid(id)} INDI\n1 NAME ${(p.first || "").trim()} /${(p.last || "").trim()}/\n`;
    if (p.first) ged += `2 GIVN ${p.first}\n`;
    if (p.last) ged += `2 SURN ${p.last}\n`;
    if (p.gender) ged += `1 SEX ${p.gender === "male" ? "M" : p.gender === "female" ? "F" : "U"}\n`;
    if (p.birth) {
      ged += `1 BIRT\n2 DATE ${p.birth}\n`;
      if (p.place) ged += `2 PLAC ${p.place}\n`;
    }
    if (p.death) ged += `1 DEAT\n2 DATE ${p.death}\n`;
    if (p.occupation) ged += `1 OCCU ${p.occupation}\n`;
    if (p.notes) ged += `1 NOTE ${p.notes.replace(/\n/g, " ")}\n`;
  });

  const exists = (id: string) => !!tree.people[id];
  // Each child's parents, in the order the links were added.
  const parentsOf = new Map<string, string[]>();
  tree.relationships.forEach((r) => {
    const [p, c] = r.type === "parent" ? [r.a, r.b] : r.type === "child" ? [r.b, r.a] : [null, null];
    if (!p || !c || p === c || !exists(p) || !exists(c)) return;
    const list = parentsOf.get(c) ?? [];
    if (!list.includes(p)) list.push(p);
    parentsOf.set(c, list);
  });
  // Families keyed by their parents. A couple's children go in the couple's
  // family; any other child is listed under each parent on their own (a
  // two-parent family would come back as a marriage that was never entered),
  // so no link is lost and none is added.
  const families = new Map<string, { parents: string[]; kids: string[] }>();
  const key = (parents: string[]) => [...parents].sort().join("|");
  const family = (parents: string[]) => {
    const k = key(parents);
    if (!families.has(k)) families.set(k, { parents, kids: [] });
    return families.get(k)!;
  };
  tree.relationships.forEach((r) => {
    if (r.type === "partner" && r.a !== r.b && exists(r.a) && exists(r.b)) family([r.a, r.b]);
  });
  ids.forEach((c) => {
    const ps = parentsOf.get(c);
    if (!ps) return;
    if (ps.length === 2 && families.has(key(ps))) family(ps).kids.push(c);
    else ps.forEach((p) => family([p]).kids.push(c));
  });

  let n = 0;
  families.forEach(({ parents, kids }) => {
    // The man as HUSB where it is known; otherwise the order they were linked.
    const [a, b] = parents;
    const [husb, wife] = b && tree.people[a].gender === "female" ? [b, a] : [a, b];
    ged += `0 @F${++n}@ FAM\n`;
    if (b) ged += `1 HUSB ${gid(husb)}\n1 WIFE ${gid(wife)}\n`;
    else ged += `1 ${tree.people[a].gender === "female" ? "WIFE" : "HUSB"} ${gid(a)}\n`;
    kids.forEach((c) => (ged += `1 CHIL ${gid(c)}\n`));
  });
  return ged + "0 TRLR\n";
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGedcom, parseGedcom } from "../web/src/gedcom.ts";
import type { Gender, Person, Relationship, Tree } from "../web/src/types.ts";

const person = (id: string, gender: Gender, birth = ""): Person => ({
  id,
  first: id.toUpperCase(),
  last: "",
  gender,
  birth,
  death: "",
  place: "",
  occupation: "",
  notes: "",
  photo: null,
  x: 0,
  y: 0,
});
const rel = (a: string, b: string, type: Relationship["type"]): Relationship => ({ a, b, type });

// Ali married Zernişan (son Osman) and then Hatice (son Hasan). Ayşe has two
// children and no husband in the tree; Yusuf has a son and no wife. Kemal and
// Leyla are both recorded as Can's parents but were never entered as a couple.
// Murat and Elif are married without children.
function family(): Tree {
  const people = [
    person("ali", "male"),
    person("zernisan", "female"),
    person("hatice", "female"),
    person("osman", "male", "1932"),
    person("hasan", "male"),
    person("ayse", "female"),
    person("cavidan", "female"),
    person("abdulhalim", "male"),
    person("yusuf", "male"),
    person("salih", "male"),
    person("kemal", "male"),
    person("leyla", "female"),
    person("can", "male"),
    person("murat", "male"),
    person("elif", "female"),
  ];
  return {
    people: Object.fromEntries(people.map((p) => [p.id, p])),
    relationships: [
      rel("ali", "zernisan", "partner"),
      rel("ali", "hatice", "partner"),
      rel("ali", "osman", "parent"),
      rel("zernisan", "osman", "parent"),
      rel("ali", "hasan", "parent"),
      rel("hatice", "hasan", "parent"),
      rel("ayse", "cavidan", "parent"),
      rel("ayse", "abdulhalim", "parent"),
      rel("yusuf", "salih", "parent"),
      rel("kemal", "can", "parent"),
      rel("leyla", "can", "parent"),
      rel("elif", "murat", "partner"),
    ],
  };
}

/** Write the tree and read it back, with the file's ids mapped to the original ones. */
function roundTrip(tree: Tree) {
  const back = parseGedcom(buildGedcom(tree));
  const id = (gedId: string) => gedId.replace(/@/g, "").toLowerCase();
  return {
    people: back.people.map((p) => ({ ...p, id: id(p.gedId) })),
    relationships: back.relationships.map((r) => ({ a: id(r.a), b: id(r.b), type: r.type })),
  };
}

const links = (rels: Relationship[]) =>
  rels.map((r) => (r.type === "partner" ? [r.a, r.b].sort().join(" & ") : `${r.a} → ${r.b}`)).sort();

test("every parent and partner link survives export and import, none is added", () => {
  const tree = family();
  assert.deepEqual(links(roundTrip(tree).relationships), links(tree.relationships));
});

test("children of a parent with no partner in the tree are kept", () => {
  const back = links(roundTrip(family()).relationships);
  for (const l of ["ayse → cavidan", "ayse → abdulhalim", "yusuf → salih"]) assert.ok(back.includes(l), l);
});

test("someone married twice: each marriage keeps only its own children", () => {
  const back = links(roundTrip(family()).relationships);
  assert.ok(!back.includes("hatice → osman"));
  assert.ok(!back.includes("zernisan → hasan"));
});

test("two parents never entered as a couple do not come back married", () => {
  assert.ok(!links(roundTrip(family()).relationships).includes("kemal & leyla"));
});

test("marriages come back in the order they were added", () => {
  const partners = roundTrip(family()).relationships.filter((r) => r.type === "partner");
  assert.deepEqual(
    partners.map((r) => [r.a, r.b].sort().join(" & ")),
    ["ali & zernisan", "ali & hatice", "elif & murat"],
  );
});

test("people keep their names, gender and birth year", () => {
  const osman = roundTrip(family()).people.find((p) => p.id === "osman")!;
  assert.equal(osman.first, "OSMAN");
  assert.equal(osman.gender, "male");
  assert.equal(osman.birth, "1932");
});

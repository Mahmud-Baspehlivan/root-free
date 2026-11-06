import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultGender,
  defaultLastName,
  defaultOtherParent,
  planRelatives,
  splitNames,
  type Relation,
  type RelativeInput,
} from "../web/src/relatives-plan.ts";
import type { Gender, Person, Relationship, Tree } from "../web/src/types.ts";

const person = (id: string, first: string, last: string, gender: Gender): Person => ({
  id,
  first,
  last,
  gender,
  birth: "",
  death: "",
  place: "",
  occupation: "",
  notes: "",
  photo: null,
  x: 100,
  y: 330,
});

// A small piece of the family: Ali with two wives, Osman from the first,
// Hasan from the second; Sebahat married into the family.
function family(): Tree {
  const people = [
    person("ali", "ALİ", "BAŞPEHLİVAN", "male"),
    person("zernisan", "ZERNİŞAN", "", "female"),
    person("hatice", "HATİCE", "", "female"),
    person("osman", "OSMAN", "BAŞPEHLİVAN", "male"),
    person("hasan", "HASAN", "BAŞPEHLİVAN", "male"),
    person("sebahat", "SEBAHAT", "BAŞPEHLİVAN", "female"),
    person("ismail", "İSMAİL", "KONAK", "male"),
  ];
  const relationships: Relationship[] = [
    { a: "ali", b: "zernisan", type: "partner" },
    { a: "ali", b: "osman", type: "parent" },
    { a: "zernisan", b: "osman", type: "parent" },
    { a: "ali", b: "hatice", type: "partner" },
    { a: "ali", b: "hasan", type: "parent" },
    { a: "hatice", b: "hasan", type: "parent" },
    { a: "osman", b: "sebahat", type: "partner" },
    { a: "ismail", b: "sebahat", type: "parent" },
  ];
  return { people: Object.fromEntries(people.map((p) => [p.id, p])), relationships };
}

let n = 0;
const makeId = () => "new" + ++n;
const input = (personId: string, relation: Relation, names: string, extra: Partial<RelativeInput> = {}): RelativeInput => ({
  personId,
  relation,
  names: splitNames(names, relation),
  last: "",
  birth: "",
  gender: "unknown",
  otherParentId: null,
  ...extra,
});

test("several children at once, all with the chosen other parent", () => {
  const plan = planRelatives(family(), input("ali", "son", "Kemal, Mustafa,, İbrahim ", { otherParentId: "hatice" }), makeId);
  assert.deepEqual(
    plan.people.map((p) => p.first),
    ["Kemal", "Mustafa", "İbrahim"],
  );
  for (const child of plan.people) {
    assert.deepEqual(
      plan.relationships.filter((r) => r.b === child.id),
      [
        { a: "ali", b: child.id, type: "parent" },
        { a: "hatice", b: child.id, type: "parent" },
      ],
    );
  }
});

test("a child with the other parent unknown is linked to one parent only", () => {
  const plan = planRelatives(family(), input("hasan", "daughter", "Kesver"), makeId);
  assert.deepEqual(plan.relationships, [{ a: "hasan", b: plan.people[0].id, type: "parent" }]);
});

test("a sibling becomes a child of the person's parents", () => {
  const plan = planRelatives(family(), input("osman", "brother", "Mehmet"), makeId);
  const id = plan.people[0].id;
  assert.deepEqual(plan.relationships, [
    { a: "ali", b: id, type: "parent" },
    { a: "zernisan", b: id, type: "parent" },
  ]);
});

test("a sibling of someone without parents gets a sibling link", () => {
  const plan = planRelatives(family(), input("ismail", "sister", "Ayşe"), makeId);
  assert.deepEqual(plan.relationships, [{ a: "ismail", b: plan.people[0].id, type: "sibling" }]);
});

test("a second parent is also linked as the first parent's partner", () => {
  const plan = planRelatives(family(), input("sebahat", "mother", "Rukiye"), makeId);
  const id = plan.people[0].id;
  assert.deepEqual(plan.relationships, [
    { a: id, b: "sebahat", type: "parent" },
    { a: "ismail", b: id, type: "partner" },
  ]);
  // a third parent is not paired with anyone
  const tree = family();
  const third = planRelatives(tree, input("osman", "mother", "Başka"), makeId);
  assert.equal(third.relationships.length, 1);
});

test("father and spouse, one person even with commas in the name", () => {
  const father = planRelatives(family(), input("ali", "father", "Yusuf, Hacı"), makeId);
  assert.equal(father.people.length, 1);
  assert.equal(father.people[0].first, "Yusuf, Hacı");
  assert.deepEqual(father.relationships, [{ a: father.people[0].id, b: "ali", type: "parent" }]);
  const spouse = planRelatives(family(), input("hasan", "spouse", "Zehra"), makeId);
  assert.deepEqual(spouse.relationships, [{ a: "hasan", b: spouse.people[0].id, type: "partner" }]);
});

test("birth year is kept for one person, dropped for several", () => {
  assert.equal(planRelatives(family(), input("ali", "son", "Kemal", { birth: "1950" }), makeId).people[0].birth, "1950");
  const many = planRelatives(family(), input("ali", "son", "Kemal, Can", { birth: "1950" }), makeId);
  assert.deepEqual(
    many.people.map((p) => p.birth),
    ["", ""],
  );
});

test("defaults: gender, surname and other parent", () => {
  const t = family();
  assert.equal(defaultGender(t, "ali", "daughter"), "female");
  assert.equal(defaultGender(t, "ali", "spouse"), "female");
  assert.equal(defaultGender(t, "sebahat", "spouse"), "male");
  assert.equal(defaultLastName(t, "ali", "son", "hatice"), "BAŞPEHLİVAN");
  assert.equal(defaultLastName(t, "sebahat", "brother", null), "KONAK"); // her father's surname
  assert.equal(defaultLastName(t, "zernisan", "son", "ali"), "BAŞPEHLİVAN"); // the father's, not hers
  assert.equal(defaultLastName(t, "ali", "mother", null), "");
  assert.equal(defaultOtherParent(t, "osman"), "sebahat");
  assert.equal(defaultOtherParent(t, "ali"), null); // two wives: the user chooses
  assert.equal(defaultOtherParent(t, "hasan"), null);
});

test("adding relatives needs a name and an existing person", () => {
  assert.throws(() => planRelatives(family(), input("ali", "son", " , "), makeId), /name/);
  assert.throws(() => planRelatives(family(), input("nobody", "son", "X"), makeId), /Unknown/);
});

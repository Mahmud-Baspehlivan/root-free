import { test } from "node:test";
import assert from "node:assert/strict";
import { branchOf, hiddenBy, toOpen, toReveal } from "../web/src/collapse-plan.ts";
import type { Person, Relationship, Tree } from "../web/src/types.ts";

const person = (id: string): Person => ({
  id,
  first: id,
  last: "",
  gender: "unknown",
  birth: "",
  death: "",
  place: "",
  occupation: "",
  notes: "",
  photo: null,
  x: 0,
  y: 0,
});

// Ali has two wives: Osman is Zernişan's son, Hasan is Hatice's. Osman married
// Sebahat, whose parents are İsmail and Rukiye (Nezahat is her sister); their
// son Abdullah married Gönül, who came with her father Mürteza. Ayşe is a
// separate tree.
function family(): Tree {
  const ids = ["ali", "zernisan", "hatice", "osman", "hasan", "sebahat", "ismail", "rukiye", "abdullah", "gonul", "murteza", "nezahat", "ayse"];
  const rel = (a: string, b: string, type: Relationship["type"]): Relationship => ({ a, b, type });
  return {
    people: Object.fromEntries(ids.map((id) => [id, person(id)])),
    relationships: [
      rel("ali", "zernisan", "partner"),
      rel("ali", "hatice", "partner"),
      rel("ali", "osman", "parent"),
      rel("zernisan", "osman", "parent"),
      rel("ali", "hasan", "parent"),
      rel("hatice", "hasan", "parent"),
      rel("ismail", "rukiye", "partner"),
      rel("ismail", "sebahat", "parent"),
      rel("rukiye", "sebahat", "parent"),
      rel("ismail", "nezahat", "parent"),
      rel("rukiye", "nezahat", "parent"),
      rel("osman", "sebahat", "partner"),
      rel("osman", "abdullah", "parent"),
      rel("sebahat", "abdullah", "parent"),
      rel("abdullah", "gonul", "partner"),
      rel("murteza", "gonul", "parent"),
    ],
  };
}

const sorted = (s: Iterable<string>) => [...s].sort();

test("nothing closed: nobody hidden", () => {
  assert.equal(hiddenBy(family(), new Set()).size, 0);
});

test("closing someone hides their children, everyone below, and who married in with their relatives", () => {
  // Osman's branch: Abdullah, and Gönül with her father who hang off the tree only through him.
  assert.deepEqual(sorted(hiddenBy(family(), new Set(["osman"]))), ["abdullah", "gonul", "murteza"]);
});

test("closing either parent of a couple hides their children", () => {
  assert.deepEqual(sorted(hiddenBy(family(), new Set(["sebahat"]))), ["abdullah", "gonul", "murteza"]);
});

test("someone married twice: closing them hides all children, closing one spouse only that marriage's", () => {
  const tree = family();
  // Closing Ali hides both sons and everything below Osman. Sebahat stays: her
  // parents' family is still on screen, so she is not a stranger to the view.
  assert.deepEqual(sorted(hiddenBy(tree, new Set(["ali"]))), ["abdullah", "gonul", "hasan", "murteza", "osman"]);
  assert.deepEqual(sorted(hiddenBy(tree, new Set(["hatice"]))), ["hasan"]);
});

test("a spouse's family goes with them only when it has nobody else in the tree", () => {
  const tree = family();
  // With Nezahat, İsmail's family is a branch of its own: Sebahat stays with it.
  assert.ok(!hiddenBy(tree, new Set(["ali"])).has("sebahat"));
  // Without her, Sebahat and her parents are only there through Osman.
  delete tree.people.nezahat;
  assert.deepEqual(sorted(hiddenBy(tree, new Set(["ali"]))), ["abdullah", "gonul", "hasan", "ismail", "murteza", "osman", "rukiye", "sebahat"]);
});

test("a separate tree never disappears", () => {
  assert.ok(!hiddenBy(family(), new Set(["ali"])).has("ayse"));
});

test("branch button: open with visible children, closed with the number hidden below", () => {
  const tree = family();
  assert.equal(branchOf(tree, new Set(), "ayse"), null);
  assert.deepEqual(branchOf(tree, new Set(), "osman"), { open: true, count: 0 });
  const hidden = hiddenBy(tree, new Set(["osman"]));
  assert.deepEqual(branchOf(tree, hidden, "osman"), { open: false, count: 3 });
  // The other parent shows the same closed branch.
  assert.deepEqual(branchOf(tree, hidden, "sebahat"), { open: false, count: 3 });
});

test("opening a branch from the other parent reopens the one who closed it", () => {
  assert.deepEqual(sorted(toOpen(family(), "sebahat")), ["osman", "sebahat"]);
});

test("a new relative under a closed branch reopens the branches above them", () => {
  const tree = family();
  tree.people.kid = person("kid");
  tree.relationships.push({ a: "abdullah", b: "kid", type: "parent" });
  // Ali and Osman closed: both are above the new child; Hatice's branch is not.
  assert.deepEqual(sorted(toReveal(tree, new Set(["ali", "osman", "hatice"]), ["kid"])), ["ali", "osman"]);
  assert.deepEqual(toReveal(tree, new Set(["hatice"]), ["kid"]), []);
});

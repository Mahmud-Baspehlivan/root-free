import { test } from "node:test";
import assert from "node:assert/strict";
import { findPeople, fold } from "../web/src/search-match.ts";
import type { Person, Tree } from "../web/src/types.ts";

const person = (id: string, first: string, last: string): Person => ({
  id,
  first,
  last,
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

const tree: Tree = {
  people: Object.fromEntries(
    [
      person("ali1", "ALİ", "BAŞPEHLİVAN"),
      person("ali2", "ALİ", "BAŞPEHLİVAN"),
      person("aliriza", "ALİ RIZA", "BAŞPEHLİVAN"),
      person("halil", "HALİL", "KONAK"),
      person("sebahat", "SEBAHAT", "BAŞPEHLİVAN"),
      person("isimsiz", "İSİMSİZ OĞUL 1", "BAŞPEHLİVAN"),
      person("cuneyt", "CÜNEYT TAHİR", "BAŞPEHLİVAN"),
    ].map((p) => [p.id, p]),
  ),
  relationships: [],
};

test("Turkish letters and case do not matter", () => {
  assert.equal(fold("BAŞPEHLİVAN"), "baspehlivan");
  assert.equal(fold("Başpehlivan"), "baspehlivan");
  assert.equal(fold("IŞIK Ğ Ü Ö Ç"), "isik g u o c");
  assert.deepEqual(findPeople(tree, "cuneyt"), ["cuneyt"]);
  assert.deepEqual(findPeople(tree, "İSİMSİZ oğul"), ["isimsiz"]);
});

test("every word must match, in any order", () => {
  assert.deepEqual(findPeople(tree, "baspehlivan sebahat"), ["sebahat"]);
  assert.deepEqual(findPeople(tree, "konak ali"), ["halil"]);
});

test("the closest names come first: whole name, then the start, then a word, then inside a word", () => {
  // "ali" is the whole first name of the two Alis, starts "ALİ RIZA", and is inside "HALİL".
  assert.deepEqual(findPeople(tree, "ali"), ["ali1", "ali2", "aliriza", "halil"]);
  assert.deepEqual(findPeople(tree, "ali başpehlivan").slice(0, 2).sort(), ["ali1", "ali2"]);
});

test("nothing for an empty query, and no more than the limit", () => {
  assert.deepEqual(findPeople(tree, "   "), []);
  assert.equal(findPeople(tree, "baspehlivan", 3).length, 3);
});

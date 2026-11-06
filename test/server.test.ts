import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Tree } from "../server/db.ts";
import { startServer, type RunningServer } from "../server/server.ts";

let dir: string, app: RunningServer, base: string;
const dbPath = () => join(dir, "tree.db");
const publicDir = () => join(dir, "public");
const start = async () => {
  app = await startServer({ port: 0, dbPath: dbPath(), publicDir: publicDir() });
  base = `http://localhost:${app.port}`;
};

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "rootfree-test-"));
  // A small stand-in for the built app.
  await mkdir(join(publicDir(), "assets"), { recursive: true });
  await writeFile(join(publicDir(), "index.html"), '<!doctype html><script type="module" src="/assets/app.js"></script>');
  await writeFile(join(publicDir(), "assets", "app.js"), "console.log(1)");
  await writeFile(join(publicDir(), "assets", "app.css"), "body{}");
  await writeFile(join(dir, "secret.txt"), "outside public");
  await start();
});
after(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

const tree = async (): Promise<Tree> => (await fetch(base + "/api/tree")).json() as Promise<Tree>;
const change = (body: unknown) =>
  fetch(base + "/api/changes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ok = async (body: unknown) => {
  const res = await change(body);
  assert.equal(res.status, 200, await res.text());
};
const reset = async () => {
  const t = await tree();
  await ok({ people: { delete: Object.keys(t.people) } });
};

test("health check", async () => {
  const res = await fetch(base + "/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("serves the app and its files, nothing outside the public folder", async () => {
  const page = await fetch(base + "/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await page.text(), /assets\/app.js/);
  const css = await fetch(base + "/assets/app.css");
  assert.match(css.headers.get("content-type") ?? "", /text\/css/);
  const js = await fetch(base + "/assets/app.js");
  assert.match(js.headers.get("content-type") ?? "", /javascript/);
  const again = await fetch(base + "/assets/app.js", { headers: { "If-Modified-Since": js.headers.get("last-modified")! } });
  assert.equal(again.status, 304);
  for (const path of ["/nope.html", "/../secret.txt", "/%2e%2e/secret.txt", "/assets/"])
    assert.equal((await fetch(base + path)).status, 404, path);
  assert.equal((await fetch(base + "/api/nope")).status, 404);
});

test("new people get every field, later saves change only what they send", async () => {
  await reset();
  await ok({
    people: {
      upsert: [
        { id: "p1", first: "ALİ", last: "BAŞPEHLİVAN", birth: "1917", gender: "male", place: "YUSUFELİ", x: 10, y: 20 },
      ],
    },
  });
  // someone else drags the card while another renames: both survive
  await ok({ people: { upsert: [{ id: "p1", x: 300, y: 60 }] } });
  await ok({ people: { upsert: [{ id: "p1", notes: "1. evlilik" }] } });
  const p = (await tree()).people.p1;
  assert.equal(p.first, "ALİ");
  assert.equal(p.place, "YUSUFELİ");
  assert.equal(p.notes, "1. evlilik");
  assert.equal(p.x, 300);
  assert.equal(p.y, 60);
  assert.equal(p.photo, null);
  assert.equal(p.occupation, "");
});

test("relationships keep the order they were added in", async () => {
  await reset();
  const people = ["ali", "zernisan", "hatice", "osman"].map((id) => ({ id, first: id }));
  await ok({
    people: { upsert: people },
    relationships: {
      add: [
        { a: "ali", b: "zernisan", type: "partner" },
        { a: "ali", b: "hatice", type: "partner" },
        { a: "ali", b: "osman", type: "parent" },
        { a: "ali", b: "zernisan", type: "partner" }, // duplicate, ignored
      ],
    },
  });
  await ok({ relationships: { add: [{ a: "zernisan", b: "osman", type: "parent" }] } });
  assert.deepEqual((await tree()).relationships, [
    { a: "ali", b: "zernisan", type: "partner" },
    { a: "ali", b: "hatice", type: "partner" },
    { a: "ali", b: "osman", type: "parent" },
    { a: "zernisan", b: "osman", type: "parent" },
  ]);
  await ok({ relationships: { delete: [{ a: "ali", b: "hatice", type: "partner" }] } });
  assert.equal((await tree()).relationships.length, 3);
});

test("deleting a person removes their relationships", async () => {
  await reset();
  await ok({
    people: { upsert: [{ id: "a" }, { id: "b" }, { id: "c" }] },
    relationships: { add: [{ a: "a", b: "b", type: "parent" }, { a: "b", b: "c", type: "sibling" }] },
  });
  await ok({ people: { delete: ["b"] } });
  const t = await tree();
  assert.deepEqual(Object.keys(t.people), ["a", "c"]);
  assert.deepEqual(t.relationships, []);
});

test("a relationship to someone already deleted is skipped, the rest is saved", async () => {
  await reset();
  await ok({ people: { upsert: [{ id: "a" }, { id: "b" }] } });
  await ok({
    people: { upsert: [{ id: "c" }] },
    relationships: { add: [{ a: "a", b: "gone", type: "parent" }, { a: "a", b: "c", type: "parent" }] },
  });
  assert.deepEqual((await tree()).relationships, [{ a: "a", b: "c", type: "parent" }]);
});

test("invalid changes are rejected and nothing of the batch is saved", async () => {
  await reset();
  for (const bad of [
    "not json",
    [],
    { people: { upsert: [{ first: "no id" }] } },
    { people: { upsert: [{ id: "x", x: "left" }] } },
    { people: { upsert: [{ id: "x", first: 5 }] } },
    { people: { upsert: [{ id: "x" }] }, relationships: { add: [{ a: "x", b: "x", type: "cousin" }] } },
    { people: { upsert: [{ id: 'x" onmouseover="alert(1)' }] } },
    { people: { delete: ["../x"] } },
    { relationships: { add: "a-b" } },
  ]) {
    const res = await change(bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.ok(((await res.json()) as { error?: string }).error);
  }
  assert.deepEqual(await tree(), { people: {}, relationships: [] });
});

test("too large a request is refused", async () => {
  const photo = "data:image/png;base64," + "A".repeat(26 * 1024 * 1024);
  const res = await change({ people: { upsert: [{ id: "big", photo }] } });
  assert.equal(res.status, 413);
});

test("the tree survives a server restart", async () => {
  await reset();
  await ok({
    people: { upsert: [{ id: "keep", first: "SEBAHAT", x: 1, y: 2 }] },
    relationships: { add: [{ a: "keep", b: "keep", type: "sibling" }] },
  });
  await app.close();
  await start();
  const t = await tree();
  assert.equal(t.people.keep.first, "SEBAHAT");
  assert.equal(t.relationships.length, 1);
});

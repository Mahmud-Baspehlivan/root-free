// SQLite storage for the family tree.
//
// People and relationships are stored as rows, not as one document, so two
// people editing different parts of the tree at the same time never overwrite
// each other. Relationships keep their insertion order (the id column): the
// app numbers someone's marriages by the order their partners were added.

import { DatabaseSync } from "node:sqlite";

/** Text fields of a person, as the browser app uses them. */
export const TEXT_FIELDS = ["first", "last", "birth", "death", "gender", "place", "occupation", "notes", "photo"] as const;
/** Position on the tree canvas. */
export const NUMBER_FIELDS = ["x", "y"] as const;
export const RELATIONSHIP_TYPES = ["parent", "child", "partner", "sibling"] as const;

type TextField = (typeof TEXT_FIELDS)[number];
type NumberField = (typeof NUMBER_FIELDS)[number];
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export type Person = { id: string } & Record<Exclude<TextField, "photo">, string> & {
    photo: string | null;
  } & Record<NumberField, number>;
export type PersonChange = { id: string } & Partial<Omit<Person, "id">>;
export interface Relationship {
  a: string;
  b: string;
  type: RelationshipType;
}
export interface Tree {
  people: Record<string, Person>;
  relationships: Relationship[];
}
export interface Changes {
  /** New people with every field, existing ones with only the changed fields. */
  upsertPeople: PersonChange[];
  /** Their relationships are removed too. */
  deletePeople: string[];
  addRelationships: Relationship[];
  deleteRelationships: Relationship[];
}

/** Ids end up in HTML attributes, so only plain characters are allowed. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export class ValidationError extends Error {}

export interface TreeDatabase {
  getTree(): Tree;
  /** Apply one batch of changes atomically: all of it or none of it. */
  applyChanges(body: unknown): void;
  close(): void;
}

export function openDatabase(path: string): TreeDatabase {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS people (
      id         TEXT PRIMARY KEY,
      first      TEXT NOT NULL DEFAULT '',
      last       TEXT NOT NULL DEFAULT '',
      birth      TEXT NOT NULL DEFAULT '',
      death      TEXT NOT NULL DEFAULT '',
      gender     TEXT NOT NULL DEFAULT 'unknown',
      place      TEXT NOT NULL DEFAULT '',
      occupation TEXT NOT NULL DEFAULT '',
      notes      TEXT NOT NULL DEFAULT '',
      photo      TEXT,
      x          REAL NOT NULL DEFAULT 0,
      y          REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS relationships (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      a          TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      b          TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      type       TEXT NOT NULL CHECK (type IN ('parent', 'child', 'partner', 'sibling')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (a, b, type)
    );
  `);

  const selectPeople = db.prepare(
    `SELECT id, ${[...TEXT_FIELDS, ...NUMBER_FIELDS].join(", ")} FROM people ORDER BY rowid`,
  );
  const selectRelationships = db.prepare("SELECT a, b, type FROM relationships ORDER BY id");
  const personExists = db.prepare("SELECT 1 FROM people WHERE id = ?");
  const deletePerson = db.prepare("DELETE FROM people WHERE id = ?");
  // A relationship whose people do not exist (one was deleted by someone else
  // in the meantime) is skipped rather than failing the whole save.
  const addRelationship = db.prepare(`
    INSERT OR IGNORE INTO relationships (a, b, type)
    SELECT ?1, ?2, ?3
    WHERE EXISTS (SELECT 1 FROM people WHERE id = ?1)
      AND EXISTS (SELECT 1 FROM people WHERE id = ?2)`);
  const deleteRelationship = db.prepare("DELETE FROM relationships WHERE a = ? AND b = ? AND type = ?");

  function getTree(): Tree {
    const people: Record<string, Person> = {};
    for (const row of selectPeople.all()) {
      const person = { ...row } as unknown as Person;
      people[person.id] = person;
    }
    const relationships = selectRelationships.all().map((r) => ({ ...r }) as unknown as Relationship);
    return { people, relationships };
  }

  function applyChanges(body: unknown): void {
    const batch = validateChanges(body);
    db.exec("BEGIN");
    try {
      for (const person of batch.upsertPeople) upsertPerson(person);
      for (const r of batch.deleteRelationships) deleteRelationship.run(r.a, r.b, r.type);
      for (const r of batch.addRelationships) addRelationship.run(r.a, r.b, r.type);
      for (const id of batch.deletePeople) deletePerson.run(id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }

  // Column names come only from TEXT_FIELDS / NUMBER_FIELDS (see validateChanges).
  function upsertPerson({ id, ...fields }: PersonChange): void {
    const names = Object.keys(fields) as Array<keyof typeof fields>;
    const values = names.map((n) => fields[n] ?? null);
    if (personExists.get(id)) {
      if (!names.length) return;
      const set = names.map((n) => `${n} = ?`).join(", ");
      db.prepare(`UPDATE people SET ${set}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
    } else {
      const cols = ["id", ...names];
      db.prepare(`INSERT INTO people (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(
        id,
        ...values,
      );
    }
  }

  return { getTree, applyChanges, close: () => db.close() };
}

/**
 * The request body of POST /api/changes:
 *   { people: { upsert: [...], delete: [...] },
 *     relationships: { add: [...], delete: [...] } }
 */
export function validateChanges(body: unknown): Changes {
  const fail = (msg: string): never => {
    throw new ValidationError(msg);
  };
  const isObject = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const list = (v: unknown, name: string): unknown[] => {
    if (v === undefined) return [];
    return Array.isArray(v) ? v : fail(`${name} must be a list`);
  };
  const checkId = (id: unknown, name: string): string =>
    typeof id === "string" && ID_PATTERN.test(id) ? id : fail(`${name} must be an id (letters, digits, - or _)`);
  const checkRelationship = (r: unknown, name: string): Relationship => {
    if (!isObject(r)) return fail(`${name} must be an object`);
    if (!RELATIONSHIP_TYPES.includes(r.type as RelationshipType)) fail(`${name}.type is not a relationship type`);
    return { a: checkId(r.a, `${name}.a`), b: checkId(r.b, `${name}.b`), type: r.type as RelationshipType };
  };

  if (!isObject(body)) return fail("changes must be an object");
  const people = body.people ?? {};
  const relationships = body.relationships ?? {};
  if (!isObject(people) || !isObject(relationships)) return fail("people and relationships must be objects");

  const upsertPeople = list(people.upsert, "people.upsert").map((p, i): PersonChange => {
    const name = `people.upsert[${i}]`;
    if (!isObject(p)) return fail(`${name} must be an object`);
    const person: Record<string, unknown> = { id: checkId(p.id, `${name}.id`) };
    for (const f of TEXT_FIELDS) {
      if (!(f in p)) continue;
      const v = p[f] ?? (f === "photo" ? null : "");
      if (v !== null && typeof v !== "string") fail(`${name}.${f} must be text`);
      person[f] = v;
    }
    for (const f of NUMBER_FIELDS) {
      if (!(f in p)) continue;
      const v = p[f];
      if (typeof v !== "number" || !Number.isFinite(v)) fail(`${name}.${f} must be a number`);
      person[f] = v;
    }
    return person as PersonChange;
  });
  const deletePeople = list(people.delete, "people.delete").map((id, i) => checkId(id, `people.delete[${i}]`));
  const addRelationships = list(relationships.add, "relationships.add").map((r, i) =>
    checkRelationship(r, `relationships.add[${i}]`),
  );
  const deleteRelationships = list(relationships.delete, "relationships.delete").map((r, i) =>
    checkRelationship(r, `relationships.delete[${i}]`),
  );
  return { upsertPeople, deletePeople, addRelationships, deleteRelationships };
}

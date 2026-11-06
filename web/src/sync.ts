// Keeps the in-memory tree in step with the server.
//
// The rest of the app changes `state` directly and then calls saveState(),
// as it did with localStorage. saveState() compares the tree with what the
// server last confirmed and sends only the differences: new and changed
// people (changed fields only), removed people, and added or removed
// relationships. Two people editing different parts of the tree therefore
// never overwrite each other. Changes made by others show up on reload.

import { replaceTree, showToast, state } from "./state.ts";
import type { Person, Relationship, Tree } from "./types.ts";
import { render } from "./tree-view.ts";

const TEXT_FIELDS = ["first", "last", "birth", "death", "gender", "place", "occupation", "notes"] as const;
const RETRY_MS = 5000;

/** What the server has, as far as this browser knows. */
let synced: Tree = { people: {}, relationships: [] };
let inFlight = false;
let pendingAgain = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

interface Changes {
  people: { upsert: Array<Partial<Person> & { id: string }>; delete: string[] };
  relationships: { add: Relationship[]; delete: Relationship[] };
}

export async function loadState(): Promise<void> {
  try {
    const res = await fetch("/api/tree", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tree = normalizeTree(await res.json());
    replaceTree(tree);
    synced = copy(tree);
  } catch (e) {
    console.error(e);
    showToast("Could not load the tree from the server. Reload the page to try again.", 8000);
  }
  render();
}

/** Send whatever changed since the last successful save. */
export function saveState(): void {
  if (inFlight) {
    pendingAgain = true;
    return;
  }
  clearTimeout(retryTimer);
  const next = copy(state);
  const changes = diff(synced, next);
  if (!changes) return;
  inFlight = true;
  fetch("/api/changes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      synced = next;
    })
    .catch((e) => {
      console.error(e);
      showToast("Could not save — retrying in a few seconds", 4000);
      retryTimer = setTimeout(saveState, RETRY_MS);
    })
    .finally(() => {
      inFlight = false;
      if (pendingAgain) {
        pendingAgain = false;
        saveState();
      }
    });
}

/** True while some changes have not reached the server yet. */
export function hasUnsavedChanges(): boolean {
  return inFlight || diff(synced, state) !== null;
}

function diff(before: Tree, after: Tree): Changes | null {
  const changes: Changes = {
    people: { upsert: [], delete: [] },
    relationships: { add: [], delete: [] },
  };
  for (const [id, p] of Object.entries(after.people)) {
    const old = before.people[id];
    if (!old) {
      changes.people.upsert.push(personRecord(p));
      continue;
    }
    const changed: Partial<Person> & { id: string } = { id };
    let any = false;
    for (const f of TEXT_FIELDS) {
      if (text(p[f]) !== text(old[f])) {
        (changed as Record<string, unknown>)[f] = text(p[f]);
        any = true;
      }
    }
    if ((p.photo || null) !== (old.photo || null)) {
      changed.photo = p.photo || null;
      any = true;
    }
    for (const f of ["x", "y"] as const) {
      if (num(p[f]) !== num(old[f])) {
        changed[f] = num(p[f]);
        any = true;
      }
    }
    if (any) changes.people.upsert.push(changed);
  }
  for (const id of Object.keys(before.people)) if (!after.people[id]) changes.people.delete.push(id);

  const key = (r: Relationship) => `${r.a}|${r.b}|${r.type}`;
  const beforeKeys = new Set(before.relationships.map(key));
  const afterKeys = new Set(after.relationships.map(key));
  changes.relationships.add = after.relationships.filter((r) => !beforeKeys.has(key(r)));
  changes.relationships.delete = before.relationships.filter((r) => !afterKeys.has(key(r)));

  const empty =
    !changes.people.upsert.length &&
    !changes.people.delete.length &&
    !changes.relationships.add.length &&
    !changes.relationships.delete.length;
  return empty ? null : changes;
}

function personRecord(p: Person): Person {
  return {
    id: p.id,
    first: text(p.first),
    last: text(p.last),
    birth: text(p.birth),
    death: text(p.death),
    gender: p.gender || "unknown",
    place: text(p.place),
    occupation: text(p.occupation),
    notes: text(p.notes),
    photo: p.photo || null,
    x: num(p.x),
    y: num(p.y),
  };
}

/** Make sure a tree from the server has every field the app expects. */
function normalizeTree(data: unknown): Tree {
  const raw = data as { people?: Record<string, Person>; relationships?: Relationship[] };
  const people: Record<string, Person> = {};
  for (const [id, p] of Object.entries(raw.people ?? {})) people[id] = personRecord({ ...p, id });
  return { people, relationships: (raw.relationships ?? []).map((r) => ({ a: r.a, b: r.b, type: r.type })) };
}

const text = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const copy = (t: Tree): Tree => JSON.parse(JSON.stringify({ people: t.people, relationships: t.relationships }));

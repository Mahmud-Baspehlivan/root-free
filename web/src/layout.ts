// Generation layout: one row per generation, partners side by side, children
// under their parents, and the marriage information it relies on.

import { showToast, state } from "./state.ts";
import { saveState } from "./sync.ts";
import { render } from "./tree-view.ts";
import type { Gender } from "./types.ts";

// Labels for people with several marriages.
export const marriageLabel = (n: number): string => n + ". evlilik";
const HALF_SIBLING_LABEL: Partial<Record<Gender, string>> = {
  male: "baba bir kardeş",
  female: "anne bir kardeş",
};
const HALF_SIBLING_DEFAULT = "yarım kardeş";

export interface MarriageInfo {
  /** Someone's partners in marriage order (only for people with two or more). */
  order: Record<string, string[]>;
  /** Marriage number by "idA|idB" (sorted ids). */
  number: Record<string, number>;
  /** Half-sibling badge text by child id. */
  badge: Record<string, string>;
  /** The partner of the main line, by person id. */
  mainOf: Record<string, string>;
}

// For people with more than one partner: the order of their marriages and a
// half-sibling badge for the children of every marriage except the main line.
// Marriages are ordered by their children's birth years when all of them have
// one, otherwise by the order the partners were added (the family order in a
// GEDCOM file). The main line is the marriage with the most descendants.
export function marriageInfo(): MarriageInfo {
  const partners: Record<string, string[]> = {},
    parents: Record<string, string[]> = {},
    kids: Record<string, string[]> = {};
  const add = (map: Record<string, string[]>, key: string, val: string) => {
    const list = (map[key] ??= []);
    if (!list.includes(val)) list.push(val);
  };
  state.relationships.forEach((r) => {
    if (!state.people[r.a] || !state.people[r.b] || r.a === r.b) return;
    if (r.type === "partner") {
      add(partners, r.a, r.b);
      add(partners, r.b, r.a);
    } else if (r.type === "parent" || r.type === "child") {
      const par = r.type === "parent" ? r.a : r.b;
      const ch = r.type === "parent" ? r.b : r.a;
      add(parents, ch, par);
      add(kids, par, ch);
    }
  });
  const year = (id: string) => {
    const m = String(state.people[id].birth || "").match(/\d{4}/);
    return m ? +m[0] : null;
  };
  const descendants = (ids: string[]) => {
    const seen = new Set<string>();
    const stack = [...ids];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      (kids[id] || []).forEach((c) => stack.push(c));
    }
    return seen.size;
  };
  const info: MarriageInfo = { order: {}, number: {}, badge: {}, mainOf: {} };
  Object.entries(partners).forEach(([id, ps]) => {
    if (ps.length < 2) return;
    const kidsWith = (s: string) => (kids[id] || []).filter((c) => (parents[c] || []).includes(s));
    const firstBirth = (s: string) => {
      const ys = kidsWith(s)
        .map(year)
        .filter((y): y is number => y !== null);
      return ys.length ? Math.min(...ys) : null;
    };
    const sorted = ps.every((s) => firstBirth(s) !== null)
      ? [...ps].sort((a, b) => firstBirth(a)! - firstBirth(b)!)
      : [...ps];
    info.order[id] = sorted;
    sorted.forEach((s, i) => {
      const key = [id, s].sort().join("|");
      if (!info.number[key]) info.number[key] = i + 1;
    });
    const main = sorted.reduce((best, s) => (descendants(kidsWith(s)) > descendants(kidsWith(best)) ? s : best));
    info.mainOf[id] = main;
    const text = HALF_SIBLING_LABEL[state.people[id].gender] ?? HALF_SIBLING_DEFAULT;
    sorted.forEach((s) => {
      if (s === main) return;
      kidsWith(s).forEach((c) => {
        if (!info.badge[c]) info.badge[c] = text;
      });
    });
  });
  return info;
}

/** Partners in one block (a couple, or someone with all their spouses). */
export interface Block {
  id: string;
  members: string[];
  /** Blocks holding the parents / the children of the members. */
  incoming: Set<string>;
  outgoing: Set<string>;
  gen: number;
  /** Position of the first member in the people list, for stable ordering. */
  order: number;
  /** Left edge, while laying out. */
  x: number;
}

export interface FamilyBlocks {
  blocksByGen: Record<number, Block[]>;
  parentIds: Record<string, Set<string>>;
  childIds: Record<string, Set<string>>;
  marriages: MarriageInfo;
  maxGen: number;
}

// Partners form one layout block, and each block sits one generation below
// the blocks of its members' parents.
export function buildFamilyLayoutBlocks(): FamilyBlocks {
  const ids = Object.keys(state.people);
  const index: Record<string, number> = Object.fromEntries(ids.map((id, i) => [id, i]));
  const leader: Record<string, string> = Object.fromEntries(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    while (leader[id] !== id) {
      leader[id] = leader[leader[id]];
      id = leader[id];
    }
    return id;
  };
  const unite = (a: string, b: string) => {
    a = find(a);
    b = find(b);
    if (a !== b) leader[b] = a;
  };
  const setOf = () => Object.fromEntries(ids.map((id) => [id, new Set<string>()])) as Record<string, Set<string>>;
  const spouseAdj = setOf(),
    parentIds = setOf(),
    childIds = setOf();
  state.relationships.forEach((r) => {
    if (!state.people[r.a] || !state.people[r.b] || r.a === r.b) return;
    if (r.type === "partner") {
      unite(r.a, r.b);
      spouseAdj[r.a].add(r.b);
      spouseAdj[r.b].add(r.a);
    } else if (r.type === "parent" || r.type === "child") {
      const par = r.type === "parent" ? r.a : r.b;
      const ch = r.type === "parent" ? r.b : r.a;
      parentIds[ch].add(par);
      childIds[par].add(ch);
    }
  });

  const components = new Map<string, Block>();
  ids.forEach((id) => {
    const root = find(id);
    if (!components.has(root))
      components.set(root, {
        id: root,
        members: [],
        incoming: new Set(),
        outgoing: new Set(),
        gen: 0,
        order: index[id],
        x: 0,
      });
    components.get(root)!.members.push(id);
  });
  const rootOf: Record<string, string> = Object.fromEntries(ids.map((id) => [id, find(id)]));
  const blocks = [...components.values()];
  const marriages = marriageInfo();

  // Order the members of a block so each partner stands next to their spouse.
  blocks.forEach((block) => {
    const members = block.members;
    if (members.length < 3) return;
    const degree = (id: string) => [...spouseAdj[id]].filter((o) => members.includes(o)).length;
    // Someone with several spouses: first spouse on the left, later ones on the right.
    const hub = members.find((id) => degree(id) === members.length - 1);
    if (hub) {
      const rank = marriages.order[hub] || [];
      const pos = (id: string) => (rank.includes(id) ? rank.indexOf(id) : rank.length + index[id]);
      const others = members.filter((id) => id !== hub).sort((a, b) => pos(a) - pos(b));
      block.members = [others[0], hub, ...others.slice(1)];
      return;
    }
    // A chain of partners: follow the spouse links.
    const unused = new Set(members);
    const result: string[] = [];
    let cur: string | null = [...members].sort((a, b) => degree(a) - degree(b) || index[a] - index[b])[0];
    while (unused.size) {
      if (cur === null || !unused.has(cur)) cur = [...unused].sort((a, b) => index[a] - index[b])[0];
      result.push(cur);
      unused.delete(cur);
      const next: string[] = [...spouseAdj[cur]].filter((id) => unused.has(id));
      cur = next.length ? next.sort((a, b) => degree(a) - degree(b) || index[a] - index[b])[0] : null;
    }
    block.members = result;
  });

  // Parent → child edges between blocks, then generations top-down.
  ids.forEach((child) =>
    parentIds[child].forEach((parent) => {
      const a = rootOf[parent],
        b = rootOf[child];
      if (a === b) return;
      components.get(a)!.outgoing.add(b);
      components.get(b)!.incoming.add(a);
    }),
  );
  const inDegree: Record<string, number> = Object.fromEntries(blocks.map((b) => [b.id, b.incoming.size]));
  const queue = blocks.filter((b) => !inDegree[b.id]).sort((a, b) => a.order - b.order);
  for (let i = 0; i < queue.length; i++) {
    queue[i].outgoing.forEach((cid) => {
      const ch = components.get(cid)!;
      ch.gen = Math.max(ch.gen, queue[i].gen + 1);
      if (--inDegree[cid] === 0) queue.push(ch);
    });
  }
  if (queue.length < blocks.length) {
    // A relationship cycle (bad data): fall back to per-person generations without hanging.
    const base = computeGenerations().gen;
    blocks
      .filter((b) => inDegree[b.id] > 0)
      .forEach((b) => {
        b.gen = Math.max(b.gen, ...b.members.map((id) => base[id] || 0));
      });
  }
  // Pull each family down so it sits directly above its children. Without this
  // the parents of a married-in spouse stay in the top row and their lines skip
  // a generation, running behind the cards in between. A "free" family (one
  // parent family, and every family below it free too, e.g. a childless
  // half-sibling) can follow its parents to any row, so it must not hold them
  // up; it is put under them afterwards. Otherwise one father's children can
  // end up in different rows.
  const free = new Set<string>();
  for (let i = queue.length - 1; i >= 0; i--) {
    const b = queue[i];
    const fixedKids = [...b.outgoing].filter((cid) => !free.has(cid));
    if (fixedKids.length) b.gen = Math.min(...fixedKids.map((cid) => components.get(cid)!.gen)) - 1;
    else if (b.incoming.size <= 1) free.add(b.id);
  }
  queue.forEach((b) => {
    if (free.has(b.id) && b.incoming.size)
      b.gen = Math.max(...[...b.incoming].map((pid) => components.get(pid)!.gen)) + 1;
  });
  const minGen = Math.min(...blocks.map((b) => b.gen));
  blocks.forEach((b) => (b.gen -= minGen));

  const blocksByGen: Record<number, Block[]> = {};
  blocks.forEach((b) => (blocksByGen[b.gen] ??= []).push(b));
  return { blocksByGen, parentIds, childIds, marriages, maxGen: Math.max(0, ...blocks.map((b) => b.gen)) };
}

// Generation layout: one row per generation, partners side by side, children
// centred under their parents. Rows are placed by repeated down and up sweeps
// that pull each block toward its parents and then toward its children.
export function genLayout(): void {
  const { blocksByGen, parentIds, childIds, marriages, maxGen } = buildFamilyLayoutBlocks();
  const CARD = 172,
    SPOUSE_GAP = 24,
    MULTI_SPOUSE_GAP = 64, // room for the marriage label
    FAMILY_GAP = 48,
    ROW_GAP = 270;
  const rows: Block[][] = [];
  const blockOf: Record<string, Block> = {};
  for (let g = 0; g <= maxGen; g++) {
    rows[g] = (blocksByGen[g] || []).sort((a, b) => a.order - b.order);
    rows[g].forEach((b) => b.members.forEach((id) => (blockOf[id] = b)));
  }
  const gapOf = (b: Block) => (b.members.length > 2 ? MULTI_SPOUSE_GAP : SPOUSE_GAP);
  const width = (b: Block) => b.members.length * CARD + (b.members.length - 1) * gapOf(b);
  const cxOf = (id: string) => {
    const b = blockOf[id];
    return b.x + b.members.indexOf(id) * (CARD + gapOf(b)) + CARD / 2;
  };
  const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  // How far a block must move so its members sit under their parents (down),
  // or so it sits centred over its children (up).
  const pullDown = (b: Block) => {
    const shifts = b.members
      .filter((id) => parentIds[id].size)
      .map((id) => avg([...parentIds[id]].map(cxOf)) - cxOf(id));
    return shifts.length ? avg(shifts) : 0;
  };
  const pullUp = (b: Block) => {
    const kids = [...new Set(b.members.flatMap((id) => [...childIds[id]]))];
    const shifts = kids.map((c) => cxOf(c) - avg([...parentIds[c]].map(cxOf)));
    return shifts.length ? avg(shifts) : 0;
  };
  // The spouse who comes from the left-hand family stands on the left.
  const orderCouple = (b: Block) => {
    if (b.members.length !== 2) return;
    const side = (id: string) => (parentIds[id].size ? avg([...parentIds[id]].map(cxOf)) : null);
    const [l, r] = b.members.map(side);
    if (l !== null && r !== null && l > r) b.members.reverse();
  };
  // Someone with several spouses: the main line's spouse stands on the side
  // where that line's children marry into, so the line does not cross the
  // other marriages' children. Without such a pull the first spouse stays left.
  const orientHub = (b: Block) => {
    if (b.members.length < 3) return;
    const hub = b.members.find((id) => marriages.mainOf[id]);
    if (!hub) return;
    const main = marriages.mainOf[hub];
    if (!b.members.includes(main)) return;
    const outside: number[] = [];
    childIds[hub].forEach((c) => {
      if (!parentIds[c].has(main)) return;
      blockOf[c].members.forEach((m) =>
        parentIds[m].forEach((p) => {
          if (blockOf[p] !== b) outside.push(cxOf(p));
        }),
      );
    });
    const side = outside.length ? main : marriages.order[hub][0];
    const wantRight = outside.length > 0 && avg(outside) > cxOf(hub);
    const isRight = b.members.indexOf(side) > b.members.indexOf(hub);
    if (wantRight !== isRight) b.members.reverse();
  };
  // Siblings stay together: each block belongs to the family it comes from (the
  // parent block with the most children when it comes from two), and a row is
  // ordered family by family, so a cousin never lands between siblings.
  const byId = new Map(rows.flat().map((b) => [b.id, b]));
  const familyOf = new Map<Block, Block>(
    rows.flat().map((b) => {
      const ps = [...b.incoming].map((id) => byId.get(id)).filter((p): p is Block => !!p);
      return [b, ps.length ? ps.reduce((best, p) => (p.outgoing.size > best.outgoing.size ? p : best)) : b];
    }),
  );
  // Move blocks toward their targets without overlapping: a left-to-right and
  // a right-to-left placement, averaged, keeps clusters centred.
  const placeRow = (row: Block[], pull: (b: Block) => number) => {
    const want = row.map((b) => ({ b, x: b.x + pull(b) }));
    type Want = (typeof want)[number];
    const centre = (w: Want) => w.x + width(w.b) / 2;
    const families = new Map<Block, Want[]>();
    want.forEach((w) => {
      const f = familyOf.get(w.b)!;
      if (!families.has(f)) families.set(f, []);
      families.get(f)!.push(w);
    });
    const key = new Map<Want, number>(),
      famNo = new Map<Want, number>();
    [...families.values()].forEach((ws, i) => {
      const k = avg(ws.map(centre));
      ws.forEach((w) => {
        key.set(w, k);
        famNo.set(w, i);
      });
    });
    // Within a family, the children of one marriage stay together, in the
    // order their parents stand in the row above.
    const marriagePos = (w: Want) => {
      const f = familyOf.get(w.b)!;
      const idx = w.b.members.flatMap((m) => [...parentIds[m]].map((p) => f.members.indexOf(p)).filter((i) => i >= 0));
      return idx.length ? avg(idx) : 0;
    };
    want.sort(
      (p, q) =>
        key.get(p)! - key.get(q)! ||
        famNo.get(p)! - famNo.get(q)! ||
        marriagePos(p) - marriagePos(q) ||
        centre(p) - centre(q),
    );
    const lx: number[] = [],
      rx: number[] = [];
    want.forEach((w, i) => {
      lx[i] = i === 0 ? w.x : Math.max(w.x, lx[i - 1] + width(want[i - 1].b) + FAMILY_GAP);
    });
    for (let i = want.length - 1; i >= 0; i--) {
      rx[i] = i === want.length - 1 ? want[i].x : Math.min(want[i].x, rx[i + 1] - FAMILY_GAP - width(want[i].b));
    }
    want.forEach((w, i) => (w.b.x = (lx[i] + rx[i]) / 2));
    row.splice(0, row.length, ...want.map((w) => w.b));
  };

  rows.forEach((row) => {
    let x = 0;
    row.forEach((b) => {
      b.x = x;
      x += width(b) + FAMILY_GAP;
    });
  });
  for (let pass = 0; pass < 8; pass++) {
    rows.forEach((row) => row.forEach(orientHub));
    for (let g = 1; g <= maxGen; g++) {
      rows[g].forEach(orderCouple);
      placeRow(rows[g], pullDown);
    }
    for (let g = maxGen - 1; g >= 0; g--) placeRow(rows[g], pullUp);
  }

  const all = rows.flat();
  const minX = Math.min(...all.map((b) => b.x));
  const maxX = Math.max(...all.map((b) => b.x + width(b)));
  const offset = Math.max(80, (window.innerWidth - (maxX - minX)) / 2) - minX;
  rows.forEach((row, g) =>
    row.forEach((b) =>
      b.members.forEach((id, i) => {
        state.people[id].x = Math.round(b.x + offset + i * (CARD + gapOf(b)));
        state.people[id].y = 60 + g * ROW_GAP;
      }),
    ),
  );
  saveState();
  render();
  showToast("Partners are now side by side");
}

export function gridLayout(): void {
  const ids = Object.keys(state.people);
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  ids.forEach((id, i) => {
    state.people[id].x = 80 + (i % cols) * 210;
    state.people[id].y = 80 + Math.floor(i / cols) * 230;
  });
  saveState();
  render();
  showToast("Grid layout applied");
}

/** Per-person generations (longest path from a root); fallback for cyclic data. */
function computeGenerations(): { gen: Record<string, number>; maxGen: number } {
  const children: Record<string, string[]> = {},
    parents: Record<string, string[]> = {};
  Object.keys(state.people).forEach((id) => {
    children[id] = [];
    parents[id] = [];
  });
  state.relationships.forEach((rel) => {
    if (!state.people[rel.a] || !state.people[rel.b]) return;
    if (rel.type === "parent") {
      children[rel.a].push(rel.b);
      parents[rel.b].push(rel.a);
    } else if (rel.type === "child") {
      children[rel.b].push(rel.a);
      parents[rel.a].push(rel.b);
    }
  });
  const gen: Record<string, number> = {};
  const roots = Object.keys(state.people).filter((id) => parents[id].length === 0);
  if (!roots.length) return { gen: {}, maxGen: 0 };
  const queue = [...roots];
  roots.forEach((r) => (gen[r] = 0));
  // Bounded so that a cycle cannot loop forever.
  for (let steps = 0; queue.length && steps < 100000; steps++) {
    const cur = queue.shift()!;
    children[cur].forEach((ch) => {
      if (gen[ch] === undefined) {
        gen[ch] = (gen[cur] || 0) + 1;
        queue.push(ch);
      } else gen[ch] = Math.max(gen[ch], (gen[cur] || 0) + 1);
    });
  }
  Object.keys(state.people).forEach((id) => {
    if (gen[id] === undefined) gen[id] = 0;
  });
  return { gen, maxGen: Math.max(0, ...Object.values(gen)) };
}

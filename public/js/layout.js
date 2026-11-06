// ═══════════════════════════════════════
// LAYOUT
// ═══════════════════════════════════════
// Group partners into one layout block, and place their children one generation below.
// This avoids splitting spouses across the same generation or placing them in different rows.
// For people with more than one partner: the order of their marriages
// ("1. evlilik", "2. evlilik") and a half-sibling badge for the children
// of every marriage except the main line. Marriages are ordered by their
// children's birth years when all of them have one, otherwise by the
// order the partners were added (the family order in a GEDCOM file).
// The main line is the marriage with the most descendants.
function marriageInfo() {
  const partners = {},
    parents = {},
    kids = {};
  const add = (map, key, val) => {
    if (!map[key]) map[key] = [];
    if (!map[key].includes(val)) map[key].push(val);
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
  const year = (id) => {
    const m = String(state.people[id].birth || "").match(/\d{4}/);
    return m ? +m[0] : null;
  };
  const descendants = (ids) => {
    const seen = new Set();
    const stack = [...ids];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      (kids[id] || []).forEach((c) => stack.push(c));
    }
    return seen.size;
  };
  const order = {},
    number = {},
    badge = {},
    mainOf = {};
  Object.entries(partners).forEach(([id, ps]) => {
    if (ps.length < 2) return;
    const kidsWith = (s) =>
      (kids[id] || []).filter((c) => (parents[c] || []).includes(s));
    const firstBirth = (s) => {
      const ys = kidsWith(s).map(year).filter((y) => y !== null);
      return ys.length ? Math.min(...ys) : null;
    };
    const sorted = ps.every((s) => firstBirth(s) !== null)
      ? [...ps].sort((a, b) => firstBirth(a) - firstBirth(b))
      : [...ps];
    order[id] = sorted;
    sorted.forEach((s, i) => {
      const key = [id, s].sort().join("|");
      if (!number[key]) number[key] = i + 1;
    });
    const main = sorted.reduce((best, s) =>
      descendants(kidsWith(s)) > descendants(kidsWith(best)) ? s : best,
    );
    mainOf[id] = main;
    const g = state.people[id].gender;
    const text =
      g === "male"
        ? "baba bir kardeş"
        : g === "female"
          ? "anne bir kardeş"
          : "yarım kardeş";
    sorted.forEach((s) => {
      if (s === main) return;
      kidsWith(s).forEach((c) => {
        if (!badge[c]) badge[c] = text;
      });
    });
  });
  return { order, number, badge, mainOf };
}

function buildFamilyLayoutBlocks() {
  const ids = Object.keys(state.people);
  const index = Object.fromEntries(ids.map((id, i) => [id, i]));
  const leader = Object.fromEntries(ids.map((id) => [id, id]));
  function find(id) {
    while (leader[id] !== id) {
      leader[id] = leader[leader[id]];
      id = leader[id];
    }
    return id;
  }
  function unite(a, b) {
    if (leader[a] === undefined || leader[b] === undefined) return;
    a = find(a);
    b = find(b);
    if (a !== b) leader[b] = a;
  }
  const spouseAdj = Object.fromEntries(ids.map((id) => [id, new Set()]));
  const parentIds = Object.fromEntries(ids.map((id) => [id, new Set()]));
  const childIds = Object.fromEntries(ids.map((id) => [id, new Set()]));
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

  const components = new Map();
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
      });
    components.get(root).members.push(id);
  });
  const rootOf = Object.fromEntries(ids.map((id) => [id, find(id)]));
  const blocks = [...components.values()];
  const marriages = marriageInfo();

  // Order a partner group so each partner is as close as possible to their spouse.
  blocks.forEach((block) => {
    const members = block.members;
    if (members.length < 3) return;
    // For common remarriage cases: a central partner between two spouses.
    const degree = (id) =>
      [...spouseAdj[id]].filter((other) => members.includes(other))
        .length;
    const hub = members.find((id) => degree(id) === members.length - 1);
    if (hub) {
      // First spouse on the left, later ones on the right.
      const rank = marriages.order[hub] || [];
      const pos = (id) =>
        rank.includes(id) ? rank.indexOf(id) : rank.length + index[id];
      const others = members
        .filter((id) => id !== hub)
        .sort((a, b) => pos(a) - pos(b));
      block.members = [others[0], hub, ...others.slice(1)];
      return;
    }
    // For partner chains, follow spouse links rather than input order.
    const unused = new Set(members);
    const result = [];
    let cur = [...members].sort(
      (a, b) => degree(a) - degree(b) || index[a] - index[b],
    )[0];
    while (unused.size) {
      if (!unused.has(cur))
        cur = [...unused].sort((a, b) => index[a] - index[b])[0];
      result.push(cur);
      unused.delete(cur);
      const next = [...spouseAdj[cur]].filter((id) => unused.has(id));
      cur = next.length
        ? next.sort(
            (a, b) => degree(a) - degree(b) || index[a] - index[b],
          )[0]
        : null;
    }
    block.members = result;
  });

  // Relationship edges between couple blocks (a directed acyclic graph in normal family trees).
  ids.forEach((child) =>
    parentIds[child].forEach((parent) => {
      const a = rootOf[parent],
        b = rootOf[child];
      if (a === b) return;
      components.get(a).outgoing.add(b);
      components.get(b).incoming.add(a);
    }),
  );
  const inDegree = Object.fromEntries(
    blocks.map((b) => [b.id, b.incoming.size]),
  );
  const queue = blocks
    .filter((b) => !inDegree[b.id])
    .sort((a, b) => a.order - b.order);
  let processed = 0;
  for (let i = 0; i < queue.length; i++) {
    const b = queue[i];
    processed++;
    b.outgoing.forEach((cid) => {
      const ch = components.get(cid);
      ch.gen = Math.max(ch.gen, b.gen + 1);
      inDegree[cid]--;
      if (inDegree[cid] === 0) queue.push(ch);
    });
  }
  if (processed < blocks.length) {
    // Graceful fallback for an erroneous cyclic relationship, without hanging.
    const base = computeGenerations().gen;
    blocks
      .filter((b) => inDegree[b.id] > 0)
      .forEach((b) => {
        b.gen = Math.max(b.gen, ...b.members.map((id) => base[id] || 0));
      });
  }
  // Pull each family down so it sits directly above its children. Without
  // this, the parents of a married-in spouse stay in the top row and their
  // lines skip a generation, running behind the cards in between.
  // A "free" family (one parent family, and every family below it free
  // too, e.g. a childless half-sibling) can follow its parents to any
  // row, so it must not hold them up; it is put under them afterwards.
  // Otherwise all children of one father end up in different rows.
  const free = new Set();
  for (let i = queue.length - 1; i >= 0; i--) {
    const b = queue[i];
    const fixedKids = [...b.outgoing].filter((cid) => !free.has(cid));
    if (fixedKids.length)
      b.gen =
        Math.min(...fixedKids.map((cid) => components.get(cid).gen)) - 1;
    else if (b.incoming.size <= 1) free.add(b.id);
  }
  queue.forEach((b) => {
    if (free.has(b.id) && b.incoming.size)
      b.gen =
        Math.max(...[...b.incoming].map((pid) => components.get(pid).gen)) +
        1;
  });
  const minGen = Math.min(...blocks.map((b) => b.gen));
  blocks.forEach((b) => (b.gen -= minGen));

  const blocksByGen = {};
  blocks.forEach((b) => {
    if (!blocksByGen[b.gen]) blocksByGen[b.gen] = [];
    blocksByGen[b.gen].push(b);
  });
  return {
    blocksByGen,
    parentIds,
    childIds,
    marriages,
    maxGen: Math.max(0, ...blocks.map((b) => b.gen)),
  };
}

function genLayout() {
  const { blocksByGen, parentIds, childIds, marriages, maxGen } =
    buildFamilyLayoutBlocks();
  const CARD = 172,
    SPOUSE_GAP = 24,
    MULTI_SPOUSE_GAP = 64, // room for the "1. evlilik" label
    FAMILY_GAP = 48,
    ROW_GAP = 270;
  const rows = [];
  const blockOf = {};
  for (let g = 0; g <= maxGen; g++) {
    rows[g] = (blocksByGen[g] || []).sort((a, b) => a.order - b.order);
    rows[g].forEach((b) => b.members.forEach((id) => (blockOf[id] = b)));
  }
  const gapOf = (b) =>
    b.members.length > 2 ? MULTI_SPOUSE_GAP : SPOUSE_GAP;
  const width = (b) =>
    b.members.length * CARD + (b.members.length - 1) * gapOf(b);
  const cxOf = (id) => {
    const b = blockOf[id];
    return b.x + b.members.indexOf(id) * (CARD + gapOf(b)) + CARD / 2;
  };
  const avg = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
  // How far a block must move so its members sit under their parents
  // (down) or so its couples sit centred over their children (up).
  const pullDown = (b) => {
    const shifts = b.members
      .filter((id) => parentIds[id].size)
      .map((id) => avg([...parentIds[id]].map(cxOf)) - cxOf(id));
    return shifts.length ? avg(shifts) : 0;
  };
  const pullUp = (b) => {
    const kids = [
      ...new Set(b.members.flatMap((id) => [...childIds[id]])),
    ];
    const shifts = kids.map(
      (c) => cxOf(c) - avg([...parentIds[c]].map(cxOf)),
    );
    return shifts.length ? avg(shifts) : 0;
  };
  // Spouse who comes from the left-hand family stands on the left.
  const orderCouple = (b) => {
    if (b.members.length !== 2) return;
    const side = (id) =>
      parentIds[id].size ? avg([...parentIds[id]].map(cxOf)) : null;
    const [l, r] = b.members.map(side);
    if (l !== null && r !== null && l > r) b.members.reverse();
  };
  // Someone with several spouses: the spouse of the main line goes on the
  // side where that line's children are married into, so the line does not
  // have to cross the other marriages' children. With no such pull the
  // first spouse stays on the left.
  const orientHub = (b) => {
    if (b.members.length < 3) return;
    const hub = b.members.find((id) => marriages.mainOf[id]);
    if (!hub) return;
    const main = marriages.mainOf[hub];
    if (!b.members.includes(main)) return;
    const outside = [];
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
  // Siblings stay together in a row: each block belongs to the family it
  // comes from (the parent block with the most children when its members
  // come from several), and families are ordered as a whole, so one
  // family's children are never split by a cousin.
  const byId = new Map(rows.flat().map((b) => [b.id, b]));
  const familyOf = new Map(
    rows.flat().map((b) => {
      const parentsOf = [...b.incoming]
        .map((id) => byId.get(id))
        .filter(Boolean);
      const fam = parentsOf.length
        ? parentsOf.reduce((best, p) =>
            p.outgoing.size > best.outgoing.size ? p : best,
          )
        : b;
      return [b, fam];
    }),
  );
  // Move blocks toward their targets without overlapping: a left-to-right
  // and a right-to-left placement, averaged, keeps clusters centred.
  const placeRow = (row, pull) => {
    const want = row.map((b) => ({ b, x: b.x + pull(b) }));
    const centre = (w) => w.x + width(w.b) / 2;
    const families = new Map();
    want.forEach((w) => {
      const f = familyOf.get(w.b);
      if (!families.has(f)) families.set(f, []);
      families.get(f).push(w);
    });
    const key = new Map(),
      famNo = new Map();
    [...families.values()].forEach((ws, i) => {
      const k = avg(ws.map(centre));
      ws.forEach((w) => {
        key.set(w, k);
        famNo.set(w, i);
      });
    });
    // Within a family, children of the same marriage stay together, in
    // the order their parents stand in the row above.
    const marriagePos = (w) => {
      const f = familyOf.get(w.b);
      const idx = w.b.members.flatMap((m) =>
        [...parentIds[m]]
          .map((p) => f.members.indexOf(p))
          .filter((i) => i >= 0),
      );
      return idx.length ? avg(idx) : 0;
    };
    want.sort(
      (p, q) =>
        key.get(p) - key.get(q) ||
        famNo.get(p) - famNo.get(q) ||
        marriagePos(p) - marriagePos(q) ||
        centre(p) - centre(q),
    );
    const lx = [],
      rx = [];
    want.forEach((w, i) => {
      lx[i] =
        i === 0
          ? w.x
          : Math.max(w.x, lx[i - 1] + width(want[i - 1].b) + FAMILY_GAP);
    });
    for (let i = want.length - 1; i >= 0; i--) {
      const w = want[i];
      rx[i] =
        i === want.length - 1
          ? w.x
          : Math.min(w.x, rx[i + 1] - FAMILY_GAP - width(w.b));
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
        state.people[id].x = Math.round(
          b.x + offset + i * (CARD + gapOf(b)),
        );
        state.people[id].y = 60 + g * ROW_GAP;
      }),
    ),
  );
  saveState();
  render();
  showToast("Partners are now side by side");
}

function gridLayout() {
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

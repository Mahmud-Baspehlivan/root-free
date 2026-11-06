function drawConnectors() {
  const svg = document.getElementById("connector-svg");
  svg.innerHTML = "";
  const GREEN = "#2d6a4f",
    PARTNER = "#b07d3a",
    SIBLING = "#6b4fa0";
  const CARD_W = 172,
    CARD_H = 190;

  function cx(p) {
    return (p.x || 0) + CARD_W / 2;
  }
  function top(p) {
    return p.y || 0;
  }
  function bot(p) {
    return (p.y || 0) + CARD_H;
  }
  function mid(p) {
    return (p.y || 0) + CARD_H / 2;
  }

  function seg(x1, y1, x2, y2, col, dash) {
    const e = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line",
    );
    e.setAttribute("x1", x1 | 0);
    e.setAttribute("y1", y1 | 0);
    e.setAttribute("x2", x2 | 0);
    e.setAttribute("y2", y2 | 0);
    e.setAttribute("stroke", col);
    e.setAttribute("stroke-width", "1.8");
    e.setAttribute("opacity", "0.65");
    if (dash) e.setAttribute("stroke-dasharray", dash);
    svg.appendChild(e);
  }
  function bez(x1, y1, x2, y2, col, dash) {
    const e = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    const my = (y1 + y2) / 2;
    e.setAttribute(
      "d",
      `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`,
    );
    e.setAttribute("stroke", col);
    e.setAttribute("stroke-width", "1.8");
    e.setAttribute("fill", "none");
    e.setAttribute("opacity", "0.65");
    if (dash) e.setAttribute("stroke-dasharray", dash);
    svg.appendChild(e);
  }
  function lbl(x, y, t, col) {
    const e = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    e.setAttribute("x", x | 0);
    e.setAttribute("y", y | 0);
    e.setAttribute("text-anchor", "middle");
    e.setAttribute("font-size", "10");
    e.setAttribute("fill", col);
    e.setAttribute("opacity", "0.8");
    e.setAttribute("font-family", "Inter,sans-serif");
    e.setAttribute("font-weight", "500");
    e.textContent = t;
    svg.appendChild(e);
  }

  const marriages = marriageInfo();
  const marriageNo = (x, y) => marriages.number[[x, y].sort().join("|")];
  // Two people in the same row with another card between them (a third
  // spouse standing beyond the second one).
  const cardsBetween = (a, b) => {
    if (Math.abs((a.y || 0) - (b.y || 0)) >= 5) return false;
    const l = Math.min(a.x || 0, b.x || 0),
      r = Math.max(a.x || 0, b.x || 0);
    return Object.values(state.people).some(
      (p) =>
        p !== a &&
        p !== b &&
        Math.abs((p.y || 0) - (a.y || 0)) < 5 &&
        (p.x || 0) > l &&
        (p.x || 0) < r,
    );
  };
  // A line with a background-coloured edge, so lines it crosses look
  // interrupted instead of joined.
  function haloSeg(x1, y1, x2, y2, col, dash) {
    const e = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line",
    );
    e.setAttribute("x1", x1 | 0);
    e.setAttribute("y1", y1 | 0);
    e.setAttribute("x2", x2 | 0);
    e.setAttribute("y2", y2 | 0);
    e.setAttribute("stroke-width", "7");
    e.style.stroke = "var(--bg)";
    svg.appendChild(e);
    seg(x1, y1, x2, y2, col, dash);
  }
  function haloLbl(x, y, t, col) {
    lbl(x, y, t, col);
    const e = svg.lastChild;
    e.style.paintOrder = "stroke";
    e.style.stroke = "var(--bg)";
    e.style.strokeWidth = "4px";
  }

  // Partners — simple curve
  state.relationships
    .filter((r) => r.type === "partner")
    .forEach((rel) => {
      const a = state.people[rel.a],
        b = state.people[rel.b];
      if (!a || !b) return;
      const no = marriageNo(rel.a, rel.b);
      const left = a.x <= b.x ? a : b;
      const right = left === a ? b : a;
      const closeAndAligned =
        Math.abs(mid(a) - mid(b)) < 5 &&
        right.x >= left.x + CARD_W &&
        right.x - (left.x + CARD_W) <= 65;
      if (closeAndAligned) {
        // Draw between card edges rather than across portraits/names.
        seg(
          left.x + CARD_W,
          mid(left),
          right.x,
          mid(right),
          PARTNER,
          "6 4",
        );
        if (no)
          lbl(
            (left.x + CARD_W + right.x) / 2,
            mid(left) - 6,
            no + ". evlilik",
            PARTNER,
          );
      } else if (cardsBetween(a, b)) {
        // Bridge over the cards in between, through the gap above the row.
        const y = top(left) - 9;
        const x1 = left.x + CARD_W - 24,
          x2 = right.x + 24;
        seg(x1, top(left), x1, y, PARTNER, "6 4");
        haloSeg(x1, y, x2, y, PARTNER, "6 4");
        seg(x2, y, x2, top(right), PARTNER, "6 4");
        haloLbl(
          (x1 + x2) / 2,
          y + 3,
          no ? no + ". evlilik" : "partner",
          PARTNER,
        );
      } else {
        bez(cx(a), mid(a), cx(b), mid(b), PARTNER, "6 4");
        lbl(
          (cx(a) + cx(b)) / 2,
          (mid(a) + mid(b)) / 2 - 8,
          no ? no + ". evlilik" : "partner",
          PARTNER,
        );
      }
    });

  // Siblings — simple curve
  state.relationships
    .filter((r) => r.type === "sibling")
    .forEach((rel) => {
      const a = state.people[rel.a],
        b = state.people[rel.b];
      if (!a || !b) return;
      bez(cx(a), mid(a), cx(b), mid(b), SIBLING, "4 3");
      lbl(
        (cx(a) + cx(b)) / 2,
        (mid(a) + mid(b)) / 2 - 8,
        "sibling",
        SIBLING,
      );
    });

  // Build parent→children map (normalised)
  const pairs = [];
  state.relationships.forEach((r) => {
    if (r.type === "parent") pairs.push({ pid: r.a, cid: r.b });
    if (r.type === "child") pairs.push({ pid: r.b, cid: r.a });
  });

  // byChild: childId → [parentIds]
  const byChild = {};
  pairs.forEach(({ pid, cid }) => {
    if (!byChild[cid]) byChild[cid] = [];
    if (!byChild[cid].includes(pid)) byChild[cid].push(pid);
  });

  // Group children that share the exact same set of parents
  const groups = {};
  Object.entries(byChild).forEach(([cid, pids]) => {
    const key = [...pids].sort().join("|");
    if (!groups[key]) groups[key] = { pids: [...pids], cids: [] };
    if (!groups[key].cids.includes(cid)) groups[key].cids.push(cid);
  });

  // Children of someone with several marriages are drawn separately (see
  // drawMarriageLines); everything else uses the plain couple drawing.
  const hubGroups = {};
  Object.values(groups).forEach((g) => {
    const hub =
      g.pids.length <= 2 && g.pids.find((id) => marriages.order[id]);
    const H = hub && state.people[hub];
    const sid = H && g.pids.length === 2 && g.pids.find((id) => id !== hub);
    const S = sid ? state.people[sid] : null;
    if (H && (g.pids.length === 1 || (S && Math.abs(H.y - S.y) < 5))) {
      if (!hubGroups[hub]) hubGroups[hub] = [];
      hubGroups[hub].push({ cids: g.cids, S, sid });
    } else drawFamily(g);
  });
  Object.entries(hubGroups).forEach(([hub, gs]) =>
    drawMarriageLines(hub, gs),
  );

  // One person with several marriages: each marriage's line comes down
  // from the partner line between the two spouses (or from the spouse's
  // own card when another card stands between them), and each family's
  // children bar gets its own height, picked so that lines cross as
  // little as possible and no stem runs alongside another family's drop.
  function drawMarriageLines(hubId, gs) {
    const H = state.people[hubId];
    const rank = marriages.order[hubId] || [];
    gs.forEach((g) => {
      g.kids = g.cids.map((id) => state.people[id]).filter(Boolean);
      g.order = g.sid ? rank.indexOf(g.sid) : rank.length;
      if (!g.S || cardsBetween(H, g.S)) {
        const from = g.S || H;
        g.x = cx(from);
        g.y0 = bot(from);
        g.lo = g.hi = g.x;
      } else {
        const l = Math.min(H.x, g.S.x) + CARD_W,
          r = Math.max(H.x, g.S.x);
        g.x = (l + r) / 2;
        g.lo = Math.min(g.x, l + 8);
        g.hi = Math.max(g.x, r - 8);
        g.y0 = mid(H) + 6;
      }
    });
    gs = gs.filter((g) => g.kids.length).sort((a, b) => a.order - b.order);
    if (!gs.length) return;
    // Slide a stem within its gap, away from other families' drops.
    gs.forEach((g) => {
      const foreign = gs
        .filter((o) => o !== g)
        .flatMap((o) => o.kids.map(cx));
      const room = (x) =>
        Math.min(Infinity, ...foreign.map((f) => Math.abs(f - x)));
      let best = g.x;
      for (let d = 0; g.x - d >= g.lo || g.x + d <= g.hi; d += 4) {
        const cand = [g.x - d, g.x + d].filter(
          (x) => x >= g.lo && x <= g.hi,
        );
        const hit = cand.find((x) => room(x) >= 16);
        if (hit !== undefined) {
          best = hit;
          break;
        }
        cand.forEach((x) => {
          if (room(x) > room(best)) best = x;
        });
      }
      g.x = best;
      const xs = g.kids.map(cx);
      g.min = Math.min(g.x, ...xs);
      g.max = Math.max(g.x, ...xs);
    });
    const n = gs.length;
    const firstTop = Math.min(...gs.flatMap((g) => g.kids.map(top)));
    const base = bot(H) + 28;
    const step =
      n > 1
        ? Math.max(4, Math.min(12, (firstTop - 10 - base) / (n - 1)))
        : 0;
    const levels = gs.map((_, i) => base + i * step);
    // How many crossings a given bar order produces.
    const cost = (lv) => {
      let c = 0;
      gs.forEach((g, a) =>
        gs.forEach((o, b) => {
          if (a === b) return;
          const inside = (x) => x > o.min - 1 && x < o.max + 1;
          if (lv[b] > g.y0 && lv[b] < lv[a] && inside(g.x)) c++;
          if (lv[b] > lv[a])
            g.kids.forEach((k) => {
              if (inside(cx(k))) c++;
            });
        }),
      );
      return c;
    };
    let bestLv = levels,
      bestCost = cost(levels);
    const permute = (rest, picked) => {
      if (!rest.length) {
        const lv = picked.map((i) => levels[i]);
        const c = cost(lv);
        if (c < bestCost) {
          bestCost = c;
          bestLv = lv;
        }
        return;
      }
      rest.forEach((i) =>
        permute(
          rest.filter((j) => j !== i),
          [...picked, i],
        ),
      );
    };
    if (n > 1 && n <= 5 && bestCost > 0)
      permute(
        gs.map((_, i) => i),
        [],
      );
    // These bars often run past other families (a son married into a
    // family placed between him and his father): a background-coloured
    // edge, drawn before the family's own lines, makes the lines they
    // pass over look interrupted rather than joined.
    gs.forEach((g, a) => {
      if (g.max <= g.min) return;
      const e = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      e.setAttribute("x1", (g.min + 4) | 0);
      e.setAttribute("x2", (g.max - 4) | 0);
      e.setAttribute("y1", bestLv[a] | 0);
      e.setAttribute("y2", bestLv[a] | 0);
      e.setAttribute("stroke-width", "7");
      e.style.stroke = "var(--bg)";
      svg.appendChild(e);
    });
    gs.forEach((g, a) => {
      const y = bestLv[a];
      seg(g.x, g.y0, g.x, y, GREEN);
      if (g.max > g.min) seg(g.min, y, g.max, y, GREEN);
      g.kids.forEach((k) => seg(cx(k), y, cx(k), top(k), GREEN));
    });
  }

  function drawFamily({ pids, cids }) {
    const parents = pids.map((id) => state.people[id]).filter(Boolean);
    const children = cids.map((id) => state.people[id]).filter(Boolean);
    if (!parents.length || !children.length) return;

    // Junction Y = midpoint between lowest parent bottom and highest child top
    const parBotY = Math.max(...parents.map((p) => bot(p)));
    const chiTopY = Math.min(...children.map((c) => top(c)));
    const jY = Math.round((parBotY + chiTopY) / 2);

    // Parent coupling point X = midpoint of all parent centerXs
    const parXs = parents.map((p) => cx(p));
    const coupleX = Math.round(
      (Math.min(...parXs) + Math.max(...parXs)) / 2,
    );

    // 1. Drop each parent down to jY
    parents.forEach((p) => seg(cx(p), bot(p), cx(p), jY, GREEN));
    // 2. If multiple parents, horizontal bar between them at jY
    if (parents.length > 1) {
      seg(Math.min(...parXs), jY, Math.max(...parXs), jY, GREEN);
    }
    // 3. Children bar Y — halfway between jY and first child top
    const chiXs = children.map((c) => cx(c));
    const chiMinX = Math.min(...chiXs),
      chiMaxX = Math.max(...chiXs);
    const chiBarY = jY + 20;

    // Stem from parent coupling point down to children bar
    seg(coupleX, jY, coupleX, chiBarY, GREEN);

    // Horizontal bar across the children, always reaching the stem so the
    // parents never look detached when the children sit off to one side.
    const barMinX = Math.min(chiMinX, coupleX),
      barMaxX = Math.max(chiMaxX, coupleX);
    if (barMaxX > barMinX) seg(barMinX, chiBarY, barMaxX, chiBarY, GREEN);

    // Drop from children bar down to each child top
    children.forEach((c) => seg(cx(c), chiBarY, cx(c), top(c), GREEN));

    // Label sits just above children bar
    const labelX = (chiMinX + chiMaxX) / 2;
    lbl(labelX, chiBarY - 6, "child", GREEN);
  }
}

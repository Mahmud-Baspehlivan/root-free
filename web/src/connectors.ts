// Lines between the person cards: partners, siblings, and parent → children.

import { t } from "./i18n.ts";
import { marriageInfo, marriageLabel } from "./layout.ts";
import { shownTree } from "./collapse.ts";
import { el } from "./state.ts";
import type { Person } from "./types.ts";

const GREEN = "#2d6a4f",
  PARTNER = "#b07d3a",
  SIBLING = "#6b4fa0";
const CARD_W = 172,
  CARD_H = 190;
const SVG_NS = "http://www.w3.org/2000/svg";

const cx = (p: Person) => (p.x || 0) + CARD_W / 2;
const top = (p: Person) => p.y || 0;
const bot = (p: Person) => (p.y || 0) + CARD_H;
const mid = (p: Person) => (p.y || 0) + CARD_H / 2;

interface MarriageGroup {
  cids: string[];
  S: Person | null;
  sid: string | null;
  kids: Person[];
  order: number;
  x: number;
  y0: number;
  lo: number;
  hi: number;
  min: number;
  max: number;
}

export function drawConnectors(): void {
  // The people on the canvas: with closed branches, only the visible ones.
  const tree = shownTree();
  const svg = el("connector-svg") as unknown as SVGSVGElement;
  svg.innerHTML = "";

  function seg(x1: number, y1: number, x2: number, y2: number, col: string, dash?: string): void {
    const e = document.createElementNS(SVG_NS, "line");
    e.setAttribute("x1", String(x1 | 0));
    e.setAttribute("y1", String(y1 | 0));
    e.setAttribute("x2", String(x2 | 0));
    e.setAttribute("y2", String(y2 | 0));
    e.setAttribute("stroke", col);
    e.setAttribute("stroke-width", "1.8");
    e.setAttribute("opacity", "0.65");
    if (dash) e.setAttribute("stroke-dasharray", dash);
    svg.appendChild(e);
  }
  function bez(x1: number, y1: number, x2: number, y2: number, col: string, dash?: string): void {
    const e = document.createElementNS(SVG_NS, "path");
    const my = (y1 + y2) / 2;
    e.setAttribute("d", `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
    e.setAttribute("stroke", col);
    e.setAttribute("stroke-width", "1.8");
    e.setAttribute("fill", "none");
    e.setAttribute("opacity", "0.65");
    if (dash) e.setAttribute("stroke-dasharray", dash);
    svg.appendChild(e);
  }
  function lbl(x: number, y: number, t: string, col: string): SVGTextElement {
    const e = document.createElementNS(SVG_NS, "text");
    e.setAttribute("x", String(x | 0));
    e.setAttribute("y", String(y | 0));
    e.setAttribute("text-anchor", "middle");
    e.setAttribute("font-size", "10");
    e.setAttribute("fill", col);
    e.setAttribute("opacity", "0.8");
    e.setAttribute("font-family", "Inter,sans-serif");
    e.setAttribute("font-weight", "500");
    e.textContent = t;
    svg.appendChild(e);
    return e;
  }
  // A background-coloured band, drawn under a line so that the lines it
  // crosses look interrupted instead of joined.
  function halo(x1: number, y1: number, x2: number, y2: number): void {
    const e = document.createElementNS(SVG_NS, "line");
    e.setAttribute("x1", String(x1 | 0));
    e.setAttribute("y1", String(y1 | 0));
    e.setAttribute("x2", String(x2 | 0));
    e.setAttribute("y2", String(y2 | 0));
    e.setAttribute("stroke-width", "7");
    e.style.stroke = "var(--bg)";
    svg.appendChild(e);
  }
  function haloLbl(x: number, y: number, t: string, col: string): void {
    const e = lbl(x, y, t, col);
    e.style.paintOrder = "stroke";
    e.style.stroke = "var(--bg)";
    e.style.strokeWidth = "4px";
  }

  const marriages = marriageInfo();
  const marriageNo = (x: string, y: string) => marriages.number[[x, y].sort().join("|")];
  // Two people in the same row with another card between them (a third
  // spouse standing beyond the second one).
  const cardsBetween = (a: Person, b: Person) => {
    if (Math.abs((a.y || 0) - (b.y || 0)) >= 5) return false;
    const l = Math.min(a.x || 0, b.x || 0),
      r = Math.max(a.x || 0, b.x || 0);
    return Object.values(tree.people).some(
      (p) => p !== a && p !== b && Math.abs((p.y || 0) - (a.y || 0)) < 5 && (p.x || 0) > l && (p.x || 0) < r,
    );
  };

  // Partners: a short line between cards that stand side by side, a bridge
  // over the row when another card stands between them, otherwise a curve.
  // Someone with several partners gets numbered marriages.
  tree.relationships
    .filter((r) => r.type === "partner")
    .forEach((rel) => {
      const a = tree.people[rel.a],
        b = tree.people[rel.b];
      if (!a || !b) return;
      const no = marriageNo(rel.a, rel.b);
      const text = no ? marriageLabel(no) : t("linePartner");
      const left = a.x <= b.x ? a : b;
      const right = left === a ? b : a;
      const closeAndAligned =
        Math.abs(mid(a) - mid(b)) < 5 && right.x >= left.x + CARD_W && right.x - (left.x + CARD_W) <= 65;
      if (closeAndAligned) {
        seg(left.x + CARD_W, mid(left), right.x, mid(right), PARTNER, "6 4");
        if (no) lbl((left.x + CARD_W + right.x) / 2, mid(left) - 6, text, PARTNER);
      } else if (cardsBetween(a, b)) {
        const y = top(left) - 9;
        const x1 = left.x + CARD_W - 24,
          x2 = right.x + 24;
        seg(x1, top(left), x1, y, PARTNER, "6 4");
        halo(x1, y, x2, y);
        seg(x1, y, x2, y, PARTNER, "6 4");
        seg(x2, y, x2, top(right), PARTNER, "6 4");
        haloLbl((x1 + x2) / 2, y + 3, text, PARTNER);
      } else {
        bez(cx(a), mid(a), cx(b), mid(b), PARTNER, "6 4");
        lbl((cx(a) + cx(b)) / 2, (mid(a) + mid(b)) / 2 - 8, text, PARTNER);
      }
    });

  // Siblings: a simple curve.
  tree.relationships
    .filter((r) => r.type === "sibling")
    .forEach((rel) => {
      const a = tree.people[rel.a],
        b = tree.people[rel.b];
      if (!a || !b) return;
      bez(cx(a), mid(a), cx(b), mid(b), SIBLING, "4 3");
      lbl((cx(a) + cx(b)) / 2, (mid(a) + mid(b)) / 2 - 8, t("lineSibling"), SIBLING);
    });

  // Children grouped by their exact set of parents.
  const byChild: Record<string, string[]> = {};
  tree.relationships.forEach((r) => {
    const pair = r.type === "parent" ? { pid: r.a, cid: r.b } : r.type === "child" ? { pid: r.b, cid: r.a } : null;
    if (!pair) return;
    const list = (byChild[pair.cid] ??= []);
    if (!list.includes(pair.pid)) list.push(pair.pid);
  });
  const groups: Record<string, { pids: string[]; cids: string[] }> = {};
  Object.entries(byChild).forEach(([cid, pids]) => {
    const key = [...pids].sort().join("|");
    const g = (groups[key] ??= { pids: [...pids], cids: [] });
    if (!g.cids.includes(cid)) g.cids.push(cid);
  });

  // Children of someone with several marriages are drawn per marriage (see
  // drawMarriageLines); everything else uses the plain couple drawing.
  const hubGroups: Record<string, Array<{ cids: string[]; S: Person | null; sid: string | null }>> = {};
  const plain: Array<{ pids: string[]; cids: string[] }> = [];
  Object.values(groups).forEach((g) => {
    const hub = g.pids.length <= 2 ? g.pids.find((id) => marriages.order[id]) : undefined;
    const H = hub ? tree.people[hub] : undefined;
    const sid = H && g.pids.length === 2 ? (g.pids.find((id) => id !== hub) ?? null) : null;
    const S = sid ? (tree.people[sid] ?? null) : null;
    if (hub && H && (g.pids.length === 1 || (S && Math.abs(H.y - S.y) < 5))) {
      (hubGroups[hub] ??= []).push({ cids: g.cids, S, sid });
    } else plain.push(g);
  });

  // Children bars and the vertical lines drawn so far. Two families' bars at
  // the same height that overlap would read as one line joining both
  // families, so each bar takes a height of its own (see freeLevel).
  const bars: Array<{ y: number; min: number; max: number }> = [];
  const drops: Array<{ x: number; y1: number; y2: number }> = [];
  const clash = (y: number, min: number, max: number) =>
    bars.some((b) => Math.abs(b.y - y) < 5 && Math.min(b.max, max) - Math.max(b.min, min) > -6);
  /** Lines a bar at height y would cross: its own bar over others' drops, its drops through others' bars. */
  const crossings = (y: number, min: number, max: number, ownDrops: Array<{ x: number; y1: number; y2: number }>) =>
    drops.filter((d) => d.x > min && d.x < max && y > d.y1 && y < d.y2).length +
    ownDrops
      .map((d) => ({ x: d.x, y1: Math.min(d.y1, y), y2: Math.max(d.y2, y) }))
      .reduce((n, d) => n + bars.filter((b) => d.x > b.min && d.x < b.max && b.y > d.y1 && b.y < d.y2).length, 0);
  /** A free height between lo and hi for a bar from min to max: the one crossing
   * the fewest lines, and of those the nearest to `want`. `ownDrops` are the
   * family's own vertical lines, which end at the bar. */
  const freeLevel = (
    want: number,
    min: number,
    max: number,
    lo: number,
    hi: number,
    ownDrops: Array<{ x: number; y1: number; y2: number }>,
  ) => {
    let best = want,
      bestCost = Infinity;
    for (let d = 0; want - d >= lo || want + d <= hi; d += 8)
      for (const y of d ? [want - d, want + d] : [want]) {
        if (y < lo || y > hi || clash(y, min, max)) continue;
        const c = crossings(y, min, max, ownDrops);
        if (c < bestCost) {
          best = y;
          bestCost = c;
        }
      }
    return best;
  };

  // Several marriages first: their bar heights are chosen together, and the
  // other families then fit around them, widest bar first.
  Object.entries(hubGroups).forEach(([hub, gs]) => drawMarriageLines(hub, gs));
  const span = (g: { pids: string[]; cids: string[] }) => {
    const xs = [...g.pids, ...g.cids].map((id) => tree.people[id]).filter(Boolean).map(cx);
    return xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  };
  plain.sort((a, b) => span(b) - span(a)).forEach(drawFamily);

  // One person with several marriages: each marriage's line comes down from
  // the partner line between the two spouses (or from the spouse's own card
  // when another card stands between them), and each family's children bar
  // gets its own height, picked so that lines cross as little as possible.
  function drawMarriageLines(
    hubId: string,
    input: Array<{ cids: string[]; S: Person | null; sid: string | null }>,
  ): void {
    const H = tree.people[hubId];
    const rank = marriages.order[hubId] || [];
    const all: MarriageGroup[] = input.map((g) => {
      const kids = g.cids.map((id) => tree.people[id]).filter(Boolean);
      const order = g.sid ? rank.indexOf(g.sid) : rank.length;
      let x: number, y0: number, lo: number, hi: number;
      if (!g.S || cardsBetween(H, g.S)) {
        const from = g.S || H;
        x = lo = hi = cx(from);
        y0 = bot(from);
      } else {
        const l = Math.min(H.x, g.S.x) + CARD_W,
          r = Math.max(H.x, g.S.x);
        x = (l + r) / 2;
        lo = Math.min(x, l + 8);
        hi = Math.max(x, r - 8);
        y0 = mid(H) + 6;
      }
      return { ...g, kids, order, x, y0, lo, hi, min: x, max: x };
    });
    const gs = all.filter((g) => g.kids.length).sort((a, b) => a.order - b.order);
    if (!gs.length) return;
    // Slide each stem within its gap, away from the other families' drops,
    // so it never runs alongside a half-sibling's line.
    gs.forEach((g) => {
      const foreign = gs.filter((o) => o !== g).flatMap((o) => o.kids.map(cx));
      const room = (x: number) => Math.min(Infinity, ...foreign.map((f) => Math.abs(f - x)));
      let best = g.x;
      for (let d = 0; g.x - d >= g.lo || g.x + d <= g.hi; d += 4) {
        const cand = [g.x - d, g.x + d].filter((x) => x >= g.lo && x <= g.hi);
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
    const step = n > 1 ? Math.max(4, Math.min(12, (firstTop - 10 - base) / (n - 1))) : 0;
    const levels = gs.map((_, i) => base + i * step);
    // Number of crossings for a given assignment of bar heights.
    const cost = (lv: number[]) => {
      let c = 0;
      gs.forEach((g, a) =>
        gs.forEach((o, b) => {
          if (a === b) return;
          const inside = (x: number) => x > o.min - 1 && x < o.max + 1;
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
    const permute = (rest: number[], picked: number[]): void => {
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
    // These bars often run past other families (a son married into a family
    // placed between him and his father). Their background-coloured bands go
    // down first, so the lines they pass over look interrupted, not joined.
    gs.forEach((g, a) => {
      if (g.max > g.min) halo(g.min + 4, bestLv[a], g.max - 4, bestLv[a]);
    });
    gs.forEach((g, a) => {
      const y = bestLv[a];
      bars.push({ y, min: g.min, max: g.max });
      drops.push({ x: g.x, y1: g.y0, y2: y }, ...g.kids.map((k) => ({ x: cx(k), y1: y, y2: top(k) })));
      seg(g.x, g.y0, g.x, y, GREEN);
      if (g.max > g.min) seg(g.min, y, g.max, y, GREEN);
      g.kids.forEach((k) => seg(cx(k), y, cx(k), top(k), GREEN));
    });
  }

  function drawFamily({ pids, cids }: { pids: string[]; cids: string[] }): void {
    const parents = pids.map((id) => tree.people[id]).filter(Boolean);
    const children = cids.map((id) => tree.people[id]).filter(Boolean);
    if (!parents.length || !children.length) return;

    // Junction: halfway between the lowest parent bottom and the highest child top.
    const parBotY = Math.max(...parents.map(bot));
    const chiTopY = Math.min(...children.map(top));
    const jY = Math.round((parBotY + chiTopY) / 2);

    // Parent coupling point: midway between the outermost parents.
    const parXs = parents.map(cx);
    const coupleX = Math.round((Math.min(...parXs) + Math.max(...parXs)) / 2);

    // Drop each parent to the junction, joined by a bar when there are two.
    parents.forEach((p) => seg(cx(p), bot(p), cx(p), jY, GREEN));
    if (parents.length > 1) seg(Math.min(...parXs), jY, Math.max(...parXs), jY, GREEN);

    // Stem down to the children bar, which always reaches the stem so the
    // parents never look detached when the children sit off to one side.
    const chiXs = children.map(cx);
    const chiMinX = Math.min(...chiXs),
      chiMaxX = Math.max(...chiXs);
    const barMinX = Math.min(chiMinX, coupleX),
      barMaxX = Math.max(chiMaxX, coupleX);
    // Below the parents' junction and above the children's cards. The drops
    // are given from the bar's own end: the stem from above, the children's from below.
    const own = [{ x: coupleX, y1: jY, y2: jY }, ...children.map((c) => ({ x: cx(c), y1: top(c), y2: top(c) }))];
    const chiBarY = freeLevel(jY + 20, barMinX, barMaxX, jY + 6, chiTopY - 8, own);
    bars.push({ y: chiBarY, min: barMinX, max: barMaxX });
    drops.push({ x: coupleX, y1: jY, y2: chiBarY }, ...children.map((c) => ({ x: cx(c), y1: chiBarY, y2: top(c) })));
    seg(coupleX, jY, coupleX, chiBarY, GREEN);
    if (barMaxX > barMinX) seg(barMinX, chiBarY, barMaxX, chiBarY, GREEN);

    children.forEach((c) => seg(cx(c), chiBarY, cx(c), top(c), GREEN));
    lbl((chiMinX + chiMaxX) / 2, chiBarY - 6, t("lineChild"), GREEN);
  }
}

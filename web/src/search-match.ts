// Finding people by name. Pure functions, tested without a page (see search.ts).

import type { Tree } from "./types.ts";

/** Lower case without accents, Turkish letters folded to plain ones, so
 * "baspehlivan", "BAŞPEHLİVAN" and "Başpehlivan" are the same. */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** People whose name holds every word of the query, best matches first: the
 * whole name, then names starting with it, then a word of the name starting
 * with it, then anything else; ties by name. */
export function findPeople(tree: Tree, query: string, limit = 8): string[] {
  const q = fold(query);
  if (!q) return [];
  const words = q.split(" ");
  const scored: { id: string; name: string; score: number }[] = [];
  for (const [id, p] of Object.entries(tree.people)) {
    const name = fold(`${p.first || ""} ${p.last || ""}`);
    if (!words.every((w) => name.includes(w))) continue;
    const parts = name.split(" ");
    const score =
      name === q ? 0 : name.startsWith(q) ? 1 : words.every((w) => parts.some((part) => part.startsWith(w))) ? 2 : 3;
    scored.push({ id, name, score });
  }
  scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, "tr"));
  return scored.slice(0, limit).map((s) => s.id);
}

import { prepareFuzzySearch } from "obsidian";
import type { Supertag } from "./types";

/**
 * Rank supertags against a query with Obsidian's fuzzy matcher. Matches on both
 * the display name and the tag; ranks by best score. Empty query returns the
 * list unchanged (already sorted by pinned + name upstream).
 */
export function fuzzyFilterSupertags(query: string, list: Supertag[]): Supertag[] {
  const q = query.trim();
  if (!q) return list;

  const match = prepareFuzzySearch(q);
  const scored: Array<{ st: Supertag; score: number }> = [];
  for (const st of list) {
    const byName = match(st.baseName);
    const byTag = match(st.tag);
    const best = Math.max(byName?.score ?? -Infinity, byTag?.score ?? -Infinity);
    if (best !== -Infinity) scored.push({ st, score: best });
  }
  // Higher score = better. Ties keep the incoming (pinned/alpha) order.
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.st);
}

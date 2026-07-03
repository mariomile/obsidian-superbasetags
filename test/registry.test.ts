import { describe, expect, it } from "vitest";
import { normalizeTagCounts, sortSupertags } from "../src/registry";
import type { Supertag } from "../src/types";

function st(partial: Partial<Supertag>): Supertag {
  return {
    tag: "type/x",
    baseName: "X",
    basePath: "x.base",
    fields: [],
    icon: "🏷️",
    pinned: false,
    memberCount: 0,
    ...partial,
  };
}

describe("normalizeTagCounts", () => {
  it("strips the leading # and lowercases keys", () => {
    const m = normalizeTagCounts({ "#type/Person": 5 });
    expect(m.get("type/person")).toBe(5);
  });

  it("sums counts that collide after case-folding", () => {
    const m = normalizeTagCounts({ "#type/Person": 5, "type/person": 3 });
    expect(m.get("type/person")).toBe(8);
  });

  it("keeps distinct tags separate (no nested rollup)", () => {
    const m = normalizeTagCounts({ "#type/person": 5, "#type/person/founder": 2 });
    expect(m.get("type/person")).toBe(5);
    expect(m.get("type/person/founder")).toBe(2);
  });

  it("returns an empty map for no tags", () => {
    expect(normalizeTagCounts({}).size).toBe(0);
  });
});

describe("sortSupertags", () => {
  it("puts pinned items before unpinned", () => {
    const out = sortSupertags([
      st({ baseName: "Alpha", pinned: false }),
      st({ baseName: "Beta", pinned: true }),
    ]);
    expect(out.map((s) => s.baseName)).toEqual(["Beta", "Alpha"]);
  });

  it("sorts alphabetically within the same pin state", () => {
    const out = sortSupertags([
      st({ baseName: "Charlie" }),
      st({ baseName: "Alpha" }),
      st({ baseName: "Bravo" }),
    ]);
    expect(out.map((s) => s.baseName)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("orders pinned block alphabetically, then unpinned block alphabetically", () => {
    const out = sortSupertags([
      st({ baseName: "Zeta", pinned: true }),
      st({ baseName: "Apple", pinned: false }),
      st({ baseName: "Amber", pinned: true }),
    ]);
    expect(out.map((s) => s.baseName)).toEqual(["Amber", "Zeta", "Apple"]);
  });
});

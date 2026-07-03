import { describe, expect, it } from "vitest";
import { extractTag, extractFields, guessType, inScope } from "../src/base-scanner";

describe("extractTag", () => {
  it("finds a prefixed tag in a flat and-filter", () => {
    const filters = { and: ['file.hasTag("type/person")', 'file.ext == "md"'] };
    expect(extractTag(filters, "type/")).toBe("type/person");
  });

  it("walks nested and/or/not structures", () => {
    const filters = { or: [{ and: ['file.hasTag("type/company")'] }, "note.x > 1"] };
    expect(extractTag(filters, "type/")).toBe("type/company");
  });

  it("returns null when no tag matches the prefix", () => {
    const filters = { and: ['file.hasTag("status/active")'] };
    expect(extractTag(filters, "type/")).toBeNull();
  });

  it("accepts single-quoted hasTag and picks the first prefixed match", () => {
    const filters = { and: ["file.hasTag('area/x')", "file.hasTag('type/goal')"] };
    expect(extractTag(filters, "type/")).toBe("type/goal");
  });

  it("returns null for empty/missing filters", () => {
    expect(extractTag(undefined, "type/")).toBeNull();
    expect(extractTag(null, "type/")).toBeNull();
  });
});

describe("extractFields", () => {
  it("collects property keys, skipping file.*, formula.* and structural keys", () => {
    const base = {
      properties: {
        role: { displayName: "Role" },
        company: {},
        "file.name": {},
        "formula.age": {},
        tags: {},
      },
    };
    const fields = extractFields(base);
    const keys = fields.map((f) => f.key).sort();
    expect(keys).toEqual(["company", "role"]);
    expect(fields.find((f) => f.key === "role")?.label).toBe("Role");
  });

  it("merges keys from view order arrays", () => {
    const base = { views: [{ order: ["file.name", "priority", "status"] }] };
    const keys = extractFields(base).map((f) => f.key).sort();
    expect(keys).toEqual(["priority", "status"]);
  });

  it("falls back to the key when no displayName is set", () => {
    const base = { properties: { website: {} } };
    expect(extractFields(base)[0].label).toBe("website");
  });
});

describe("guessType", () => {
  it("infers date from date-ish keys", () => {
    expect(guessType("start_date")).toBe("date");
    expect(guessType("created_at")).toBe("date");
    expect(guessType("published_on")).toBe("date");
  });

  it("infers checkbox from boolean-ish keys", () => {
    expect(guessType("is_active")).toBe("checkbox");
    expect(guessType("has_notes")).toBe("checkbox");
    expect(guessType("done")).toBe("checkbox");
  });

  it("infers number from quantity-ish keys", () => {
    expect(guessType("page_count")).toBe("number");
    expect(guessType("priority")).toBe("number");
  });

  it("infers list from list-ish keys", () => {
    expect(guessType("aliases")).toBe("list");
    expect(guessType("authors")).toBe("list");
    expect(guessType("tag_list")).toBe("list");
  });

  it("defaults to text", () => {
    expect(guessType("role")).toBe("text");
    expect(guessType("company")).toBe("text");
  });
});

describe("inScope", () => {
  it("matches everything when scope is empty", () => {
    expect(inScope("anywhere/x.base", [])).toBe(true);
  });

  it("matches a folder prefix and the folder itself", () => {
    expect(inScope("_system/views/Person.base", ["_system/views"])).toBe(true);
    expect(inScope("_system/views", ["_system/views"])).toBe(true);
  });

  it("rejects paths outside all scope folders", () => {
    expect(inScope("Atlas/People/x.base", ["_system/views"])).toBe(false);
  });

  it("does not match a sibling folder sharing a prefix string", () => {
    expect(inScope("_system/views-old/x.base", ["_system/views"])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { slugify } from "../src/create-modal";
import { defaultFor } from "../src/frontmatter";
import type { SupertagField } from "../src/types";

function field(partial: Partial<SupertagField>): SupertagField {
  return { key: "k", label: "K", type: "text", ...partial };
}

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Meeting Notes")).toBe("meeting-notes");
  });

  it("collapses runs of non-alphanumerics and trims edges", () => {
    expect(slugify("  Hello --- World!!  ")).toBe("hello-world");
  });

  it("strips accents-free punctuation to a clean segment", () => {
    expect(slugify("A/B & C")).toBe("a-b-c");
  });

  it("returns empty string for punctuation-only input", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("defaultFor", () => {
  it("returns an explicit non-empty default when present", () => {
    expect(defaultFor(field({ default: "hi" }))).toBe("hi");
  });

  it("ignores empty-string defaults and uses the type default", () => {
    expect(defaultFor(field({ type: "list", default: "" }))).toEqual([]);
  });

  it("maps types to sensible empties", () => {
    expect(defaultFor(field({ type: "list" }))).toEqual([]);
    expect(defaultFor(field({ type: "checkbox" }))).toBe(false);
    expect(defaultFor(field({ type: "number" }))).toBeNull();
    expect(defaultFor(field({ type: "text" }))).toBe("");
    expect(defaultFor(field({ type: "date" }))).toBe("");
  });
});

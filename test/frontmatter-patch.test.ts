import { describe, it, expect } from "vitest";
import {
  addTagToFrontmatter,
  frontmatterTopKeys,
  patchFrontmatter,
} from "../src/frontmatter-patch";
import { applySupertag } from "../src/frontmatter";
import type { Supertag } from "../src/types";
import type { App, TFile } from "obsidian";

describe("patchFrontmatter", () => {
  it("sets a new key while preserving unquoted wikilinks byte-for-byte", () => {
    const src = "---\ncompany: [[Acme Corp]]\nup: \"[[MOC]]\"\n---\nBody";
    expect(patchFrontmatter(src, { status: "open" })).toBe(
      "---\ncompany: [[Acme Corp]]\nup: \"[[MOC]]\"\nstatus: \"open\"\n---\nBody"
    );
  });

  it("replaces an existing key in place", () => {
    const src = "---\nstatus: \"old\"\ncompany: [[Acme]]\n---\nB";
    expect(patchFrontmatter(src, { status: "new" })).toBe(
      "---\nstatus: \"new\"\ncompany: [[Acme]]\n---\nB"
    );
  });

  it("removes a key and its continuation lines", () => {
    const src = "---\nrelated:\n  - \"[[A]]\"\n  - \"[[B]]\"\ncompany: [[Acme]]\n---\nB";
    expect(patchFrontmatter(src, {}, ["related"])).toBe("---\ncompany: [[Acme]]\n---\nB");
  });

  it("creates frontmatter when the note has none", () => {
    expect(patchFrontmatter("Body", { status: "open" })).toBe("---\nstatus: \"open\"\n---\nBody");
  });

  it("encodes lists, booleans, numbers and null", () => {
    const src = "---\na: 1\n---\nB";
    const out = patchFrontmatter(src, { l: ["x", "y"], b: false, n: 3, e: null });
    expect(out).toContain('l: ["x","y"]');
    expect(out).toContain("b: false");
    expect(out).toContain("n: 3");
    expect(out).toContain("e: null");
  });
});

describe("frontmatterTopKeys", () => {
  it("lists top-level keys only", () => {
    const keys = frontmatterTopKeys("---\ntags:\n  - a\ncompany: [[Acme]]\n---\nB");
    expect(keys).toEqual(new Set(["tags", "company"]));
  });

  it("is empty without frontmatter", () => {
    expect(frontmatterTopKeys("Body")).toEqual(new Set());
  });
});

describe("addTagToFrontmatter", () => {
  it("adds to a list block and keeps unquoted wikilinks intact", () => {
    const src = "---\ntags:\n  - type/note\ncompany: [[Acme]]\n---\nB";
    expect(addTagToFrontmatter(src, "x")).toBe(
      "---\ntags:\n  - type/note\n  - x\ncompany: [[Acme]]\n---\nB"
    );
  });

  it("returns null when already present", () => {
    expect(addTagToFrontmatter("---\ntags: [x]\n---\n", "#x")).toBeNull();
  });
});

/** Fake App whose vault.process applies the mutator to an in-memory string. */
function fakeApp(initial: string) {
  const state = { content: initial };
  const app = {
    vault: {
      process: async (_f: TFile, fn: (c: string) => string) => {
        state.content = fn(state.content);
        return state.content;
      },
    },
  } as unknown as App;
  return { app, state };
}

describe("applySupertag (raw-text)", () => {
  const st: Supertag = {
    tag: "type/book",
    fields: [
      { key: "author", type: "text" },
      { key: "rating", type: "number" },
    ],
  } as unknown as Supertag;

  it("adds tag and scaffolds only missing fields, preserving wikilinks", async () => {
    const { app, state } = fakeApp("---\ncompany: [[Acme]]\nauthor: \"Someone\"\n---\nB");
    const res = await applySupertag(app, {} as TFile, st, true);
    expect(res.tagAdded).toBe(true);
    expect(res.fieldsAdded).toEqual(["rating"]);
    expect(state.content).toContain("company: [[Acme]]");
    expect(state.content).toContain("author: \"Someone\"");
    expect(state.content).toContain("- type/book");
    expect(state.content).toContain("rating: null");
  });

  it("reports tagAdded:false when the tag is already there", async () => {
    const { app } = fakeApp("---\ntags:\n  - type/book\n---\nB");
    const res = await applySupertag(app, {} as TFile, st, false);
    expect(res.tagAdded).toBe(false);
  });
});

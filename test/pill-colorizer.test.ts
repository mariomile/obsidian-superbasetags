import { describe, expect, it } from "vitest";
import {
  PILL_PALETTE,
  hashString,
  normalizePillKey,
  pickPillColor,
} from "../src/pill-colorizer";

describe("normalizePillKey", () => {
  it("strips a leading # and lowercases", () => {
    expect(normalizePillKey("#crm/founder")).toBe("crm/founder");
    expect(normalizePillKey("Founder")).toBe("founder");
  });

  it("trims whitespace", () => {
    expect(normalizePillKey("  Warm ")).toBe("warm");
  });

  it("returns empty string for nullish-ish input", () => {
    expect(normalizePillKey("")).toBe("");
    expect(normalizePillKey("   ")).toBe("");
  });
});

describe("hashString", () => {
  it("is deterministic", () => {
    expect(hashString("founder")).toBe(hashString("founder"));
  });

  it("spreads distinct values", () => {
    // Not a strong guarantee, just a sanity check that common CRM values
    // don't all collapse onto one bucket.
    const buckets = new Set(
      ["founder", "investor", "author", "partner", "colleague"].map(
        (v) => hashString(v) % PILL_PALETTE.length
      )
    );
    expect(buckets.size).toBeGreaterThan(1);
  });

  it("is non-negative", () => {
    expect(hashString("ünïcødé ✨")).toBeGreaterThanOrEqual(0);
  });
});

describe("pickPillColor", () => {
  it("returns a palette color deterministically", () => {
    const c1 = pickPillColor("founder", {});
    const c2 = pickPillColor("founder", {});
    expect(c1).toBe(c2);
    expect(PILL_PALETTE).toContain(c1);
  });

  it("is case- and #-insensitive on the value", () => {
    expect(pickPillColor("#Founder", {})).toBe(pickPillColor("founder", {}));
  });

  it("honors overrides (stored with normalized keys)", () => {
    expect(pickPillColor("Founder", { founder: "purple" })).toBe("purple");
  });

  it("ignores overrides pointing outside the palette", () => {
    expect(pickPillColor("founder", { founder: "hotpink" })).toBe(
      pickPillColor("founder", {})
    );
  });

  it("returns null for empty values", () => {
    expect(pickPillColor("", {})).toBeNull();
    expect(pickPillColor("  ", {})).toBeNull();
  });
});

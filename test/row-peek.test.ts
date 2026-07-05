import { describe, expect, it } from "vitest";
import { formatPropertyValue, parsePropertyInput } from "../src/row-peek";

describe("formatPropertyValue", () => {
  it("joins lists with comma+space", () => {
    expect(formatPropertyValue(["a", "b"])).toBe("a, b");
  });

  it("stringifies scalars", () => {
    expect(formatPropertyValue(42)).toBe("42");
    expect(formatPropertyValue("x")).toBe("x");
  });

  it("renders null/undefined as empty string", () => {
    expect(formatPropertyValue(null)).toBe("");
    expect(formatPropertyValue(undefined)).toBe("");
  });
});

describe("parsePropertyInput", () => {
  it("splits back into a list when the original was a list", () => {
    expect(parsePropertyInput("a, b", ["old"])).toEqual(["a", "b"]);
  });

  it("drops empty list entries", () => {
    expect(parsePropertyInput("a, , b,", ["old"])).toEqual(["a", "b"]);
  });

  it("keeps numbers numeric when the original was a number", () => {
    expect(parsePropertyInput("7", 3)).toBe(7);
  });

  it("falls back to the raw string for non-numeric input on numeric fields", () => {
    expect(parsePropertyInput("seven", 3)).toBe("seven");
  });

  it("parses booleans when the original was boolean", () => {
    expect(parsePropertyInput("true", false)).toBe(true);
    expect(parsePropertyInput("false", true)).toBe(false);
  });

  it("returns null for empty input", () => {
    expect(parsePropertyInput("", "x")).toBeNull();
    expect(parsePropertyInput("   ", ["x"])).toBeNull();
  });

  it("passes strings through unchanged otherwise", () => {
    expect(parsePropertyInput("hello", "old")).toBe("hello");
  });
});

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * i18n contract: this plugin's user-facing strings must be English.
 *
 * Scans src/**​/*.ts (excluding *.test.ts) for string literals passed to
 * setName/setDesc/setPlaceholder/setTooltip/new Notice(...), plus object-literal
 * properties name|title|description|label|text, and flags any that look
 * Italian (>= 2 distinct Italian function words, whole-word, case-insensitive).
 *
 * Mirrors the scanner spec used across the obsidian-* plugin suite's
 * i18n-contract tests.
 */

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

// Standard Italian function-word list used across the suite's i18n-contract
// tests. Whole-word, case-insensitive. Do not extend to force a red — a
// string must contain >= 2 of these to be flagged.
const ITALIAN_FUNCTION_WORDS = [
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "un",
  "una",
  "di",
  "del",
  "della",
  "dei",
  "delle",
  "che",
  "con",
  "per",
  "non",
  "sono",
  "questo",
  "questa",
  "come",
  "apri",
  "chiudi",
  "nessun",
  "nessuna",
  "nota",
  "aggiungi",
  "rimuovi",
  "modifica",
  "cerca",
];

interface Offense {
  file: string;
  line: number;
  text: string;
  matchedWords: string[];
}

/** Strip `//` line comments and `/* *​/` block comments so commented-out
 * code or prose doesn't trip the scanner. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/** Count distinct Italian function words present as whole words in `text`. */
function distinctItalianWordMatches(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const word of ITALIAN_FUNCTION_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    if (re.test(lower)) {
      found.add(word);
    }
  }
  return [...found];
}

/** Returns true (and the matched words) when `text` looks Italian: >= 2
 * distinct function words from the list, whole-word, case-insensitive. */
function flagIfItalian(text: string): string[] | null {
  const matches = distinctItalianWordMatches(text);
  return matches.length >= 2 ? matches : null;
}

// Candidate string literal: '...' or "..." (no template literals — those
// carry interpolation and aren't plain user-facing copy in this codebase).
const STRING_LITERAL = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;

const CALL_PATTERNS = [
  new RegExp(String.raw`\.setName\(\s*(?:${STRING_LITERAL})`, "g"),
  new RegExp(String.raw`\.setDesc\(\s*(?:${STRING_LITERAL})`, "g"),
  new RegExp(String.raw`\.setPlaceholder\(\s*(?:${STRING_LITERAL})`, "g"),
  new RegExp(String.raw`\.setTooltip\(\s*(?:${STRING_LITERAL})`, "g"),
  new RegExp(String.raw`new Notice\(\s*(?:${STRING_LITERAL})`, "g"),
];

const PROPERTY_PATTERN = new RegExp(
  String.raw`\b(?:name|title|description|label|text)\s*:\s*(?:${STRING_LITERAL})`,
  "g"
);

function extractLiteral(match: RegExpExecArray): string {
  // Two capture groups: single-quoted (1) or double-quoted (2).
  return (match[1] ?? match[2] ?? "").trim();
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/** Scan one source file's text for Italian-flagged user-facing strings. */
export function scanSourceForItalianStrings(
  fileLabel: string,
  rawSource: string
): Offense[] {
  const source = stripComments(rawSource);
  const offenses: Offense[] = [];

  for (const pattern of [...CALL_PATTERNS, PROPERTY_PATTERN]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const literal = extractLiteral(match);
      if (!literal) continue;
      const matchedWords = flagIfItalian(literal);
      if (matchedWords) {
        offenses.push({
          file: fileLabel,
          line: lineNumberAt(source, match.index),
          text: literal,
          matchedWords,
        });
      }
    }
  }

  return offenses;
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("i18n contract: user-facing strings must be English", () => {
  it("flags a synthetic Italian fixture (>= 2 function words)", () => {
    const fixture = `new Setting(x).setName("Nessuna nota trovata");`;
    const offenses = scanSourceForItalianStrings("fixture.ts", fixture);
    expect(offenses).toHaveLength(1);
    expect(offenses[0]?.text).toBe("Nessuna nota trovata");
    expect(offenses[0]?.matchedWords.length).toBeGreaterThanOrEqual(2);
  });

  it("does not flag a clean English fixture", () => {
    const fixture = `new Setting(x).setName("No notes found");`;
    const offenses = scanSourceForItalianStrings("fixture.ts", fixture);
    expect(offenses).toEqual([]);
  });

  it("has no Italian user-facing strings anywhere in src/", () => {
    const files = listSourceFiles(SRC_DIR);
    const allOffenses: Offense[] = [];

    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      allOffenses.push(...scanSourceForItalianStrings(file, contents));
    }

    if (allOffenses.length > 0) {
      const details = allOffenses
        .map((o) => `  ${o.file}:${o.line} — "${o.text}" (matched: ${o.matchedWords.join(", ")})`)
        .join("\n");
      throw new Error(`Found Italian user-facing string(s):\n${details}`);
    }

    expect(allOffenses).toEqual([]);
  });
});

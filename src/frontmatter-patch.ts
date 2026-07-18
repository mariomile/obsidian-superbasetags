/**
 * Raw-text YAML frontmatter patching. Obsidian's `processFrontMatter()` parses
 * and re-serializes the whole block, which corrupts vault-specific YAML such
 * as unquoted wikilinks (`company: [[Acme]]` → nested list) — a recurring
 * incident in this vault. These helpers rewrite only the keys they touch and
 * preserve every other frontmatter byte. Vendored from exo's
 * `core/frontmatter-patch.ts` (plus the tags helper shared with portal).
 */

function yamlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function yamlValue(value: unknown): string {
  if (value === undefined) return "null";
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "null" : encoded;
}

function topLevelKey(line: string): string | null {
  if (!line || /^[ \t#-]/.test(line)) return null;
  const colon = line.indexOf(":");
  if (colon <= 0) return null;
  const raw = line.slice(0, colon).trim();
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  return raw;
}

function replaceKeyBlock(block: string, key: string, line: string | null, newline: string): string {
  const lines = block ? block.split(/\r?\n/) : [];
  const start = lines.findIndex((candidate) => topLevelKey(candidate) === key);
  if (start < 0) {
    if (line !== null) lines.push(line);
    return lines.join(newline);
  }
  let end = start + 1;
  while (end < lines.length && topLevelKey(lines[end]) === null) end++;
  lines.splice(start, end - start, ...(line === null ? [] : [line]));
  return lines.join(newline);
}

function frontmatterBounds(content: string): { start: number; end: number } | null {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) return null;
  const match = /\r?\n---(?:\r?\n|$)/g;
  match.lastIndex = content.indexOf("\n") + 1;
  const closing = match.exec(content);
  if (!closing) return null;
  return { start: content.indexOf("\n") + 1, end: closing.index };
}

/** Merge/remove top-level keys while preserving every unrelated frontmatter byte. */
export function patchFrontmatter(
  content: string,
  changes: Record<string, unknown>,
  removeKeys: readonly string[] = []
): string {
  const entries = Object.entries(changes);
  if (!entries.length && !removeKeys.length) return content;

  const bounds = frontmatterBounds(content);
  if (!bounds) {
    if (!entries.length) return content;
    const lines = entries.map(([key, value]) => `${yamlKey(key)}: ${yamlValue(value)}`).join("\n");
    return `---\n${lines}\n---\n${content}`;
  }

  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  let block = content.slice(bounds.start, bounds.end);
  for (const key of removeKeys) {
    block = replaceKeyBlock(block, key, null, newline);
  }
  for (const [key, value] of entries) {
    const line = `${yamlKey(key)}: ${yamlValue(value)}`;
    block = replaceKeyBlock(block, key, line, newline);
  }
  return content.slice(0, bounds.start) + block + content.slice(bounds.end);
}

/** Top-level keys present in the note's frontmatter (empty set when none). */
export function frontmatterTopKeys(content: string): Set<string> {
  const bounds = frontmatterBounds(content);
  if (!bounds) return new Set();
  const keys = new Set<string>();
  for (const line of content.slice(bounds.start, bounds.end).split(/\r?\n/)) {
    const key = topLevelKey(line);
    if (key !== null) keys.add(key);
  }
  return keys;
}

function stripQuotes(s: string): string {
  const t = s.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))
    ? t.slice(1, -1)
    : t;
}

function normalizeTag(s: string): string {
  return stripQuotes(s).replace(/^#/, "");
}

function parseTags(lines: string[]): string[] {
  const head = lines[0] ?? "";
  const value = head.slice(head.indexOf(":") + 1).trim();
  if (value.startsWith("[")) {
    const inner = value.replace(/^\[|\]$/g, "").trim();
    return inner ? inner.split(",").map(normalizeTag).filter(Boolean) : [];
  }
  if (value) return [normalizeTag(value)];
  return lines
    .slice(1)
    .filter((l) => /^\s*-\s*/.test(l))
    .map((l) => normalizeTag(l.replace(/^\s*-\s*/, "")))
    .filter(Boolean);
}

/**
 * Add `tag` (no leading `#`) to the note's frontmatter `tags`, rewriting only
 * the tags block in list style. Returns the new content, or null when the tag
 * is already present (no write needed).
 */
export function addTagToFrontmatter(content: string, tag: string): string | null {
  const clean = tag.replace(/^#/, "").trim();
  if (!clean) return null;

  const bounds = frontmatterBounds(content);
  if (!bounds) {
    return `---\ntags:\n  - ${clean}\n---\n${content}`;
  }

  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.slice(bounds.start, bounds.end).split(/\r?\n/);
  const start = lines.findIndex((l) => topLevelKey(l) === "tags");

  if (start < 0) {
    const appended = [...lines, "tags:", `  - ${clean}`].join(newline);
    return content.slice(0, bounds.start) + appended + content.slice(bounds.end);
  }

  // Continuation lines of the tags block: list items or indented content only —
  // blank lines and comments end the block so they survive the splice.
  let end = start + 1;
  while (end < lines.length) {
    const l = lines[end];
    if (l === undefined || !(/^\s*-\s/.test(l) || /^\s+\S/.test(l))) break;
    end++;
  }
  const existing = parseTags(lines.slice(start, end));
  if (existing.includes(clean)) return null;

  const rebuilt = ["tags:", ...[...existing, clean].map((t) => `  - ${t}`)];
  lines.splice(start, end - start, ...rebuilt);
  return content.slice(0, bounds.start) + lines.join(newline) + content.slice(bounds.end);
}

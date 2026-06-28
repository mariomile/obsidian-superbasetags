import { parseYaml, type App } from "obsidian";
import type { FieldType, SupertagField } from "./types";

/** Raw result of parsing one `.base` file. */
export interface ScannedBase {
  path: string;
  name: string;
  /** The supertag tag (e.g. "type/person"), or null if not a supertag. */
  tag: string | null;
  /** Default fields derived from the base's displayed note properties. */
  fields: SupertagField[];
}

// --- filter walking ---------------------------------------------------------

/** Collect every leaf filter string from the recursive and/or/not structure. */
function collectFilterStrings(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === "string") {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) collectFilterStrings(n, out);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const k of ["and", "or", "not"]) {
      if (k in obj) collectFilterStrings(obj[k], out);
    }
  }
}

const HAS_TAG_RE = /hasTag\(\s*["']([^"']+)["']\s*\)/g;

/** Find the first `hasTag("<prefix>...")` tag referenced in the base filters. */
export function extractTag(filters: unknown, prefix: string): string | null {
  const strings: string[] = [];
  collectFilterStrings(filters, strings);
  const tags: string[] = [];
  for (const s of strings) {
    HAS_TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HAS_TAG_RE.exec(s)) !== null) tags.push(m[1]);
  }
  return tags.find((t) => t.startsWith(prefix)) ?? null;
}

// --- field extraction -------------------------------------------------------

/** Best-effort field type from the property key name. */
function guessType(key: string): FieldType {
  const k = key.toLowerCase();
  if (/(^|_)(date|at|on)$/.test(k) || k.includes("date") || k.endsWith("_at")) return "date";
  if (k.startsWith("is_") || k.startsWith("has_") || k === "done" || k === "completed") return "checkbox";
  if (k.includes("count") || k.includes("priority") || k.includes("pages") || k.includes("amount")) return "number";
  if (k === "aliases" || k === "authors" || k.endsWith("_list")) return "list";
  return "text";
}

const SKIP_KEYS = new Set(["tags", "up", "related"]);

/**
 * Derive the supertag's default fields: the note (frontmatter) properties the
 * base chooses to display. Excludes `file.*`, `formula.*` and structural keys.
 */
export function extractFields(base: Record<string, unknown>): SupertagField[] {
  const keys = new Set<string>();

  const props = base.properties as Record<string, { displayName?: string }> | undefined;
  if (props && typeof props === "object") {
    for (const k of Object.keys(props)) keys.add(k);
  }

  const views = base.views as Array<{ order?: string[] }> | undefined;
  if (Array.isArray(views)) {
    for (const v of views) {
      if (Array.isArray(v.order)) for (const o of v.order) keys.add(o);
    }
  }

  const fields: SupertagField[] = [];
  for (const k of keys) {
    if (k.startsWith("file.") || k.startsWith("formula.")) continue;
    if (SKIP_KEYS.has(k)) continue;
    const label = props?.[k]?.displayName ?? k;
    fields.push({ key: k, label, type: guessType(k) });
  }
  return fields;
}

// --- scanning ---------------------------------------------------------------

export interface ScanOptions {
  prefix: string;
  scopeFolders: string[];
}

function inScope(path: string, scopeFolders: string[]): boolean {
  if (scopeFolders.length === 0) return true;
  return scopeFolders.some((f) => path === f || path.startsWith(f.replace(/\/$/, "") + "/"));
}

/** Scan all in-scope `.base` files and parse them into ScannedBase records. */
export async function scanBases(app: App, opts: ScanOptions): Promise<ScannedBase[]> {
  const files = app.vault
    .getFiles()
    .filter((f) => f.extension === "base" && inScope(f.path, opts.scopeFolders));

  const out: ScannedBase[] = [];
  for (const f of files) {
    try {
      const raw = await app.vault.cachedRead(f);
      const data = (parseYaml(raw) ?? {}) as Record<string, unknown>;
      const tag = extractTag(data.filters, opts.prefix);
      out.push({ path: f.path, name: f.basename, tag, fields: extractFields(data) });
    } catch (e) {
      console.error(`[supertags] failed to parse ${f.path}`, e);
      out.push({ path: f.path, name: f.basename, tag: null, fields: [] });
    }
  }
  return out;
}

import { type App, type TFile } from "obsidian";
import type { Supertag, SupertagField } from "./types";

/** Pick the empty/default value to write for a scaffolded field. */
export function defaultFor(f: SupertagField): unknown {
  if (f.default !== undefined && f.default !== null && f.default !== "") {
    return f.default;
  }
  switch (f.type) {
    case "list":
      return [];
    case "checkbox":
      return false;
    case "number":
      return null;
    default:
      return "";
  }
}

export interface ApplyResult {
  tagAdded: boolean;
  fieldsAdded: string[];
}

/**
 * Apply a supertag to a note: add its `type/X` tag to frontmatter `tags`, and
 * (optionally) scaffold its default fields as empty frontmatter keys. Uses
 * processFrontMatter so YAML formatting and conventions are preserved.
 */
export async function applySupertag(
  app: App,
  file: TFile,
  st: Supertag,
  scaffold: boolean
): Promise<ApplyResult> {
  const result: ApplyResult = { tagAdded: false, fieldsAdded: [] };

  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    // --- tags ---
    let tags = fm.tags;
    if (tags == null) tags = [];
    if (typeof tags === "string") tags = [tags];
    if (!Array.isArray(tags)) tags = [];

    const existing = (tags as unknown[]).map((t) => String(t).replace(/^#/, ""));
    if (!existing.includes(st.tag)) {
      (tags as unknown[]).push(st.tag);
      result.tagAdded = true;
    }
    fm.tags = tags;

    // --- scaffold default fields ---
    if (scaffold) {
      for (const f of st.fields) {
        if (!(f.key in fm) || fm[f.key] === undefined) {
          fm[f.key] = defaultFor(f);
          result.fieldsAdded.push(f.key);
        }
      }
    }
  });

  return result;
}

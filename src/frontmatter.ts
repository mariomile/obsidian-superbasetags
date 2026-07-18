import { type App, type TFile } from "obsidian";
import type { Supertag, SupertagField } from "./types";
import { addTagToFrontmatter, frontmatterTopKeys, patchFrontmatter } from "./frontmatter-patch";

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
 * (optionally) scaffold its default fields as empty frontmatter keys. Raw-text
 * patch instead of processFrontMatter — the latter re-serializes the whole
 * block and mangles unquoted wikilinks (`company: [[Acme]]`).
 */
export async function applySupertag(
  app: App,
  file: TFile,
  st: Supertag,
  scaffold: boolean
): Promise<ApplyResult> {
  const result: ApplyResult = { tagAdded: false, fieldsAdded: [] };

  await app.vault.process(file, (content) => {
    let next = content;

    const tagged = addTagToFrontmatter(next, st.tag);
    if (tagged !== null) {
      next = tagged;
      result.tagAdded = true;
    }

    if (scaffold) {
      const present = frontmatterTopKeys(next);
      const changes: Record<string, unknown> = {};
      for (const f of st.fields) {
        if (!present.has(f.key)) {
          changes[f.key] = defaultFor(f);
          result.fieldsAdded.push(f.key);
        }
      }
      next = patchFrontmatter(next, changes);
    }

    return next;
  });

  return result;
}

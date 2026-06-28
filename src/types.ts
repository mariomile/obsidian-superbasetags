// Core domain types for the Supertags plugin.
//
// A "supertag" is the Tana-style object type. In this vault it maps to a
// `#type/X` tag whose collection view is a `.base` file that filters on it.

export type FieldType = "text" | "number" | "date" | "list" | "checkbox";

/** A default frontmatter field a supertag scaffolds onto a note when applied. */
export interface SupertagField {
  /** Frontmatter property key (e.g. "role", "company"). */
  key: string;
  /** Human label — the base's displayName, falling back to the key. */
  label: string;
  /** Field type, used to pick a sensible empty/default value on apply. */
  type: FieldType;
  /** Optional explicit default value written on apply (phase 2 editor). */
  default?: unknown;
}

/** A resolved supertag: a `#type/X` tag + its backing `.base` collection. */
export interface Supertag {
  /** Bare tag, no leading `#` (e.g. "type/person"). */
  tag: string;
  /** Display name (the `.base` file basename). */
  baseName: string;
  /** Vault-relative path to the `.base` file. */
  basePath: string;
  /** Default fields derived from the base (or overridden via the editor). */
  fields: SupertagField[];
  /** Emoji or lucide icon id. */
  icon: string;
  pinned: boolean;
  /** Optional grouping label (phase 2 grouped view). */
  group?: string;
  /** Live count of notes carrying this tag. */
  memberCount: number;
}

/** A `.base` that is NOT a supertag (no `type/*` filter) — a plain view. */
export interface BaseView {
  name: string;
  path: string;
}

/** Per-tag user overrides, persisted in the plugin sidecar (data.json). */
export interface SupertagOverride {
  icon?: string;
  pinned?: boolean;
  group?: string;
  /** Field schema overrides (types + default values). */
  fields?: SupertagField[];
}

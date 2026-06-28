# Supertags — Design

**Date:** 2026-06-29
**Status:** Implemented (v0.1.0, phase 1 + 2)

## Problem

Obsidian Bases creates database views via `.base` files, but those files live
scattered in folders. There is no first-class place to see all your collections,
and no way to *type* a note into a collection the way Tana supertags or Thymer
collections do. In this vault there are 27+ active bases in `_system/views/`,
every one filtered by a `#type/*` tag — a supertag taxonomy that exists but isn't
surfaced as one.

## Key insight

The vault already has the supertag system; it's just not exposed.

| Tana | This vault |
| --- | --- |
| supertag | tag `#type/X` |
| object type / collection | the `.base` filtering `file.hasTag("type/X")` |
| supertag default fields | the note `properties` the base displays |
| apply supertag to a node | add `#type/X` → the note enters the base |

So the plugin needs **no new data model**: it orchestrates primitives that
already exist (tags + Bases). It works on all existing bases with zero
reconfiguration.

## Architecture

Tag-driven with a light sidecar. The `.base` files remain the single source of
truth; the plugin's `data.json` stores only deltas (icon, pin, group, field
schema overrides).

- **base-scanner** — find in-scope `.base` files, parse YAML (`parseYaml`),
  extract the `type/X` tag from filters and the displayed note-properties as
  default fields.
- **registry** — resolve scanned bases into `Supertag` records, count members
  via `getAllTags` over the metadata cache, merge sidecar overrides. Full
  `rebuild()` on base change; cheap `recount()` on note metadata change.
- **sidebar-view** (`ItemView`) — flat list (icon · name · count), filter box,
  click opens the collection, context menu for apply/pin/icon/group/fields.
  Optional grouped view and Views section.
- **apply-modal** — fuzzy picker to type the active note.
- **frontmatter** — add the tag + scaffold default fields via
  `fileManager.processFrontMatter` (preserves YAML conventions).
- **create-modal** — wizard: name → `type/<slug>` + a starter `.base`.
- **field-editor-modal** — per-supertag field type/default overrides.
- **inline-suggest** (`EditorSuggest`) — opt-in `++` trigger to type a note from
  the editor.

## Scope

**Phase 1:** sidebar hub, counts, click-to-open, apply-with-scaffolding,
sidecar icon/pin, settings.

**Phase 2:** typed fields + default-value editor, grouped view, Views section,
inline `++` autocomplete, create-supertag wizard.

## Decisions

- **Membership = Obsidian tags**, not a parallel store. Bases does the filtering.
- **Supertag identity = first `type/*` tag in the base filters** (auto-detected;
  prefix configurable). First base wins if two bases share a tag.
- **Counts** use the `type/X` tag membership only (cheap, live), not the base's
  full filter — good enough for an at-a-glance hub.
- **Scaffolding is a default-on toggle** — it's the core Tana-style value.

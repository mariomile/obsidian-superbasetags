# Supertags

Tana-style **supertags for Obsidian**, built on the primitives you already have:
`#type/*` tags and [Bases](https://help.obsidian.md/bases). No new data model —
the plugin turns your existing collections into first-class object types.

```
SUPERTAGS            ⚙  +
────────────────────────
🔍 filtra…

📍 Concept           42
👤 Person            18
📄 Content            7
💡 Decision          23
🏢 Company           11
📚 Reference         56
🎯 Goal               9
```

## What it does

- **Sidebar hub** — every `.base` that filters a `type/*` tag shows up as a
  supertag: icon · name · live member count. Click to open its collection.
- **Type a note in one click** — "Apply supertag to current note" adds the
  `#type/X` tag *and* scaffolds the collection's fields as empty frontmatter
  (Tana-style). Toggle scaffolding off if you just want the tag.
- **Pin, icon, group** — light per-supertag customisation, stored in the
  plugin's `data.json`. Your `.base` files stay the source of truth.
- **Create supertags** — name it, get `type/<slug>` plus a starter `.base`.
- **Inline picker** (opt-in) — type `++` in the editor to fuzzy-pick and apply.

## How it maps

| Tana | Obsidian (this plugin) |
| --- | --- |
| supertag | tag `#type/X` |
| object type / collection | the `.base` filtering `file.hasTag("type/X")` |
| default fields | the note properties the base displays |
| apply supertag | add `#type/X` → note enters the base |

## Setup

The supertag namespace is **configurable** (default `type/`) and the plugin
scans the folders you set in settings (default `_system/views`). Set scope to
empty to scan the whole vault.

## Develop

```bash
npm install
npm run dev      # watch + deploy into the vault (see .obsidian-plugin-dir)
npm run build    # typecheck + production bundle
```

Create a `.obsidian-plugin-dir` file containing the absolute path to your
vault's plugin folder to auto-deploy on build. Source lives in `src/`; design
notes in `docs/`.

## License

MIT © Mario Miletta

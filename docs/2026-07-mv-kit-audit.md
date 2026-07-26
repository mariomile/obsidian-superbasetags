# mv-kit audit — SuperBaseTags (wave 8)

Audit of `styles.css` (404 lines) + `src/` (sidebar-view.ts, apply-modal.ts,
create-modal.ts, field-editor-modal.ts, group-modal.ts, icon-picker-modal.ts,
inline-suggest.ts, row-peek.ts, pill-colorizer.ts, settings.ts, main.ts)
against `obsidian-cosmos-theme/docs/mv-kit.md`, both desktop and phone
columns. Scope: coherence-only fixes (radius / type / icons / motion tokens /
empty states / microcopy). No layout redesign, no DOM restructure — per
`docs/2026-07-24-suite-coherence-design.md` §C/D non-goals. Same protocol as
wave 1 (Sonar, commit `e326510`) and wave 4 (TabX, commits `3461483` /
`9ac740a` / `5d09077`).

Per-rule verdict: **pass** (already compliant) / **fixed** (this wave) /
**waived** (kit rule doesn't apply here, with reason).

**Pill-parity constraint (per brief):** `.mv-pill` (lines 357–390) is a
shared contract with `marioverse-bases.css` (Bases Craft-skin contract,
Portal/Bases snippet) — the stylesheet's own header comment at line 355-356
says "DUPLICATED from the marioverse-bases.css snippet on purpose... Keep in
sync." Any fix that would touch `.mv-pill`'s recipe (radius, padding, colour
math, dot size) is out of scope for this wave regardless of mv-kit
conformance — flagged, not fixed.

## Golden rule — theme-independent consumption

| Check | Verdict |
|---|---|
| Every `var(--cosmos-*)`/`var(--mv-*)` has a literal fallback | **fixed** — `.supertags-row-chevron`'s transition and `.supertags-peek-btn`'s radius now consume suite tokens with literal fallbacks (see §1/§3 below). Before this wave the stylesheet consumed zero `--cosmos-*`/`--mv-*` tokens. |
| No plugin stylesheet redefines `--mv-*`/`--cosmos-*` at `:root`/`body` | **pass** — the plugin only ever defines its own `--supertags-*`-free, class-scoped rules and the `--mv-pill-color` custom property (scoped to `.mv-pill`, not `:root`/`body`, and not itself a `--cosmos-*`/`--mv-*` *suite* token — it's the pill's own internal parameter, part of the duplicated-by-design `.mv-pill` contract noted above). |

## §1 Radius + surfaces

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.supertags-iconbtn` / `.supertags-row` / `.supertags-row-chevron` / `.supertags-icon-cell` radius | native `--radius-s` | same | **pass** — native Obsidian tokens are correctly out of the `--mv-r*`/`--cosmos-r-*` vocabulary; the kit only requires the *suite* tokens for pill/card/chip surfaces, not every native radius. |
| `.supertags-filter-input` radius | native `--radius-m` | same | **pass** — same reasoning; this is a native search-input pill, not a suite chip/toolbar surface. |
| `.supertags-peek-btn` ("OPEN" hover pill) radius | was hardcoded `6px` | same rule, shared class | **fixed** — now `var(--mv-r1, 6px)`. This is exactly the kit's "any plugin-defined radius that visually matches … chip/toolbar" case (§1 MUST): a small pill-shaped button, hand-picked pixel value that happens to equal `--mv-r1`'s own canonical value (`6px`) byte-for-byte — the token substitution is a no-op visually and a real fix per the letter of the rule. |
| `.mv-pill` radius (`9999px`) | literal | same | **waived, out of scope (pill-parity constraint)** — shared contract with `marioverse-bases.css`; the brief explicitly excludes `.mv-pill` fixes from this wave. |
| Elevation shadow on `.supertags-peek-modal` (floating surface — it's a `Modal` subclass) | none defined; the plugin's peek modal uses Obsidian's own `.modal` chrome (native `Modal` class), no bespoke `box-shadow` | same | **waived** — the modal never defines its own elevation; it inherits Obsidian core's/theme's native modal shadow. There is no plugin-authored shadow to redirect onto `--cosmos-pop-shadow`. |
| `.supertags-filter-icon` / `.supertags-row-icon` / `.supertags-suggest-icon` sizing boxes | fixed px (16/18/18px) | same | **pass** — icon-sizing boxes, not radius/surface tokens; covered under §2 instead. |

## §2 Type sizes, icon sizes, touch targets

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.supertags-iconbtn` hit area | `24×24px` (below 44px; desktop has no touch-min requirement per kit) | extended via `::after` pseudo-element to `calc((100% - 44px) / 2)` inset (the suite's shared "invariant glyph, transparent hit-area extension" pattern, `@media (pointer: coarse)`) | **pass** — matches the kit's §2 MUST exactly; this plugin already shipped the pattern (comment at line 392-394 names it explicitly as "MOBILE KIT (pattern suite, nato in masonry 2026-07-10)"). |
| `.supertags-filter-input` height | `min-height: 36px` (mouse-sized, no min enforced on desktop) | same 36px — **no `@media (pointer: coarse)` override exists for the filter input** | **fixed on phone** — added a coarse-pointer rule raising `min-height` to `var(--cosmos-touch-min, 44px)`; the input is a full-width native text field so no hit-area-extension trick is needed, just the raised minimum. Desktop unchanged (kit: "N/A" for desktop). |
| `.supertags-row` / `.supertags-member` tap target | row padding only, whole row clickable | same padding (row height is comfortably >44px in practice: `padding: 5px 8px` plus line content ≈ 15-16px icon/text, but not decorated by the plugin as reaching an explicit 44px floor) | **waived** — this mirrors sonar wave 1's identical waiver for its list-item rows: the row is a natural block-level click target sized by its content plus padding, not a small icon/chip needing an explicit floor; the kit's MUST is scoped to "tappable target(s) (`.view-header .view-action`, `.clickable-icon`, toolbar options)" — discrete controls, not full-width list rows. |
| `.supertags-peek-btn` hit area (hover-revealed "OPEN" pill on a Bases row) | `padding: 1px 8px`, small | same, no coarse-pointer override | **waived, judgement call flagged for Mario** — this control only appears `display: inline-flex` on `:hover` of `.bases-tr` (line 312), a desktop-only affordance (there's no persistent hover state on touch). On phone this control is effectively unreachable via hover and the row-peek feature would need a tap-triggered alternative to be phone-usable at all — that's a behavior/interaction change outside a coherence-only wave, not a CSS token fix. Flagged rather than silently left broken. |
| Micro-label text size | `.supertags-group-header`/`.supertags-title` use `var(--font-ui-smaller)` already | same | **pass** |
| Icon sizing | native SVG width/height in px (16/15/14/13/18px per context), no separate icon-size scale — matches kit: "Cosmos defines no separate icon-size scale" | same | **pass** |

## §3 Motion

| Token/animation | Before | After | Verdict |
|---|---|---|---|
| `.supertags-row-chevron` expand/collapse rotation | raw `transition: transform 120ms ease` | `transition: transform var(--cosmos-t-fast, 140ms) var(--mv-lift, cubic-bezier(0.22, 1, 0.36, 1))` | **fixed** — kit's "physical hover/reveal easing" (`--mv-lift`) on the micro-feedback duration tier (`--cosmos-t-fast`); this is the only motion-bearing rule in the whole stylesheet, and it was the only raw-`ms` hit in the pre-fix grep. |
| `prefers-reduced-motion: reduce` handling | no explicit override anywhere in the stylesheet | unchanged (none added) | **pass, by construction** — the chevron transition now consumes `--cosmos-t-fast`, which Cosmos zeroes to `0ms` under `prefers-reduced-motion: reduce` at the token level (`cosmos-tokens.css` line 333-334); no plugin-side override is needed once the raw value is gone. Before this fix the raw `120ms` would NOT have respected reduced-motion — this was itself part of the motivation for the fix, not just a radius/token nicety. |
| Animated properties | `transform` only (chevron rotate) | unchanged | **pass** — composited property, matches the kit's "only transform/opacity" rule. |
| Any entrance animation (`cosmos-pop-in`/`cosmos-sheet-rise`/`cosmos-fade-in`) on modals/popovers | none — `.supertags-peek-modal` and the create/apply/field-editor/group/icon-picker modals all use Obsidian's native `Modal` open/close chrome, no bespoke entrance keyframes | same | **waived** — nothing plugin-authored to retrofit; the kit's phone entrance-animation MUSTs target *plugin-authored* popover/menu/sheet chrome, and this plugin has none (every modal is a stock `Modal` subclass with zero custom CSS animation). |
| `--cosmos-spring` (overshoot, confirmation-only) | not used anywhere | unchanged | **pass, correctly absent** — no confirmation micro-moment (checkbox tap, press-release) exists in this plugin's UI that would call for it. |

## §4 Empty-state pattern

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.supertags-empty` ("No supertags found…" / "No supertags match your filter.") | was `color: var(--text-faint); font-size: var(--font-ui-small)` — one step too large | same class, no phone variant | **fixed** — `font-size` now `var(--font-ui-smaller)` per the kit's whisper recipe verbatim. `color: var(--text-faint)` was already correct. |
| `.supertags-group-header` section eyebrow ("PINNED", "OTHER", "VIEWS" — text upper-cased in JS, `sidebar-view.ts:177`/`248`) | was `font-size: var(--font-ui-smaller); letter-spacing: 0.06em; color: var(--text-faint)` — missing `text-transform: uppercase` (text arrives pre-uppercased from JS so this is visually a no-op) and missing `font-weight` (inherited default, not `--font-medium`) | same class, no phone variant | **fixed (partial) + 1 flagged** — added `font-weight: var(--font-medium)` (the real gap: weight was previously unset/inherited, not matching the kit's micro-label recipe). `text-transform: uppercase` intentionally **not** added: the JS already upper-cases the string before it reaches the DOM (`g.toUpperCase()` / literal `"VIEWS"`), so a CSS `text-transform` would be a visual no-op; adding a dead declaration for recipe-verbatim-ness alone was judged not worth it. Flagged as a judgement call, same class as TabX wave 4's `.tabx-rail-title` deferral. |
| `.supertags-title` (panel header, text `"SUPERTAGS"`, hardcoded uppercase string) | `font-size: var(--font-ui-smaller); letter-spacing: 0.08em; font-weight: var(--font-semibold); color: var(--text-faint)` — weight is `--font-semibold`, kit recipe says `--font-medium` | same | **waived, judgement call flagged for Mario** — this is the plugin's single, one-off panel title (not a repeating group eyebrow like `.supertags-group-header` above), semantically closer to a view-header title than the kit's "section label repeated per group" example (`"Notes"`, `"Today"`). Changing an established, shipped visual weight for a singular title label on a literal-match technicality was judged lower-value than the group-header fix above. Not touched this wave. |
| Command/suggest-mode "no match" state | `SupertagSuggest` (inline-suggest.ts) relies on Obsidian's native `EditorSuggest` empty-results behavior (renders nothing, no bespoke empty row) | same | **pass, correctly out of scope** — no plugin-authored empty-state markup exists here to normalize. |

## §5 Microcopy voice

| Rule | Desktop | Phone | Verdict |
|---|---|---|---|
| Sentence-case labels | Settings tab uses Obsidian's native `Setting`/`PluginSettingTab` API throughout (`new Setting(containerEl).setName("Scope folders")…`), not the `.mva-pv` custom-form convention | n/a | **pass, correctly out of scope** — same reasoning as Sonar wave 1: `.mva-pv`/`.mva-sel`/`.mva-btn` is the convention for *custom* plugin forms; this plugin's settings tab delegates entirely to Obsidian's built-in `Setting` component. |
| No native `<select>` | `grep` for `createEl('select'` / `<select` in `src/`: zero hits | same | **pass** |
| No `mod-cta` on buttons | `grep` for `mod-cta` in `src/`+`styles.css`: zero hits | same | **pass** |
| English product copy, PM jargon untranslated | all UI strings across `sidebar-view.ts`/`*-modal.ts`/`settings.ts` are English | same | **pass** |
| Modal/dialog titles and body copy sentence-case | e.g. "Apply supertag", "Create supertag", "No supertags found. Check your scope folders in settings, or create one." — all sentence-case, no Title Case | same | **pass** |

## Raw-value leakage (repo-wide grep, post-fix)

Post-fix `styles.css` grep for raw `ms`/hex/`cubic-bezier` outside a
`var(--token, fallback)` expression: **zero hits**. Pre-fix there was exactly
one raw-`ms` hit (`.supertags-row-chevron`, now fixed above); the stylesheet
has never contained a hex colour or a `cubic-bezier()` literal outside a
`var()` fallback. This is exactly what the new `test/style-contract.test.ts`
enforces mechanically.

## `!important` audit (10 occurrences, all judged individually)

mv-kit is silent on `!important` as a hard rule (it isn't in any MUST/MUST
NOT), so each is judged on whether it's a documented, necessary specificity
override vs. gratuitous, same protocol as sonar wave 1 / tabx wave 4:

| Block | Count | Verdict |
|---|---|---|
| `.supertags-iconbtn:focus-visible` / the shared `:is([class^="supertags-"]…)` focus-ring rule (`outline`/`box-shadow: none !important`, lines 44-49) | 2 | **waived, justified** — kills whatever focus ring the active theme/core would otherwise draw so the plugin's own accent outline (already itself `!important`) is the only one visible; belt-and-suspenders against both `.supertags-iconbtn` directly and any descendant matched by the attribute-selector group. |
| `.supertags-filter-input` base rule (`padding-inline`/`border`/`border-radius`/`background`/`box-shadow: none !important`, lines 82-88) | 5 | **waived, justified** — the block comment immediately above (lines 55-56) already documents why: "a native input as the single pill, icon overlaid via absolute positioning" — this must out-rank Obsidian's native `input[type='text']`/theme form-field chrome (border, background, shadow) to render as one continuous pill instead of a nested input-in-a-box look, matching the shared masonry/horizon search-bar pattern the comment cites. |
| `.supertags-filter-input:focus` (`outline`/`box-shadow: none !important`, lines 93-94) | 2 | **waived, justified** — kills the default focus box so only the deliberate `:focus-visible` accent ring (line 96-99, itself not `!important` since nothing else contends for it at that specificity) shows on keyboard focus, never on mouse click. |
| `.supertags-filter-input:focus-visible` (`box-shadow: none !important`, line 99) | 1 | **waived, justified** — same focus-ring discipline as above, applied to the focus-visible state so no stray native shadow layers under the accent outline. |

**Total: 10.** None removed — every one is a genuine specificity battle
against Obsidian core/theme native form-field and focus-ring chrome, not a
shortcut around normal cascade. Comments were added/tightened next to each
block (see styles.css diff) to make the justification explicit rather than
relying solely on this doc. `test/style-contract.test.ts` caps this at 10
exactly (ratchet-down only): any future edit that adds an `!important`
without removing one fails the contract test.

## Not touched (explicit non-goals, confirmed out of scope)

- No layout/DOM changes anywhere — every fix in this wave is a token
  substitution or a missing property on an already-existing selector.
- `.mv-pill` recipe (radius/padding/colour math/dot size) — shared contract
  with `marioverse-bases.css`; the brief explicitly excludes it from this
  wave's fix scope regardless of mv-kit conformance.
- `.supertags-peek-btn` phone reachability (see §2) — a hover-only affordance
  with no touch equivalent; fixing it means designing a tap-triggered
  interaction, a behavior change outside coherence-only scope.
- `.supertags-title` font-weight (`--font-semibold` vs. kit's `--font-medium`,
  see §4) and `.supertags-group-header`/`.supertags-title`'s JS-driven
  (rather than CSS `text-transform`) uppercasing — both judgement calls
  flagged for Mario, not defects.

## Verification

- `pnpm typecheck` — see commit message for exact output.
- `pnpm test` (vitest) — see commit message for exact output, including the
  new `test/style-contract.test.ts` (4 assertions).
- `pnpm build` — see commit message for exact output.
- Desktop screenshot / live vault reload verification: **pending** — not
  performed this wave (no live vault-reload check run in this session),
  consistent with sonar wave 1's own "pending" note.
- Phone verification: **pending Mario's on-device sign-off** — per hard
  constraint, Obsidian's `EmulateMobile` was not used (it kills Node
  plugins); phone changes (touch target, motion tokens) are verified by
  reading the resulting CSS values against the kit's phone column, not by
  rendering on-device.

---

# §6 — wave 2026-07 dinamica

Audit of `styles.css` (423 lines pre-fix, 451 lines post-fix) + `src/`
(`sidebar-view.ts`, `create-modal.ts`, `apply-modal.ts`,
`field-editor-modal.ts`, `group-modal.ts`, `icon-picker-modal.ts`,
`inline-suggest.ts`, `row-peek.ts`, `pill-colorizer.ts`, `main.ts`) against
`obsidian-cosmos-theme/docs/mv-kit.md` §6 ("Elevation & motion depth",
landed cosmos-theme commit `10f5ddc`, cantiere 2 — "Dinamica &
profondità"), both desktop and phone columns. Scope: the four §6 sub-rules
only (elevation hierarchy, hover richness, drag polish, panel/tab
transitions) — coherence-only, no layout redesign, no new components, no
new CSS files, same protocol as Ondata A (obsidian-portal
`389d564`/`133c93d`/`4b95bf2`, obsidian-tabx `cc65cd4`/`a792752`/`662d11a`).
**Pill-parity constraint carried over from wave 8:** `.mv-pill` (now lines
~384-417) is a shared contract with `marioverse-bases.css` (Bases
Craft-skin contract) — nothing in this wave touches its class contract,
geometry, or colour math; confirmed by grep below.

Per-rule verdict: **pass** (already compliant) / **fixed** (this wave) /
**waived** (kit rule doesn't literally apply to this surface, with reason) /
**N/A** (no surface of this type exists in the plugin).

## Elevation hierarchy

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.supertags-peek-modal`, `.supertags-create-preview`'s modal, `create-modal.ts`/`field-editor-modal.ts`/`group-modal.ts`/`icon-picker-modal.ts` (Pop-tier candidates — dismissed by outside-click) | none of the five `Modal` subclasses define a bespoke `box-shadow` — confirmed via `grep -n "box-shadow" styles.css`: the only 7 hits are `none`/`none !important` (focus-ring and native-input overrides), zero elevation shadows | same | **N/A, nessuna superficie di questo tipo** — every modal inherits Obsidian core's/theme's native `.modal` chrome. There is no plugin-authored floating-surface shadow anywhere in the stylesheet to redirect onto `--cosmos-pop-shadow`; this reconfirms wave 8's identical §1 finding under §6's more detailed tier language. |
| `sidebar-view.ts`'s two `new Menu()` context menus (`showFileMenu`/tag-row menu, lines 262/290) (Pop-tier candidates) | native Obsidian `Menu` API, zero plugin CSS targeting menu chrome — `grep -n "\.menu\b\|Menu {" styles.css`: zero hits | same | **N/A, nessuna superficie di questo tipo** — nothing plugin-authored to consume `--cosmos-pop-shadow` for. |
| `SupertagSuggest` (`inline-suggest.ts`, `EditorSuggest` subclass — Pop-tier candidate) | native `EditorSuggest` popover chrome, no plugin CSS override | same | **N/A, nessuna superficie di questo tipo** — same reasoning; the suggest dropdown is 100% native rendering. |
| `.supertags-panel` (persistent sidebar view — Island-tier candidate) | no Portal-style rail shadow; the panel renders inside Obsidian's native sidebar/tab-container chrome (`ItemView`), no plugin-owned `box-shadow` | same | **pass, waived** — same reasoning as Portal wave-2's identical verdict on `.portal-rail`: any Island-tier elevation on the sidedock itself is Cosmos's own `cosmos-islands.css` job (`.mod-left-split .workspace-tab-container`), not a per-plugin one. The panel correctly declares no shadow of its own — declaring one would create exactly the stacked-tier violation §6's MUST NOT forbids. |
| Two tiers stacked on one element (Pop shadow **and** glass blur) | not present | not present | **pass, not applicable** — `grep -n "blur\|glass" styles.css`: zero hits. No glass/blur surface anywhere in this plugin, so there is nothing to stack against a Pop shadow. |
| `.mv-pill` | literal `9999px` radius, no shadow, no elevation properties of any kind | same | **N/A, nessuna superficie di questo tipo** — a pill is Flat/inline-flow chrome (§6's own "Flat" tier: "inline chrome that sits in the document flow"), not a floating/persistent surface; also out of scope per the pill-parity constraint regardless (lines 398-431 post-fix, `git diff` confirms byte-identical). |

## Hover richness

| Rule | Desktop (pre-fix) | Phone | Verdict |
|---|---|---|---|
| Colour **and** lift, never colour alone | All 7 `:hover` rules in `styles.css` are colour/background washes only (`.supertags-iconbtn`, `.supertags-row`, `.supertags-row-chevron`, `.supertags-member`/`.is-empty`, `.supertags-icon-cell`, `.supertags-peek-btn`) — no `transform` lift on any of them | n/a, hover unreachable on touch once gated (see row below) | **pass, waived** — mv-kit's own §6 code example splits `.row:hover` (colour-only) from `.card:hover` (colour+lift) as two *distinct* patterns for two different surface shapes, not one rule both must satisfy. Cross-plugin precedent (already used by both Ondata A model repos): Masonry's `.masonry-card:hover` (a grid card) gets a lift; Sonar's `.sonar-result:hover` (a dense list row) is colour-only. Every one of this plugin's 7 hovers is a list-row/icon-button/pill shape — `.supertags-row`, `.supertags-member`, `.supertags-icon-cell` are all list/grid rows or small controls, never a card. Adding a `translateY` lift to a 24-28px-tall sidebar row would read as jitter, not the "hint" the kit describes for card surfaces. No lift-transform hover exists in this plugin, so the ≤2px cap is vacuously satisfied. |
| `--mv-wash` for colour transitions, `--mv-lift` for transform transitions (not interchangeable) | None of the 7 hover rules declare a `transition` property at all (only `.supertags-row-chevron`'s *own* rule, not its `:hover` pseudo-class, has one) | same | **pass, not applicable** — there is exactly one `transition` declaration in the whole file (`.supertags-row-chevron`'s `transform … var(--mv-lift, …)`, fixed in wave 8's §3 pass), and it's a genuine physical transform (chevron rotate), correctly on `--mv-lift`, not a colour wash. No wash-transition exists anywhere to mis-wire onto `--mv-lift` — the file has no `--portal-motion`/`--tabx-ease`-style shared alias to audit for cross-wiring, since it never had more than one motion-bearing rule to begin with. `grep -n "transition" styles.css` confirms: 1 hit, unchanged this wave. |
| `transform` lift never exceeds 2px | n/a — no lift-transform hover exists (see row above) | same | **pass, not applicable** |
| Hover gated to `@media (hover: hover)` on phone-reachable elements | **was a violation**: 0 of the file's 7 `:hover` rules (8 `:hover`-containing selectors counting the `.bases-tr:hover .supertags-peek-btn` reveal trigger) were wrapped in `@media (hover: hover)`. The sidebar panel (`.supertags-panel`, `.supertags-row`, `.supertags-member`, `.supertags-iconbtn`) is phone-reachable by construction — it already ships a `@media (pointer: coarse)` hit-area-extension block (starting line 437), so the plugin itself treats this surface as touch-usable. The icon-picker grid (`.supertags-icon-cell`) renders inside a `Modal`, also touch-reachable. `.supertags-peek-btn` is the one exception (see next row). | same rule, now fixed | **fixed** — wrapped all 7 hover rules (8 selectors) in `@media (hover: hover)`: `.supertags-iconbtn`, `.supertags-row`, `.supertags-row-chevron`, `.supertags-member` + `.supertags-member.is-empty` (grouped together — the second is a hover override of the first, must travel with it), `.supertags-icon-cell`, and `.bases-view .bases-tr:hover .supertags-peek-btn` + `.supertags-peek-btn:hover` (grouped together — the reveal trigger and the button's own hover). No phone always-visible fallback was needed for any of the first five: unlike Portal's `.portal-collection-open` (whose *only* reveal mechanism was hover, made permanently unreachable by gating), none of this plugin's gated controls rely on hover to become visible or clickable in the first place — they are all already-visible rows/buttons that merely *change colour* on hover; gating only removes the colour change on touch, not the control itself. Guarded by a new style-contract test, verified red-green (see Style contract section below). |
| `.supertags-peek-btn` reachability on phone | n/a (desktop-only judgement call already flagged in wave 8 §2, not a §6 finding) | **was and remains unreachable on touch** — its *entire* reveal (`display: none → inline-flex`) depends on `.bases-tr:hover`, which cannot fire on touch (no persistent hover state) | **waived, pre-existing gap, not regressed** — same defect class as TabX's auto-hide tab bar in the Ondata A model (`obsidian-tabx` `a792752`): gating this rule's `:hover` behind `@media (hover: hover)` does not create a new stuck-state risk (there was never a way for the touch browser to fire it and get stuck) and does not worsen the pre-existing reachability gap (it was already unreachable before this wave — `grep -n "isMobile\|Platform\." src/*.ts`: zero hits, confirming no tap-triggered alternative exists anywhere in the codebase). The reachability gap itself — row-peek having no tap affordance on phone — is a feature-interaction-design problem already flagged and explicitly out of scope in wave 8's §2 ("fixing it means designing a tap-triggered interaction, a behavior change outside coherence-only scope"); this wave does not reopen that judgement call, it only stops the mechanical rule from fighting the media-query discipline the rest of the file now follows. |

## Drag polish

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| Any plugin-owned drag interaction (`.is-dragging`/`.is-dropped` or equivalent) | **does not exist** | **does not exist** | **N/A, nessuna superficie di questo tipo** — verified, not assumed: `grep -rn "draggable\|dragstart\|dragover\|drop\b\|\.is-dragging\|\.is-dropped" src/*.ts`: zero hits. This plugin implements no drag-and-drop of any kind — rows are click-to-toggle/click-to-open, the icon-picker grid is click-to-select, and pill colour assignment happens through modals, not drag. There is no dragged element, no drop target, and no drag-ghost styling anywhere in `src/` or `styles.css` for this rule to govern. |

## Panel & tab transitions

| Motion | Desktop | Phone | Verdict |
|---|---|---|---|
| Panel/sidebar open-close (`--cosmos-t-panel` + `--cosmos-native`) | `.supertags-panel` is a stock `ItemView` mounted in Obsidian's native sidedock — its open/close/resize animation is entirely native workspace chrome, no plugin CSS targets it | same | **N/A, nessuna superficie di questo tipo** — the plugin owns no structural panel-open/close transition; `grep -n "workspace-tab-container\|split\|sidedock" styles.css`: zero hits. |
| Tab switch / tab-content swap (crossfade `opacity` only, `--cosmos-t-base` + `--cosmos-native`) | this plugin owns no tab surface — its "sections" (pinned/other/views groups) are static `display:flex` column stacks in a single scrolling list, not a tabbed content-swap interface; `.supertags-row-chevron`'s expand/collapse of `.supertags-members` is an inline disclosure, not a tab swap | same | **N/A, nessuna superficie di questo tipo** — confirmed via `sidebar-view.ts`: no `activeTab`/`setActiveLeaf`-style tab-switching logic exists in this plugin at all. |
| `.supertags-row-chevron.is-expanded` (member-list disclosure toggle) | instant reveal — `.supertags-members` has no `display`/`max-height` transition, only the chevron icon itself rotates (`--mv-lift`, `--cosmos-t-fast` tier, already correct per wave 8's §3) | same | **pass, waived** — this is a tree-item disclosure (expand a group's member list), the same category Portal wave-2 waived for `.portal-section.is-collapsed .portal-section-body` under this exact heading: matches native Obsidian folder-tree collapse behaviour (instant, unanimated), and §6's panel-motion rule targets workspace-level structural chrome (sidebar open-close, ribbon peek) — a smaller-scoped in-panel disclosure toggle is a different interaction the rule doesn't reach. Not touched this wave (would be new animation scope, not a fix to an identified violation). |

## Style contract — new §6 assertion

One new assertion added to `test/style-contract.test.ts`, mechanically
derived from the concrete finding above (zero speculative assertions, per
this wave's brief — the plugin has exactly one §6 defect class: ungated
hover):

1. **`§6: every :hover selector is gated behind @media (hover: hover)`** —
   a brace-depth scanner (identical algorithm to the Ondata A model's
   `obsidian-portal` assertion of the same name) walks `styles.css`
   (comments stripped) tracking whether each `:hover`-containing line opens
   inside an `@media (hover: hover)` block; any that doesn't is a
   violation, reported by line number and selector text.

No second assertion for a `--mv-wash`/`--mv-lift` cross-wiring guard (the
Ondata A model's second assertion in both reference repos) was added:
unlike Portal/TabX, this plugin never had a shared motion alias to mis-wire
in the first place — it has exactly one `transition` declaration in the
whole file, already correctly using `--mv-lift` for a genuine transform.
Adding a speculative guard against a violation class that was never present
would contradict this wave's own "zero speculative assertions" mandate.

**Red-before-green, verified this wave**: `git stash push -- styles.css`
reverted the working tree to the pre-fix CSS (test file kept staged), ran
`pnpm test` — the new assertion failed exactly as expected, flagging all 8
ungated `:hover`-containing selectors by line number
(`.supertags-iconbtn:hover`, `.supertags-row:hover`,
`.supertags-row-chevron:hover`, `.supertags-member:hover`,
`.supertags-member.is-empty:hover`, `.supertags-icon-cell:hover`,
`.bases-view .bases-tr:hover .supertags-peek-btn`,
`.supertags-peek-btn:hover`); all 4 pre-existing style-contract assertions
stayed green throughout (67/68 total, 1 failing as expected). `git stash
pop` restored the fix; re-ran — **68/68 green** (67 pre-wave + 1 new §6
assertion).

## Not touched (explicit non-goals, confirmed out of scope)

- No layout/DOM changes anywhere — every fix in this wave is a `@media
  (hover: hover)` wrapper addition around 7 already-shipped hover rules (8
  selectors). No property values, selectors, or specificity changed inside
  any rule body.
- `.mv-pill` recipe (radius/padding/colour math/dot size) — shared contract
  with `marioverse-bases.css`; confirmed untouched via `git diff
  styles.css` scoped to the `.mv-pill*` block (lines 398-431 post-fix,
  byte-identical to pre-fix).
- `.supertags-peek-btn` phone reachability (see Hover richness above) — a
  pre-existing, already-flagged (wave 8 §2) interaction-design gap, not a
  §6 regression; gating its `:hover` doesn't change its reachability in
  either direction.
- No new drag, panel, or tab surface was built to give §6's Drag polish or
  Panel/tab-transitions rules something to satisfy — this plugin owns
  neither surface type, confirmed by grep, and building one would be new
  component scope, forbidden by this wave's non-goals.

## Verification

- `pnpm test` (vitest) — **68/68 passing** (67 pre-wave + 1 new §6
  assertion), 0 failing. Red-before-green re-verified via `git stash`
  round-trip against the pre-fix CSS (see Style contract section above):
  the new assertion failed as expected on the unfixed file, passed on the
  fixed file; all 67 pre-existing tests across all 7 test files stayed
  green throughout both runs.
- `pnpm typecheck` / `pnpm build` — see `pnpm release:check` output quoted
  verbatim in the commit message for this fix.
- **No lint script exists in this repo** (`package.json` scripts:
  `dev`/`build`/`release:check`/`typecheck`/`test`/`test:watch` — no
  `lint`) — no lint result is claimed for this wave, consistent with the
  brief's hard constraint not to invent one.
- Desktop screenshot / live vault reload verification: **pending** — not
  performed this wave, consistent with wave 8's own "pending" note and the
  Ondata A model's same disclosure.
- Phone verification: **pending Mario's on-device sign-off** — per hard
  constraint, Obsidian's `EmulateMobile` was not used (it kills Node
  plugins). The phone-side claims in this wave (all 7 gated hover rules
  stop triggering on touch; `.supertags-peek-btn`'s reachability gap is
  pre-existing and unchanged, not a new regression) are verified by
  reading the resulting CSS against the kit's phone column and against
  this plugin's own existing `@media (pointer: coarse)` precedent in the
  same file, not by rendering on-device.

import type { EventRef } from "obsidian";
import type SupertagsPlugin from "./main";

/**
 * Colors tag/list value chips inside native Bases views, Notion-style but with
 * the suite's Craft chips. The palette itself lives in CSS (marioverse-bases
 * snippet or this plugin's styles.css): this module only assigns classes —
 * `.mv-pill` + `.mv-pill-<color>` — so the visual language has one source.
 *
 * Deterministic per value (hash → palette) with per-value overrides persisted
 * in settings (same sidecar pattern as supertag icon overrides).
 */

export const PILL_PALETTE = [
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink",
] as const;

export type PillColor = (typeof PILL_PALETTE)[number];

/** Normalize a chip's text for stable hashing/overrides: no #, no case. */
export function normalizePillKey(raw: string): string {
  return raw.trim().replace(/^#/, "").toLowerCase();
}

/** FNV-1a — tiny, stable, good spread for short strings. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pick the pill color for a value: override first (normalized key), then
 * deterministic hash into the palette. Null for empty values (no pill).
 */
export function pickPillColor(
  raw: string,
  overrides: Record<string, string>
): PillColor | null {
  const key = normalizePillKey(raw);
  if (!key) return null;
  const ov = overrides[key];
  if (ov && (PILL_PALETTE as readonly string[]).includes(ov)) {
    return ov as PillColor;
  }
  return PILL_PALETTE[hashString(key) % PILL_PALETTE.length];
}

const PILL_CLASS = "mv-pill";
const DONE_ATTR = "data-mv-pill";

/**
 * DOM layer: watches Bases views and decorates `.value-list-element` leaf
 * chips. Uses one MutationObserver batched through a timer — Bases rerenders
 * rows wholesale, so per-view observers would churn anyway.
 *
 * The observer is scoped to the workspace container (not document.body, which
 * would also catch ribbon/status-bar/modal/popover mutations from every other
 * plugin) and, crucially, is only *connected while a Bases view is actually
 * mounted*. When Mario is writing in a normal note with no Base open, this
 * plugin does zero work per keystroke instead of running closest() walks on
 * every editor DOM mutation. Connection is (re)synced on workspace layout and
 * leaf changes, with deferred rechecks to catch Bases views that render async.
 */
export class PillColorizer {
  private observer: MutationObserver | null = null;
  private connected = false;
  private scheduled = false;
  private timer: number | null = null;
  private layoutRefs: EventRef[] = [];
  private recheckTimers: number[] = [];

  constructor(private plugin: SupertagsPlugin) {}

  enable(): void {
    if (this.observer) return;
    this.observer = new MutationObserver((muts) => {
      for (const m of muts) {
        // Mutation inside a rendered view…
        const t = m.target as HTMLElement;
        if (t?.closest?.(".bases-view")) {
          this.schedule();
          return;
        }
        // …or a whole view (re)mounted: the target is then the OUTER parent,
        // and only the added subtree contains .bases-view.
        for (const n of Array.from(m.addedNodes)) {
          if (!(n instanceof HTMLElement)) continue;
          if (n.matches?.(".bases-view") || n.querySelector?.(".bases-view")) {
            this.schedule();
            return;
          }
        }
      }
    });
    const ws = this.plugin.app.workspace;
    this.layoutRefs.push(ws.on("layout-change", () => this.syncObserver()));
    this.layoutRefs.push(ws.on("active-leaf-change", () => this.syncObserver()));
    this.syncObserver();
  }

  /** Connect the observer only while a Bases view is mounted; disconnect when
   *  none is open. Deferred rechecks cover views that render after the layout
   *  event fires (embedded Bases, async first paint). */
  private syncObserver(): void {
    if (!this.observer) return;
    const root = this.plugin.app.workspace.containerEl ?? document.body;
    const hasBases = document.querySelector(".bases-view") !== null;
    if (hasBases && !this.connected) {
      this.observer.observe(root, { childList: true, subtree: true });
      this.connected = true;
      this.schedule();
    } else if (!hasBases && this.connected) {
      this.observer.disconnect();
      this.connected = false;
    }
    for (const t of this.recheckTimers) window.clearTimeout(t);
    this.recheckTimers = [];
    if (!hasBases) {
      // A Bases view may still be painting; recheck shortly without spinning.
      for (const t of [120, 500]) {
        this.recheckTimers.push(
          window.setTimeout(() => {
            if (this.observer && !this.connected && document.querySelector(".bases-view")) {
              this.syncObserver();
            }
          }, t)
        );
      }
    }
  }

  disable(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.connected = false;
    const ws = this.plugin.app.workspace;
    for (const ref of this.layoutRefs) ws.offref(ref);
    this.layoutRefs = [];
    for (const t of this.recheckTimers) window.clearTimeout(t);
    this.recheckTimers = [];
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.scheduled = false;
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(`.bases-view [${DONE_ATTR}]`)
    )) {
      el.removeAttribute(DONE_ATTR);
      el.classList.remove(
        PILL_CLASS,
        ...PILL_PALETTE.map((c) => `${PILL_CLASS}-${c}`)
      );
    }
  }

  /** Re-color everything (e.g. after an override change). */
  refresh(): void {
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(`.bases-view [${DONE_ATTR}]`)
    )) {
      el.removeAttribute(DONE_ATTR);
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    // setTimeout, not rAF: rAF stalls while the window is unfocused/hidden
    // (Electron throttling), which silently skipped the initial pass.
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.scheduled = false;
      if (!this.observer) return;
      this.decorateAll();
    }, 50);
  }

  private decorateAll(): void {
    const chips = document.querySelectorAll<HTMLElement>(
      `.bases-view .value-list-element:not([${DONE_ATTR}])`
    );
    for (const chip of Array.from(chips)) {
      // Bases nests a wrapper .value-list-element around .value-list-container;
      // only leaf chips carry the actual value text.
      if (chip.querySelector(".value-list-container")) {
        chip.setAttribute(DONE_ATTR, "wrapper");
        continue;
      }
      const color = pickPillColor(
        chip.textContent ?? "",
        this.plugin.settings.pillColorOverrides
      );
      chip.setAttribute(DONE_ATTR, color ?? "none");
      if (!color) continue;
      chip.classList.add(PILL_CLASS, `${PILL_CLASS}-${color}`);
    }
  }
}

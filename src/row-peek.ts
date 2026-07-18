import {
  Component,
  MarkdownRenderer,
  Modal,
  Notice,
  Setting,
  TFile,
  type App,
} from "obsidian";
import type SupertagsPlugin from "./main";
import { patchFrontmatter } from "./frontmatter-patch";

/**
 * Notion-style row peek for native Bases table views: hovering a row reveals
 * an OPEN button; clicking it opens a modal with the note's frontmatter
 * (editable in place via raw-text patch) plus a rendered preview of the
 * body. The .base file and the note stay the source of truth — this is a
 * pure interaction layer.
 */

// --- pure helpers (unit-tested) ---------------------------------------------

/** Render a frontmatter value into a single-line editable string. */
export function formatPropertyValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  return String(v);
}

/**
 * Parse the edited string back, shaped by the ORIGINAL value's type: lists
 * split on commas, numbers stay numeric when parseable, booleans parse
 * true/false. Empty input clears the property (null).
 */
export function parsePropertyInput(input: string, original: unknown): unknown {
  const s = input.trim();
  if (s === "") return null;
  if (Array.isArray(original)) {
    return s
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  }
  if (typeof original === "number") {
    const n = Number(s);
    return Number.isNaN(n) ? s : n;
  }
  if (typeof original === "boolean") {
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return s;
}

// --- modal -------------------------------------------------------------------

export class RowPeekModal extends Modal {
  /** Child component so MarkdownRenderer resources get unloaded with the modal. */
  private renderer = new Component();

  constructor(app: App, private plugin: SupertagsPlugin, private file: TFile) {
    super(app);
  }

  onOpen(): void {
    this.renderer.load();
    this.modalEl.addClass("supertags-peek-modal");
    void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();

    // Header: title + open actions
    const header = contentEl.createDiv({ cls: "supertags-peek-header" });
    header.createEl("h3", { text: this.file.basename });
    const actions = header.createDiv({ cls: "supertags-peek-actions" });
    const openBtn = actions.createEl("button", { text: "Apri nota" });
    openBtn.addEventListener("click", () => {
      void this.app.workspace.getLeaf(false).openFile(this.file);
      this.close();
    });

    // Properties (editable)
    const fm =
      this.app.metadataCache.getFileCache(this.file)?.frontmatter ?? {};
    const props = contentEl.createDiv({ cls: "supertags-peek-props" });
    const keys = Object.keys(fm).filter((k) => k !== "position");
    if (keys.length === 0) {
      props.createEl("p", { cls: "supertags-muted", text: "No properties." });
    }
    for (const key of keys) {
      const original = (fm as Record<string, unknown>)[key];
      const s = new Setting(props).setName(key);
      s.settingEl.addClass("supertags-peek-prop");
      s.addText((t) => {
        t.setValue(formatPropertyValue(original));
        // Commit on blur/Enter, not per keystroke: one frontmatter write per edit.
        t.inputEl.addEventListener("change", () => {
          void this.commit(key, t.inputEl.value, original);
        });
      });
    }

    // Body preview (read-only)
    const previewWrap = contentEl.createDiv({ cls: "supertags-peek-preview" });
    const raw = await this.app.vault.cachedRead(this.file);
    const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "");
    await MarkdownRenderer.render(
      this.app,
      body.trim() || "*Nota vuota.*",
      previewWrap,
      this.file.path,
      this.renderer
    );
  }

  private async commit(
    key: string,
    input: string,
    original: unknown
  ): Promise<void> {
    try {
      const value = parsePropertyInput(input, original);
      // Raw-text patch instead of processFrontMatter: only this key is
      // rewritten, so unquoted wikilinks elsewhere in the block survive.
      await this.app.vault.process(this.file, (content) =>
        value === null ? patchFrontmatter(content, {}, [key]) : patchFrontmatter(content, { [key]: value })
      );
    } catch (e) {
      console.error("[supertags] peek edit failed", e);
      new Notice(`Failed to update ${key} — see console.`);
    }
  }

  onClose(): void {
    this.renderer.unload();
    this.contentEl.empty();
  }
}

// --- hover OPEN affordance -----------------------------------------------------

export class RowPeek {
  /** Single floating button, moved onto whichever row is hovered. */
  private button: HTMLButtonElement | null = null;

  constructor(private plugin: SupertagsPlugin) {}

  enable(): void {
    if (this.button) return;
    const btn = document.createElement("button");
    btn.className = "supertags-peek-btn";
    btn.textContent = "OPEN";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const row = btn.closest(".bases-tr");
      const file = row ? this.resolveRowFile(row as HTMLElement) : null;
      if (file) {
        new RowPeekModal(this.plugin.app, this.plugin, file).open();
      }
    });
    this.button = btn;

    this.plugin.registerDomEvent(document, "pointerover", (e) => {
      const target = e.target as HTMLElement | null;
      const row = target?.closest?.(".bases-view .bases-tr") as HTMLElement | null;
      if (!row || !this.button) return;
      // Header rows have no note link — skip them.
      if (!row.querySelector(".internal-link")) return;
      if (this.button.parentElement !== row) row.appendChild(this.button);
    });

    this.plugin.addCommand({
      id: "peek-active-note",
      name: "Peek active note",
      checkCallback: (checking) => {
        const file = this.plugin.app.workspace.getActiveFile();
        const ok = !!file && file.extension === "md";
        if (ok && !checking) {
          new RowPeekModal(this.plugin.app, this.plugin, file).open();
        }
        return ok;
      },
    });
  }

  disable(): void {
    this.button?.remove();
    this.button = null;
  }

  private resolveRowFile(row: HTMLElement): TFile | null {
    const link = row.querySelector<HTMLElement>(".internal-link");
    const href =
      link?.getAttribute("data-href") ?? link?.getAttribute("href") ?? "";
    if (!href) return null;
    return this.plugin.app.metadataCache.getFirstLinkpathDest(href, "");
  }
}

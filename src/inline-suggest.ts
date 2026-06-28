import {
  EditorSuggest,
  type App,
  type Editor,
  type EditorPosition,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
  type TFile,
} from "obsidian";
import type SupertagsPlugin from "./main";
import type { Supertag } from "./types";

/**
 * In-editor supertag picker. Typing the configured trigger (default `++`)
 * opens a fuzzy list; choosing one removes the trigger text and applies the
 * supertag to the current note's frontmatter.
 */
export class SupertagSuggest extends EditorSuggest<Supertag> {
  constructor(app: App, private plugin: SupertagsPlugin) {
    super(app);
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    _file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    if (!this.plugin.settings.inlineSuggest) return null;
    const trigger = this.plugin.settings.inlineTrigger || "++";
    const line = editor.getLine(cursor.line).slice(0, cursor.ch);
    const idx = line.lastIndexOf(trigger);
    if (idx === -1) return null;

    const query = line.slice(idx + trigger.length);
    // Only active while typing a contiguous token (no spaces).
    if (/\s/.test(query)) return null;

    return {
      start: { line: cursor.line, ch: idx },
      end: cursor,
      query,
    };
  }

  getSuggestions(context: EditorSuggestContext): Supertag[] {
    const q = context.query.toLowerCase();
    const all = this.plugin.registry.supertags;
    if (!q) return all;
    return all.filter(
      (s) => s.baseName.toLowerCase().includes(q) || s.tag.toLowerCase().includes(q)
    );
  }

  renderSuggestion(st: Supertag, el: HTMLElement): void {
    el.addClass("supertags-suggest-item");
    el.createSpan({ cls: "supertags-suggest-icon", text: st.icon });
    el.createSpan({ cls: "supertags-suggest-name", text: st.baseName });
    el.createSpan({ cls: "supertags-suggest-tag", text: st.tag });
  }

  selectSuggestion(st: Supertag): void {
    const ctx = this.context;
    if (!ctx) return;
    // Remove the typed trigger + query from the body.
    ctx.editor.replaceRange("", ctx.start, ctx.end);
    void this.plugin.applyToFile(ctx.file, st);
    this.close();
  }
}

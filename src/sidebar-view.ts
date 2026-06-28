import { ItemView, Menu, Notice, setIcon, type WorkspaceLeaf } from "obsidian";
import type SupertagsPlugin from "./main";
import type { Supertag } from "./types";
import { CreateSupertagModal } from "./create-modal";
import { FieldEditorModal } from "./field-editor-modal";

export const VIEW_TYPE_SUPERTAGS = "supertags-panel";

const ICON_CHOICES = [
  "🏷️", "📍", "👤", "📄", "💡", "🏢", "📚", "🎯", "🚀", "📖",
  "📰", "🎓", "🧭", "🧠", "🎙️", "🧩", "🗂️", "🗺️", "⭐", "🔖",
];

export class SupertagsView extends ItemView {
  private filterText = "";

  constructor(leaf: WorkspaceLeaf, private plugin: SupertagsPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_SUPERTAGS;
  }

  getDisplayText(): string {
    return "Supertags";
  }

  getIcon(): string {
    return "tags";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  /** Public re-render hook called by the plugin on data changes. */
  render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("supertags-panel");

    this.renderHeader(root);
    this.renderFilter(root);

    const list = root.createDiv({ cls: "supertags-list" });
    const matches = this.visibleSupertags();

    if (matches.length === 0) {
      list.createDiv({
        cls: "supertags-empty",
        text: this.plugin.registry.supertags.length === 0
          ? "No supertags found. Check your scope folders in settings, or create one."
          : "No supertags match your filter.",
      });
    } else if (this.plugin.settings.groupView) {
      this.renderGrouped(list, matches);
    } else {
      this.renderFlat(list, matches);
    }

    if (this.plugin.settings.showViewsSection) {
      this.renderViews(root);
    }
  }

  // --- header / filter ------------------------------------------------------

  private renderHeader(root: HTMLElement): void {
    const header = root.createDiv({ cls: "supertags-header" });
    header.createSpan({ cls: "supertags-title", text: "SUPERTAGS" });

    const actions = header.createDiv({ cls: "supertags-header-actions" });

    const applyBtn = actions.createEl("button", { cls: "supertags-iconbtn", attr: { "aria-label": "Apply to current note" } });
    setIcon(applyBtn, "plus-circle");
    applyBtn.onclick = () => this.plugin.applyToActiveFile();

    const createBtn = actions.createEl("button", { cls: "supertags-iconbtn", attr: { "aria-label": "Create supertag" } });
    setIcon(createBtn, "plus");
    createBtn.onclick = () => new CreateSupertagModal(this.app, this.plugin).open();

    const refreshBtn = actions.createEl("button", { cls: "supertags-iconbtn", attr: { "aria-label": "Refresh" } });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.onclick = () => void this.plugin.rebuild();

    const moreBtn = actions.createEl("button", { cls: "supertags-iconbtn", attr: { "aria-label": "Options" } });
    setIcon(moreBtn, "settings-2");
    moreBtn.onclick = (e) => this.openOptionsMenu(e);
  }

  private renderFilter(root: HTMLElement): void {
    const wrap = root.createDiv({ cls: "supertags-filter" });
    setIcon(wrap.createSpan({ cls: "supertags-filter-icon" }), "search");
    const input = wrap.createEl("input", {
      cls: "supertags-filter-input",
      attr: { type: "text", placeholder: "filtra…" },
    });
    input.value = this.filterText;
    input.addEventListener("input", () => {
      this.filterText = input.value;
      this.renderListOnly();
    });
  }

  /** Re-render only the list portion (keeps filter focus stable). */
  private renderListOnly(): void {
    const existing = this.contentEl.querySelector(".supertags-list");
    const matches = this.visibleSupertags();
    if (!existing) {
      this.render();
      return;
    }
    const list = existing as HTMLElement;
    list.empty();
    if (matches.length === 0) {
      list.createDiv({ cls: "supertags-empty", text: "No supertags match your filter." });
    } else if (this.plugin.settings.groupView) {
      this.renderGrouped(list, matches);
    } else {
      this.renderFlat(list, matches);
    }
  }

  // --- rows -----------------------------------------------------------------

  private visibleSupertags(): Supertag[] {
    const q = this.filterText.trim().toLowerCase();
    const all = this.plugin.registry.supertags;
    if (!q) return all;
    return all.filter(
      (s) => s.baseName.toLowerCase().includes(q) || s.tag.toLowerCase().includes(q)
    );
  }

  private renderFlat(list: HTMLElement, items: Supertag[]): void {
    for (const st of items) this.renderRow(list, st);
  }

  private renderGrouped(list: HTMLElement, items: Supertag[]): void {
    const pinned = items.filter((s) => s.pinned);
    const rest = items.filter((s) => !s.pinned);

    if (pinned.length) {
      this.renderGroupHeader(list, "★ PINNED");
      for (const st of pinned) this.renderRow(list, st);
    }

    const groups = new Map<string, Supertag[]>();
    for (const st of rest) {
      const g = st.group?.trim() || "Other";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(st);
    }
    for (const g of [...groups.keys()].sort()) {
      this.renderGroupHeader(list, g.toUpperCase());
      for (const st of groups.get(g)!) this.renderRow(list, st);
    }
  }

  private renderGroupHeader(list: HTMLElement, text: string): void {
    list.createDiv({ cls: "supertags-group-header", text });
  }

  private renderRow(list: HTMLElement, st: Supertag): void {
    const row = list.createDiv({ cls: "supertags-row" });
    if (st.pinned) row.addClass("is-pinned");
    row.createSpan({ cls: "supertags-row-icon", text: st.icon });
    row.createSpan({ cls: "supertags-row-name", text: st.baseName });
    row.createSpan({ cls: "supertags-row-count", text: String(st.memberCount) });

    row.addEventListener("click", () => this.plugin.openBase(st));
    row.addEventListener("contextmenu", (e) => this.openRowMenu(e, st));
  }

  private renderViews(root: HTMLElement): void {
    const views = this.plugin.registry.views;
    if (views.length === 0) return;
    root.createDiv({ cls: "supertags-group-header", text: "VIEWS" });
    const list = root.createDiv({ cls: "supertags-list" });
    for (const v of views) {
      const row = list.createDiv({ cls: "supertags-row is-view" });
      setIcon(row.createSpan({ cls: "supertags-row-icon" }), "layout-grid");
      row.createSpan({ cls: "supertags-row-name", text: v.name });
      row.addEventListener("click", () => this.plugin.openBasePath(v.path));
    }
  }

  // --- menus ----------------------------------------------------------------

  private openRowMenu(e: MouseEvent, st: Supertag): void {
    e.preventDefault();
    const menu = new Menu();

    menu.addItem((i) =>
      i.setTitle("Open collection").setIcon("table").onClick(() => this.plugin.openBase(st))
    );
    menu.addItem((i) =>
      i.setTitle("Apply to current note").setIcon("plus-circle").onClick(() => this.plugin.applyToActiveFile(st))
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle(st.pinned ? "Unpin" : "Pin")
        .setIcon(st.pinned ? "pin-off" : "pin")
        .onClick(() => void this.plugin.setOverride(st.tag, { pinned: !st.pinned }))
    );
    menu.addItem((i) =>
      i.setTitle("Set icon…").setIcon("smile").onClick(() => this.openIconMenu(e, st))
    );
    menu.addItem((i) =>
      i.setTitle("Set group…").setIcon("folder").onClick(() => this.promptGroup(st))
    );
    menu.addItem((i) =>
      i.setTitle("Edit fields…").setIcon("list").onClick(() => new FieldEditorModal(this.app, this.plugin, st).open())
    );
    menu.showAtMouseEvent(e);
  }

  private openIconMenu(e: MouseEvent, st: Supertag): void {
    const menu = new Menu();
    for (const ic of ICON_CHOICES) {
      menu.addItem((i) =>
        i.setTitle(ic).onClick(() => void this.plugin.setOverride(st.tag, { icon: ic }))
      );
    }
    menu.showAtMouseEvent(e);
  }

  private promptGroup(st: Supertag): void {
    // Lightweight inline prompt via a transient menu is awkward; use a Notice +
    // the field editor pattern instead. Here we cycle through a simple prompt.
    const current = st.group ?? "";
    const next = window.prompt("Group label for this supertag (blank to clear):", current);
    if (next === null) return;
    void this.plugin.setOverride(st.tag, { group: next.trim() || undefined });
  }

  private openOptionsMenu(e: MouseEvent): void {
    const menu = new Menu();
    const s = this.plugin.settings;
    menu.addItem((i) =>
      i
        .setTitle("Group by label")
        .setChecked(s.groupView)
        .onClick(async () => {
          s.groupView = !s.groupView;
          await this.plugin.saveSettings();
          this.render();
        })
    );
    menu.addItem((i) =>
      i
        .setTitle("Show Views section")
        .setChecked(s.showViewsSection)
        .onClick(async () => {
          s.showViewsSection = !s.showViewsSection;
          await this.plugin.saveSettings();
          this.render();
        })
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i.setTitle("Create supertag…").setIcon("plus").onClick(() => new CreateSupertagModal(this.app, this.plugin).open())
    );
    menu.showAtMouseEvent(e);
  }
}

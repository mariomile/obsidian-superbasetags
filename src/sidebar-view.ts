import { ItemView, Menu, TFile, setIcon, type WorkspaceLeaf } from "obsidian";
import type SupertagsPlugin from "./main";
import type { Supertag } from "./types";
import { CreateSupertagModal } from "./create-modal";
import { FieldEditorModal } from "./field-editor-modal";
import { GroupModal } from "./group-modal";
import { IconPickerModal } from "./icon-picker-modal";
import { fuzzyFilterSupertags } from "./search";

export const VIEW_TYPE_SUPERTAGS = "supertags-panel";

/** How many member notes to preview when a row is expanded. */
const MEMBER_PREVIEW_LIMIT = 8;

export class SupertagsView extends ItemView {
  private filterText = "";
  private expanded = new Set<string>();

  constructor(leaf: WorkspaceLeaf, private plugin: SupertagsPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_SUPERTAGS;
  }

  getDisplayText(): string {
    return "SuperBaseTags";
  }

  getIcon(): string {
    return "tags";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  /** Full rebuild. Used on open and structural (settings) changes. */
  render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("supertags-panel");

    this.renderHeader(root);
    this.renderFilter(root);

    const list = root.createDiv({ cls: "supertags-list" });
    this.renderList(list);

    if (this.plugin.settings.showViewsSection) {
      this.renderViews(root);
    }
  }

  /**
   * Lightweight refresh for data changes (counts, membership). Re-renders only
   * the list, leaving the header and filter input untouched so focus and the
   * text caret survive. Falls back to a full render if the list is missing.
   */
  refresh(): void {
    const existing = this.contentEl.querySelector(".supertags-list");
    if (!existing) {
      this.render();
      return;
    }
    this.renderListOnly();
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
      attr: { type: "text", placeholder: "cerca…" },
    });
    input.value = this.filterText;
    input.addEventListener("input", () => {
      this.filterText = input.value;
      this.renderListOnly();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const top = this.visibleSupertags()[0];
        if (top) {
          e.preventDefault();
          this.plugin.openBase(top);
        }
      } else if (e.key === "Escape" && this.filterText) {
        e.preventDefault();
        e.stopPropagation();
        this.filterText = "";
        input.value = "";
        this.renderListOnly();
      }
    });
  }

  /** Re-render only the list portion (keeps filter focus stable). */
  private renderListOnly(): void {
    const existing = this.contentEl.querySelector(".supertags-list");
    if (!existing) {
      this.render();
      return;
    }
    const list = existing as HTMLElement;
    list.empty();
    this.renderList(list);
  }

  private renderList(list: HTMLElement): void {
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
  }

  // --- rows -----------------------------------------------------------------

  private visibleSupertags(): Supertag[] {
    return fuzzyFilterSupertags(this.filterText, this.plugin.registry.supertags);
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
    const wrap = list.createDiv({ cls: "supertags-row-wrap" });
    const row = wrap.createDiv({ cls: "supertags-row" });
    if (st.pinned) row.addClass("is-pinned");

    const isExpanded = this.expanded.has(st.tag);
    const chevron = row.createSpan({ cls: "supertags-row-chevron" });
    setIcon(chevron, "chevron-right");
    if (isExpanded) chevron.addClass("is-expanded");
    chevron.setAttribute("aria-label", isExpanded ? "Collapse" : "Expand");
    chevron.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleExpand(st);
    });

    row.createSpan({ cls: "supertags-row-icon", text: st.icon });
    row.createSpan({ cls: "supertags-row-name", text: st.baseName });
    row.createSpan({ cls: "supertags-row-count", text: String(st.memberCount) });

    row.addEventListener("click", () => this.plugin.openBase(st));
    row.addEventListener("contextmenu", (e) => this.openRowMenu(e, st));

    if (isExpanded) this.renderMembers(wrap, st);
  }

  private toggleExpand(st: Supertag): void {
    if (this.expanded.has(st.tag)) this.expanded.delete(st.tag);
    else this.expanded.add(st.tag);
    this.renderListOnly();
  }

  private renderMembers(wrap: HTMLElement, st: Supertag): void {
    const box = wrap.createDiv({ cls: "supertags-members" });
    const members = this.plugin.registry.membersOf(st.tag, MEMBER_PREVIEW_LIMIT + 1);

    if (members.length === 0) {
      box.createDiv({ cls: "supertags-member is-empty", text: "No notes yet" });
      return;
    }

    for (const f of members.slice(0, MEMBER_PREVIEW_LIMIT)) {
      const m = box.createDiv({ cls: "supertags-member", text: f.basename });
      m.addEventListener("click", () => void this.openFile(f));
    }

    if (members.length > MEMBER_PREVIEW_LIMIT) {
      const more = box.createDiv({
        cls: "supertags-member is-more",
        text: `+${st.memberCount - MEMBER_PREVIEW_LIMIT} more — open collection`,
      });
      more.addEventListener("click", () => this.plugin.openBase(st));
    }
  }

  private async openFile(file: TFile): Promise<void> {
    await this.app.workspace.getLeaf(false).openFile(file);
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
      i.setTitle("Set icon…").setIcon("smile").onClick(() => new IconPickerModal(this.app, this.plugin, st).open())
    );
    menu.addItem((i) =>
      i.setTitle("Set group…").setIcon("folder").onClick(() => new GroupModal(this.app, this.plugin, st).open())
    );
    menu.addItem((i) =>
      i.setTitle("Edit fields…").setIcon("list").onClick(() => new FieldEditorModal(this.app, this.plugin, st).open())
    );
    menu.showAtMouseEvent(e);
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

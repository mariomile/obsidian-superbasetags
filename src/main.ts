import {
  Notice,
  Plugin,
  TFile,
  debounce,
  type Debouncer,
  type WorkspaceLeaf,
} from "obsidian";
import {
  DEFAULT_SETTINGS,
  SupertagsSettingTab,
  type SupertagsSettings,
} from "./settings";
import { SupertagRegistry } from "./registry";
import { SupertagsView, VIEW_TYPE_SUPERTAGS } from "./sidebar-view";
import { ApplyModal } from "./apply-modal";
import { CreateSupertagModal } from "./create-modal";
import { SupertagSuggest } from "./inline-suggest";
import { applySupertag } from "./frontmatter";
import { PillColorizer } from "./pill-colorizer";
import { RowPeek } from "./row-peek";
import type { Supertag, SupertagOverride } from "./types";

export default class SupertagsPlugin extends Plugin {
  settings!: SupertagsSettings;
  registry!: SupertagRegistry;

  private recountDebounced!: Debouncer<[], void>;
  private rebuildDebounced!: Debouncer<[], void>;
  private inlineSuggest: SupertagSuggest | null = null;
  private pillColorizer: PillColorizer | null = null;
  private rowPeek: RowPeek | null = null;
  /** Full command ids we've registered for per-supertag "apply" commands. */
  private supertagCommandIds = new Set<string>();

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registry = new SupertagRegistry({
      app: this.app,
      getScanOptions: () => ({
        prefix: this.settings.tagPrefix,
        scopeFolders: this.settings.scopeFolders,
      }),
      getOverrides: () => this.settings.overrides,
      getDefaultIcon: () => this.settings.defaultIcon,
    });

    this.recountDebounced = debounce(
      () => {
        this.registry.recount();
        this.refreshView();
      },
      600,
      false
    );
    this.rebuildDebounced = debounce(() => void this.rebuild(), 400, false);

    this.registerView(VIEW_TYPE_SUPERTAGS, (leaf) => new SupertagsView(leaf, this));

    this.addRibbonIcon("tags", "SuperBaseTags", () => this.activateView());

    this.registerCommands();
    this.registerEventHandlers();
    this.reloadInlineSuggest();

    this.addSettingTab(new SupertagsSettingTab(this.app, this));

    // Build once the metadata cache is ready so counts are accurate.
    this.app.workspace.onLayoutReady(() => {
      void this.rebuild();
      this.reloadBasesLayer();
    });
  }

  onunload(): void {
    // Obsidian detaches the view and unbinds registerDomEvent handlers.
    this.pillColorizer?.disable();
    this.rowPeek?.disable();
  }

  /** (Re)apply the Bases interaction layer toggles (row peek, pill colorizer). */
  reloadBasesLayer(): void {
    if (this.settings.pillColorizer) {
      this.pillColorizer ??= new PillColorizer(this);
      this.pillColorizer.enable();
    } else {
      this.pillColorizer?.disable();
    }
    if (this.settings.rowPeek) {
      this.rowPeek ??= new RowPeek(this);
      this.rowPeek.enable();
    } else {
      this.rowPeek?.disable();
    }
  }

  // --- settings -------------------------------------------------------------

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // --- registry lifecycle ---------------------------------------------------

  async rebuild(): Promise<void> {
    await this.registry.rebuild();
    this.syncSupertagCommands();
    this.refreshView();
  }

  /**
   * Register one "Apply supertag: X" command per supertag so they're reachable
   * from the command palette / hotkeys. Idempotent by id across rebuilds; prunes
   * commands for supertags that no longer exist.
   */
  private syncSupertagCommands(): void {
    const wanted = new Set<string>();
    for (const st of this.registry.supertags) {
      const localId = `apply-supertag:${st.tag}`;
      const fullId = `${this.manifest.id}:${localId}`;
      wanted.add(fullId);
      if (this.supertagCommandIds.has(fullId)) continue;
      this.addCommand({
        id: localId,
        name: `Apply supertag: ${st.baseName}`,
        checkCallback: (checking) => {
          const file = this.app.workspace.getActiveFile();
          const ok = !!file && file.extension === "md";
          if (ok && !checking) {
            const fresh = this.registry.find(st.tag);
            if (fresh) void this.applyToFile(file, fresh);
          }
          return ok;
        },
      });
      this.supertagCommandIds.add(fullId);
    }

    // Prune stale commands (supertag deleted/renamed). Uses the internal command
    // registry — guarded so a future API change degrades gracefully.
    const commands = (this.app as unknown as {
      commands?: { removeCommand?: (id: string) => void };
    }).commands;
    for (const id of [...this.supertagCommandIds]) {
      if (wanted.has(id)) continue;
      commands?.removeCommand?.(id);
      this.supertagCommandIds.delete(id);
    }
  }

  refreshView(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SUPERTAGS)) {
      const view = leaf.view;
      // Data-driven refresh: update only the list so the filter input keeps its
      // focus/caret. Rebuilding the whole view on every metadata event would
      // steal focus mid-typing (invisible cursor).
      if (view instanceof SupertagsView) view.refresh();
    }
  }

  // --- view activation ------------------------------------------------------

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_SUPERTAGS)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_SUPERTAGS, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }

  // --- commands -------------------------------------------------------------

  private registerCommands(): void {
    this.addCommand({
      id: "open-panel",
      name: "Open SuperBaseTags panel",
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: "apply-to-current",
      name: "Apply supertag to current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const ok = !!file && file.extension === "md";
        if (ok && !checking) this.applyToActiveFile();
        return ok;
      },
    });
    this.addCommand({
      id: "create-supertag",
      name: "Create supertag",
      callback: () => new CreateSupertagModal(this.app, this).open(),
    });
    this.addCommand({
      id: "refresh",
      name: "Refresh supertags",
      callback: () => void this.rebuild(),
    });
  }

  // --- events ---------------------------------------------------------------

  private registerEventHandlers(): void {
    // Note membership changes → recount (cheap).
    this.registerEvent(this.app.metadataCache.on("changed", () => this.recountDebounced()));
    this.registerEvent(this.app.metadataCache.on("deleted", () => this.recountDebounced()));

    // Base file set/content changes → full rebuild.
    const isBase = (f: unknown): f is TFile => f instanceof TFile && f.extension === "base";
    this.registerEvent(
      this.app.vault.on("create", (f) => isBase(f) && this.rebuildDebounced())
    );
    this.registerEvent(
      this.app.vault.on("delete", (f) => isBase(f) && this.rebuildDebounced())
    );
    this.registerEvent(
      this.app.vault.on("rename", (f) => isBase(f) && this.rebuildDebounced())
    );
    this.registerEvent(
      this.app.vault.on("modify", (f) => isBase(f) && this.rebuildDebounced())
    );
  }

  reloadInlineSuggest(): void {
    // EditorSuggest has no public unregister; we gate by toggling a live flag
    // through re-registration only when enabling for the first time.
    if (this.settings.inlineSuggest && !this.inlineSuggest) {
      this.inlineSuggest = new SupertagSuggest(this.app, this);
      this.registerEditorSuggest(this.inlineSuggest);
    }
    // When disabled, the suggest stays registered but onTrigger is gated below.
  }

  // --- apply / open ---------------------------------------------------------

  async applyToFile(file: TFile, st: Supertag): Promise<void> {
    try {
      const res = await applySupertag(this.app, file, st, this.settings.scaffoldFields);
      const bits: string[] = [];
      if (res.tagAdded) bits.push(`#${st.tag}`);
      else bits.push(`already #${st.tag}`);
      if (res.fieldsAdded.length) bits.push(`+${res.fieldsAdded.length} fields`);
      new Notice(`${st.icon} ${file.basename}: ${bits.join(", ")}`);
      this.recountDebounced();
    } catch (e) {
      console.error("[supertags] apply failed", e);
      new Notice("Failed to apply supertag — see console.");
    }
  }

  applyToActiveFile(st?: Supertag): void {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice("Open a markdown note first.");
      return;
    }
    if (st) {
      void this.applyToFile(file, st);
    } else {
      new ApplyModal(this.app, this, file).open();
    }
  }

  openBase(st: Supertag): void {
    this.openBasePath(st.basePath);
  }

  openBasePath(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      void this.app.workspace.getLeaf(false).openFile(file);
    } else {
      new Notice(`Base not found: ${path}`);
    }
  }

  // --- overrides ------------------------------------------------------------

  async setOverride(tag: string, partial: SupertagOverride): Promise<void> {
    const current = this.settings.overrides[tag] ?? {};
    this.settings.overrides[tag] = { ...current, ...partial };
    // Drop empty keys to keep the sidecar tidy.
    const ov = this.settings.overrides[tag];
    if (ov.group === undefined) delete ov.group;
    await this.saveSettings();
    await this.rebuild();
  }
}

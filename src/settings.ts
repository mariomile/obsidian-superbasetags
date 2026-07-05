import { App, PluginSettingTab, Setting } from "obsidian";
import type SupertagsPlugin from "./main";
import type { SupertagOverride } from "./types";

export interface SupertagsSettings {
  /** Folders to scan for `.base` files. Empty = whole vault. */
  scopeFolders: string[];
  /** Tag namespace that marks a base as a supertag collection. */
  tagPrefix: string;
  /** Write the supertag's default fields onto the note when applied. */
  scaffoldFields: boolean;
  /** Default icon for supertags without a known/explicit icon. */
  defaultIcon: string;

  // --- Phase 2 ---
  /** Show non-supertag `.base` files in a "Views" section at the bottom. */
  showViewsSection: boolean;
  /** Group supertags by their `group` label (pinned always on top). */
  groupView: boolean;
  /** Enable the in-editor supertag autocomplete. */
  inlineSuggest: boolean;
  /** Trigger string for the inline autocomplete (low-conflict by default). */
  inlineTrigger: string;

  /** Per-tag overrides (icon, pin, group, field schema). */
  overrides: Record<string, SupertagOverride>;

  // --- Phase 3: Bases interaction layer ---
  /** Hover OPEN button on Bases table rows → peek modal (props + preview). */
  rowPeek: boolean;
  /** Color tag/list chips in Bases views (deterministic, .mv-pill-* classes). */
  pillColorizer: boolean;
  /** Per-value pill color overrides, keys normalized (lowercase, no #). */
  pillColorOverrides: Record<string, string>;
}

export const DEFAULT_SETTINGS: SupertagsSettings = {
  scopeFolders: ["_system/views"],
  tagPrefix: "type/",
  scaffoldFields: true,
  defaultIcon: "🏷️",

  showViewsSection: false,
  groupView: false,
  inlineSuggest: false,
  inlineTrigger: "++",

  overrides: {},

  rowPeek: true,
  pillColorizer: true,
  pillColorOverrides: {},
};

export class SupertagsSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SupertagsPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Scanning").setHeading();

    new Setting(containerEl)
      .setName("Scope folders")
      .setDesc(
        "Folders to scan for .base files, one per line. Leave empty to scan the whole vault."
      )
      .addTextArea((ta) => {
        ta.setValue(this.plugin.settings.scopeFolders.join("\n"));
        ta.setPlaceholder("_system/views");
        ta.onChange(async (v) => {
          this.plugin.settings.scopeFolders = v
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          await this.plugin.saveSettings();
          await this.plugin.rebuild();
        });
      });

    new Setting(containerEl)
      .setName("Supertag tag prefix")
      .setDesc(
        "A base is treated as a supertag when its filters reference a tag with this prefix (e.g. type/person)."
      )
      .addText((t) => {
        t.setValue(this.plugin.settings.tagPrefix);
        t.setPlaceholder("type/");
        t.onChange(async (v) => {
          this.plugin.settings.tagPrefix = v.trim() || "type/";
          await this.plugin.saveSettings();
          await this.plugin.rebuild();
        });
      });

    new Setting(containerEl).setName("Applying").setHeading();

    new Setting(containerEl)
      .setName("Scaffold default fields")
      .setDesc(
        "When you apply a supertag, also add its collection's fields as empty frontmatter keys (Tana-style)."
      )
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.scaffoldFields);
        tg.onChange(async (v) => {
          this.plugin.settings.scaffoldFields = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Default icon")
      .setDesc("Used for supertags without a known or custom icon.")
      .addText((t) => {
        t.setValue(this.plugin.settings.defaultIcon);
        t.onChange(async (v) => {
          this.plugin.settings.defaultIcon = v || "🏷️";
          await this.plugin.saveSettings();
          this.plugin.refreshView();
        });
      });

    new Setting(containerEl).setName("Panel & advanced").setHeading();

    new Setting(containerEl)
      .setName("Group supertags")
      .setDesc("Group by the per-supertag group label. Pinned items stay on top.")
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.groupView);
        tg.onChange(async (v) => {
          this.plugin.settings.groupView = v;
          await this.plugin.saveSettings();
          this.plugin.refreshView();
        });
      });

    new Setting(containerEl)
      .setName("Show Views section")
      .setDesc("List .base files that are not supertags in a collapsible section.")
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.showViewsSection);
        tg.onChange(async (v) => {
          this.plugin.settings.showViewsSection = v;
          await this.plugin.saveSettings();
          this.plugin.refreshView();
        });
      });

    new Setting(containerEl)
      .setName("Inline autocomplete")
      .setDesc(
        "Type the trigger in the editor to fuzzy-pick a supertag and apply it inline."
      )
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.inlineSuggest);
        tg.onChange(async (v) => {
          this.plugin.settings.inlineSuggest = v;
          await this.plugin.saveSettings();
          this.plugin.reloadInlineSuggest();
        });
      });

    new Setting(containerEl).setName("Bases").setHeading();

    new Setting(containerEl)
      .setName("Row peek")
      .setDesc(
        "Hovering a Bases table row shows an OPEN button that peeks the note: editable properties + rendered preview."
      )
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.rowPeek);
        tg.onChange(async (v) => {
          this.plugin.settings.rowPeek = v;
          await this.plugin.saveSettings();
          this.plugin.reloadBasesLayer();
        });
      });

    new Setting(containerEl)
      .setName("Pill colorizer")
      .setDesc(
        "Color tag and list chips in Bases views with a deterministic palette (.mv-pill classes, styled by the marioverse-bases snippet or this plugin's CSS). Per-value overrides live in data.json under pillColorOverrides."
      )
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.pillColorizer);
        tg.onChange(async (v) => {
          this.plugin.settings.pillColorizer = v;
          await this.plugin.saveSettings();
          this.plugin.reloadBasesLayer();
        });
      });

    new Setting(containerEl)
      .setName("Inline trigger")
      .setDesc("Characters that open the inline supertag picker (default ++).")
      .addText((t) => {
        t.setValue(this.plugin.settings.inlineTrigger);
        t.setPlaceholder("++");
        t.onChange(async (v) => {
          this.plugin.settings.inlineTrigger = v || "++";
          await this.plugin.saveSettings();
        });
      });
  }
}

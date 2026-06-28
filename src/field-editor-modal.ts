import { Modal, Setting, type App } from "obsidian";
import type SupertagsPlugin from "./main";
import type { FieldType, Supertag, SupertagField } from "./types";

const FIELD_TYPES: FieldType[] = ["text", "number", "date", "list", "checkbox"];

/**
 * Editor for a supertag's default field schema: per-field type and default
 * value. Saved as a per-tag override in the sidecar; the base stays untouched.
 */
export class FieldEditorModal extends Modal {
  private fields: SupertagField[];

  constructor(app: App, private plugin: SupertagsPlugin, private st: Supertag) {
    super(app);
    // Work on a deep-ish copy so Cancel discards changes.
    this.fields = st.fields.map((f) => ({ ...f }));
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: `${this.st.icon} ${this.st.baseName} — fields` });
    contentEl.createEl("p", {
      cls: "supertags-muted",
      text: "Types and defaults used when this supertag scaffolds a note. Overrides are stored in the plugin, not the .base file.",
    });

    const list = contentEl.createDiv({ cls: "supertags-field-list" });
    this.renderFields(list);

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText("Save")
          .setCta()
          .onClick(() => void this.save())
      )
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
  }

  private renderFields(container: HTMLElement): void {
    container.empty();
    if (this.fields.length === 0) {
      container.createEl("p", { cls: "supertags-muted", text: "No fields on this supertag." });
      return;
    }
    for (const f of this.fields) {
      const s = new Setting(container).setName(f.label).setDesc(f.key);
      s.addDropdown((d) => {
        for (const t of FIELD_TYPES) d.addOption(t, t);
        d.setValue(f.type);
        d.onChange((v) => (f.type = v as FieldType));
      });
      s.addText((t) => {
        t.setPlaceholder("default (optional)");
        t.setValue(f.default == null ? "" : String(f.default));
        t.onChange((v) => (f.default = v === "" ? undefined : v));
      });
    }
  }

  private async save(): Promise<void> {
    const ov = this.plugin.settings.overrides[this.st.tag] ?? {};
    ov.fields = this.fields;
    this.plugin.settings.overrides[this.st.tag] = ov;
    await this.plugin.saveSettings();
    await this.plugin.rebuild();
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

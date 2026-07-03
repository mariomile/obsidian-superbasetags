import { Modal, Setting, type App } from "obsidian";
import type SupertagsPlugin from "./main";
import type { Supertag } from "./types";

/**
 * Small text-input modal to set a supertag's group label. Replaces
 * `window.prompt`, which is blocked on mobile Obsidian.
 */
export class GroupModal extends Modal {
  private value: string;

  constructor(app: App, private plugin: SupertagsPlugin, private st: Supertag) {
    super(app);
    this.value = st.group ?? "";
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: `${this.st.icon} ${this.st.baseName} — group` });
    contentEl.createEl("p", {
      cls: "supertags-muted",
      text: "Group label used by the grouped view. Leave blank to clear.",
    });

    new Setting(contentEl).setName("Group label").addText((t) => {
      t.setPlaceholder("e.g. Knowledge");
      t.setValue(this.value);
      t.onChange((v) => (this.value = v));
      t.inputEl.focus();
      t.inputEl.select();
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void this.save();
      });
    });

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText("Save")
          .setCta()
          .onClick(() => void this.save())
      )
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
  }

  private async save(): Promise<void> {
    await this.plugin.setOverride(this.st.tag, { group: this.value.trim() || undefined });
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

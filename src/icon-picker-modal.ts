import { Modal, Setting, type App } from "obsidian";
import type SupertagsPlugin from "./main";
import type { Supertag } from "./types";

const ICON_CHOICES = [
  "🏷️", "📍", "👤", "📄", "💡", "🏢", "📚", "🎯", "🚀", "📖",
  "📰", "🎓", "🧭", "🧠", "🎙️", "🧩", "🗂️", "🗺️", "⭐", "🔖",
  "📝", "📅", "✅", "🔬", "🧪", "⚙️", "🔗", "💬", "📦", "🎬",
];

/**
 * Emoji grid picker for a supertag's icon, with a free-text field so any
 * pasted emoji or short string works. Replaces the vertical text menu.
 */
export class IconPickerModal extends Modal {
  constructor(app: App, private plugin: SupertagsPlugin, private st: Supertag) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: `${this.st.icon} ${this.st.baseName} — icon` });

    const grid = contentEl.createDiv({ cls: "supertags-icon-grid" });
    for (const ic of ICON_CHOICES) {
      const cell = grid.createEl("button", { cls: "supertags-icon-cell", text: ic });
      if (ic === this.st.icon) cell.addClass("is-selected");
      cell.onclick = () => void this.pick(ic);
    }

    new Setting(contentEl)
      .setName("Custom")
      .setDesc("Paste any emoji.")
      .addText((t) => {
        t.setPlaceholder(this.st.icon);
        t.onChange(() => {
          /* value read on submit */
        });
        t.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            const v = t.getValue().trim();
            if (v) void this.pick(v);
          }
        });
      });
  }

  private async pick(icon: string): Promise<void> {
    await this.plugin.setOverride(this.st.tag, { icon });
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

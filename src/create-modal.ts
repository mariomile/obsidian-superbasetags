import { Modal, Notice, Setting, stringifyYaml, type App } from "obsidian";
import type SupertagsPlugin from "./main";

/** Slugify a free-text name into a tag-safe segment. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Wizard to create a new supertag: derives `type/<slug>`, writes a starter
 * `.base` collection filtered on that tag, and refreshes the registry.
 */
export class CreateSupertagModal extends Modal {
  private name = "";

  constructor(app: App, private plugin: SupertagsPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Create supertag" });

    const preview = contentEl.createDiv({ cls: "supertags-create-preview" });
    const renderPreview = () => {
      const slug = slugify(this.name);
      const prefix = this.plugin.settings.tagPrefix;
      preview.setText(
        slug ? `Tag: #${prefix}${slug}  ·  Base: ${this.name.trim()}.base` : "—"
      );
    };
    renderPreview();

    new Setting(contentEl).setName("Name").addText((t) => {
      t.setPlaceholder("e.g. Meeting");
      t.onChange((v) => {
        this.name = v;
        renderPreview();
      });
      t.inputEl.focus();
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void this.create();
      });
    });

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText("Create")
          .setCta()
          .onClick(() => void this.create())
      )
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
  }

  private async create(): Promise<void> {
    const name = this.name.trim();
    const slug = slugify(name);
    if (!slug) {
      new Notice("Please enter a name.");
      return;
    }

    const prefix = this.plugin.settings.tagPrefix;
    const tag = `${prefix}${slug}`;
    const folder = this.plugin.settings.scopeFolders[0] ?? "Bases";
    const path = `${folder}/${name}.base`;

    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(`A base already exists at ${path}.`);
      return;
    }

    const base = {
      filters: {
        and: [`file.hasTag("${tag}")`, 'file.ext == "md"'],
      },
      views: [
        {
          type: "table",
          name: `All ${name.toLowerCase()}`,
          order: ["file.name", "file.mtime"],
        },
      ],
    };

    try {
      await this.ensureFolder(folder);
      await this.app.vault.create(path, stringifyYaml(base));
      new Notice(`Created supertag #${tag}`);
      this.close();
      await this.plugin.rebuild();
      this.plugin.activateView();
    } catch (e) {
      console.error("[supertags] create failed", e);
      new Notice("Failed to create supertag — see console.");
    }
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (!folder) return;
    if (this.app.vault.getAbstractFileByPath(folder)) return;
    await this.app.vault.createFolder(folder).catch(() => {
      /* exists or race — ignore */
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

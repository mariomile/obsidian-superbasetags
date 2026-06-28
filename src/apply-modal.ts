import { FuzzySuggestModal, type App, type TFile } from "obsidian";
import type SupertagsPlugin from "./main";
import type { Supertag } from "./types";

/** Fuzzy picker to apply a supertag to a given note. */
export class ApplyModal extends FuzzySuggestModal<Supertag> {
  constructor(app: App, private plugin: SupertagsPlugin, private file: TFile) {
    super(app);
    this.setPlaceholder(`Apply supertag to "${file.basename}"…`);
  }

  getItems(): Supertag[] {
    return this.plugin.registry.supertags;
  }

  getItemText(st: Supertag): string {
    return `${st.icon} ${st.baseName}  ${st.tag}`;
  }

  onChooseItem(st: Supertag): void {
    void this.plugin.applyToFile(this.file, st);
  }
}

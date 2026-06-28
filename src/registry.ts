import { getAllTags, type App } from "obsidian";
import { scanBases, type ScanOptions } from "./base-scanner";
import { iconFor } from "./icons";
import type { BaseView, Supertag, SupertagOverride } from "./types";

export interface RegistryDeps {
  app: App;
  getScanOptions: () => ScanOptions;
  getOverrides: () => Record<string, SupertagOverride>;
  getDefaultIcon: () => string;
}

/**
 * Holds the resolved supertags and plain views. Rebuilt from the vault on
 * demand (load, base file change) and recounted on metadata change.
 */
export class SupertagRegistry {
  supertags: Supertag[] = [];
  views: BaseView[] = [];

  constructor(private deps: RegistryDeps) {}

  /** Count notes per bare tag (no leading #), de-duped per file. */
  private countTags(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const f of this.deps.app.vault.getMarkdownFiles()) {
      const cache = this.deps.app.metadataCache.getFileCache(f);
      if (!cache) continue;
      const tags = getAllTags(cache) ?? [];
      const seen = new Set<string>();
      for (const t of tags) {
        const bare = t.replace(/^#/, "");
        if (seen.has(bare)) continue;
        seen.add(bare);
        counts.set(bare, (counts.get(bare) ?? 0) + 1);
      }
    }
    return counts;
  }

  /** Full rebuild: rescan bases, recompute counts, merge overrides. */
  async rebuild(): Promise<void> {
    const scanned = await scanBases(this.deps.app, this.deps.getScanOptions());
    const counts = this.countTags();
    const overrides = this.deps.getOverrides();
    const defaultIcon = this.deps.getDefaultIcon();

    const byTag = new Map<string, Supertag>();
    const views: BaseView[] = [];

    for (const b of scanned) {
      if (!b.tag) {
        views.push({ name: b.name, path: b.path });
        continue;
      }
      if (byTag.has(b.tag)) continue; // first base wins for a given tag
      const ov = overrides[b.tag] ?? {};
      byTag.set(b.tag, {
        tag: b.tag,
        baseName: b.name,
        basePath: b.path,
        fields: ov.fields ?? b.fields,
        icon: ov.icon ?? iconFor(b.tag, defaultIcon),
        pinned: ov.pinned ?? false,
        group: ov.group,
        memberCount: counts.get(b.tag) ?? 0,
      });
    }

    this.supertags = sortSupertags([...byTag.values()]);
    this.views = views.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Cheap recount without rescanning base files (metadata-change path). */
  recount(): void {
    const counts = this.countTags();
    for (const st of this.supertags) {
      st.memberCount = counts.get(st.tag) ?? 0;
    }
  }

  find(tag: string): Supertag | undefined {
    return this.supertags.find((s) => s.tag === tag);
  }
}

/** Pinned first, then alphabetical by display name. */
export function sortSupertags(list: Supertag[]): Supertag[] {
  return list.sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || a.baseName.localeCompare(b.baseName)
  );
}

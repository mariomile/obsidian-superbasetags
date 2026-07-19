import { getAllTags, TFile, type App } from "obsidian";
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

  /**
   * Count notes per bare tag (no leading #). Uses the metadata cache's
   * pre-computed global tag counts — O(distinct tags) instead of walking every
   * file on each recount. Occurrence-based like Obsidian's own tag pane; for
   * frontmatter `type/*` tags that is one per note.
   */
  private countTags(): Map<string, number> {
    // getTags() is a real MetadataCache method (powers the core tag pane) but is
    // absent from the public typings — access it defensively.
    const cache = this.deps.app.metadataCache as unknown as {
      getTags?: () => Record<string, number>;
    };
    return normalizeTagCounts(cache.getTags?.() ?? {});
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
        memberCount: counts.get(b.tag.toLowerCase()) ?? 0,
      });
    }

    this.supertags = sortSupertags([...byTag.values()]);
    this.views = views.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Cheap recount without rescanning base files (metadata-change path). */
  recount(): void {
    const counts = this.countTags();
    for (const st of this.supertags) {
      st.memberCount = counts.get(st.tag.toLowerCase()) ?? 0;
    }
  }

  /**
   * Notes carrying a tag, capped at `limit` for the expandable preview. Scans
   * lazily (only when a row is expanded), stopping once the cap is reached.
   */
  membersOf(tag: string, limit = 100): TFile[] {
    const want = tag.toLowerCase();
    const out: TFile[] = [];
    const cap = Math.max(1, Math.min(limit, 500));
    for (const f of this.deps.app.vault.getMarkdownFiles()) {
      const cache = this.deps.app.metadataCache.getFileCache(f);
      if (!cache) continue;
      const tags = getAllTags(cache) ?? [];
      if (tags.some((t) => t.replace(/^#/, "").toLowerCase() === want)) {
        out.push(f);
        if (out.length >= cap) break;
      }
    }
    return out.sort((a, b) => a.basename.localeCompare(b.basename));
  }

  find(tag: string): Supertag | undefined {
    return this.supertags.find((s) => s.tag === tag);
  }
}

/**
 * Fold a raw `#tag → count` map (as returned by metadataCache.getTags()) into a
 * bare, lowercased map, summing collisions from casing differences.
 */
export function normalizeTagCounts(raw: Record<string, number>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [tag, n] of Object.entries(raw)) {
    const bare = tag.replace(/^#/, "").toLowerCase();
    counts.set(bare, (counts.get(bare) ?? 0) + n);
  }
  return counts;
}

/** Pinned first, then alphabetical by display name. */
export function sortSupertags(list: Supertag[]): Supertag[] {
  return list.sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || a.baseName.localeCompare(b.baseName)
  );
}

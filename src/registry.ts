import { getAllTags, TFile, type App, type CachedMetadata, type TAbstractFile } from "obsidian";
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

  /**
   * membersOf results per lowercased tag, then per cap. Each entry is exactly
   * what a fresh scan would return; metadataChanged/invalidateMembers drop the
   * affected tags.
   */
  private memberCache = new Map<string, Map<number, TFile[]>>();
  /**
   * Last-seen normalized tags per file, from member scans and "changed" events.
   * Every retained cached list is consistent with these tags (a scan reconciles
   * before overwriting one), so metadataChanged can trust them. Entries can
   * outlive the last cached list until the next empty-cache event, rebuild or
   * folder event clears them; at most one per markdown file.
   */
  private tagWitness = new Map<TFile, Set<string>>();
  /** Bumped per rebuild start; only the latest rebuild publishes. */
  private rebuildGeneration = 0;

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
    const generation = ++this.rebuildGeneration;
    // Structural reset: start member previews from a cold, fully scanned state.
    this.memberCache.clear();
    this.tagWitness.clear();
    const scanned = await scanBases(this.deps.app, this.deps.getScanOptions());
    // A later rebuild started while this scan was held: its result is newer.
    if (generation !== this.rebuildGeneration) return;
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
    const cap = Math.max(1, Math.min(limit, 500));
    const cached = this.memberCache.get(want)?.get(cap);
    if (cached) return cached.slice();

    const retained = this.trackRetained();
    const out: TFile[] = [];
    for (const f of this.deps.app.vault.getMarkdownFiles()) {
      retained?.pass(f);
      const cache = this.deps.app.metadataCache.getFileCache(f);
      const tags = cache ? fileTagSet(cache) : null;
      // Metadata may have changed before its "changed" event reaches us: keep
      // older cached lists coherent with what this scan sees before the
      // witness they rely on is replaced.
      const before = this.tagWitness.get(f);
      if (retained && !(tags && before && sameTags(before, tags))) {
        retained.reconcile(f, tags ?? new Set<string>());
      }
      if (!tags) {
        this.tagWitness.delete(f);
        continue;
      }
      this.tagWitness.set(f, tags);
      if (tags.has(want)) {
        out.push(f);
        if (out.length >= cap) break;
      }
    }
    out.sort((a, b) => a.basename.localeCompare(b.basename));

    let byCap = this.memberCache.get(want);
    if (!byCap) this.memberCache.set(want, (byCap = new Map<number, TFile[]>()));
    byCap.set(cap, out.slice());
    return out;
  }

  /**
   * Bookkeeping for a cold scan over the lists already cached. The scan walks
   * vault order, so it knows how many members of each list precede the current
   * file: a carrier missing from a full list is beyond its cut (harmless) only
   * once every member has been passed. Cost: one Map lookup per scanned file,
   * plus one pass over the cached lists for files whose tags changed or were
   * never witnessed.
   */
  private trackRetained() {
    if (this.memberCache.size === 0) return null;
    const lists: { tag: string; cap: number; members: Set<TFile>; passed: number }[] = [];
    const byMember = new Map<TFile, (typeof lists)[number][]>();
    for (const [tag, byCap] of this.memberCache) {
      for (const [cap, list] of byCap) {
        const entry = { tag, cap, members: new Set(list), passed: 0 };
        lists.push(entry);
        for (const f of list) {
          const at = byMember.get(f);
          if (at) at.push(entry);
          else byMember.set(f, [entry]);
        }
      }
    }
    return {
      pass: (f: TFile) => {
        for (const entry of byMember.get(f) ?? []) entry.passed++;
      },
      // Same staleness rule as metadataChanged, with position as the evidence.
      reconcile: (f: TFile, now: Set<string>) => {
        for (const { tag, cap, members, passed } of lists) {
          if (!this.memberCache.has(tag)) continue;
          const stale = members.has(f)
            ? !now.has(tag)
            : now.has(tag) && !(members.size === cap && passed === members.size);
          if (stale) this.memberCache.delete(tag);
        }
      },
    };
  }

  /**
   * Metadata-only change (metadataCache "changed"): vault order and names are
   * untouched, so a cached list of the first `cap` carriers changes only if the
   * file left it (lost the tag) or joined it (gained the tag inside the prefix).
   * A carrier outside a full list that already carried the tag cannot join.
   * Unknown previous tags count as a gain.
   */
  metadataChanged(file: TFile): void {
    if (this.memberCache.size === 0) {
      this.tagWitness.clear();
      return;
    }
    const current = this.deps.app.metadataCache.getFileCache(file);
    const now = current ? fileTagSet(current) : new Set<string>();
    const before = this.tagWitness.get(file);
    for (const [tag, byCap] of this.memberCache) {
      for (const [cap, list] of byCap) {
        const stale = list.includes(file)
          ? !now.has(tag)
          : now.has(tag) && !(before?.has(tag) && list.length === cap);
        if (stale) {
          this.memberCache.delete(tag);
          break;
        }
      }
    }
    if (current) this.tagWitness.set(file, now);
    else this.tagWitness.delete(file);
  }

  /**
   * Structural events (create/delete/rename, metadata "deleted") can change
   * vault order or a member's name: drop every cached tag the file carries now
   * or carried before, or whose cached list contains it. Pass `previous`
   * metadata when the event supplies it. Non-file events (folder rename/delete)
   * drop everything.
   */
  invalidateMembers(file: TAbstractFile, previous?: CachedMetadata | null): void {
    if (this.memberCache.size === 0) {
      this.tagWitness.clear();
      return;
    }
    if (!(file instanceof TFile)) {
      this.memberCache.clear();
      this.tagWitness.clear();
      return;
    }
    this.tagWitness.delete(file);
    const current = this.deps.app.metadataCache.getFileCache(file);
    const affected = current ? fileTagSet(current) : new Set<string>();
    if (previous) for (const t of fileTagSet(previous)) affected.add(t);
    for (const [tag, byCap] of this.memberCache) {
      if (affected.has(tag) || [...byCap.values()].some((list) => list.includes(file))) {
        this.memberCache.delete(tag);
      }
    }
  }

  find(tag: string): Supertag | undefined {
    return this.supertags.find((s) => s.tag === tag);
  }
}

function sameTags(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

/** A note's tags as bare, lowercased names (the membersOf match key). */
function fileTagSet(cache: CachedMetadata): Set<string> {
  return new Set((getAllTags(cache) ?? []).map((t) => t.replace(/^#/, "").toLowerCase()));
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

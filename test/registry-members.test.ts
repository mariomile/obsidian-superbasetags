import { beforeEach, describe, expect, it, vi } from "vitest";

// Test caches are `{ tags: string[] }`; getAllTags returns them verbatim.
// Every .base file scans as the supertag `type/person`.
vi.mock("obsidian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("obsidian")>()),
  getAllTags: (cache: { tags?: string[] }) => cache.tags ?? [],
  parseYaml: () => ({ filters: 'file.hasTag("type/person")' }),
}));

import { TFile, TFolder } from "obsidian";
import { SupertagRegistry } from "../src/registry";
import SupertagsPlugin from "../src/main";

type Cache = { tags: string[] };

/** Ordered like Obsidian's fileMap: rename re-inserts the key at the end. */
class FakeVault {
  files = new Map<string, TFile>();
  caches = new Map<TFile, Cache>();
  lookups = 0;
  tagCounts: Record<string, number> = {};

  add(path: string, tags: string[] | null): TFile {
    const f = Object.assign(new TFile(), {
      path,
      basename: path.replace(/^.*\//, "").replace(/\.[^.]+$/, ""),
      extension: path.split(".").pop(),
    });
    this.files.set(path, f);
    if (tags) this.caches.set(f, { tags });
    return f;
  }
  setTags(f: TFile, tags: string[]): void {
    this.caches.set(f, { tags });
  }
  rename(f: TFile, path: string): void {
    this.files.delete(f.path);
    Object.assign(f, {
      path,
      basename: path.replace(/^.*\//, "").replace(/\.[^.]+$/, ""),
      extension: path.split(".").pop(),
    });
    this.files.set(path, f);
  }
  remove(f: TFile): Cache | null {
    this.files.delete(f.path);
    const prev = this.caches.get(f) ?? null;
    this.caches.delete(f);
    return prev;
  }

  app() {
    return {
      vault: {
        getMarkdownFiles: () => [...this.files.values()].filter((f) => f.extension === "md"),
        getFiles: () => [...this.files.values()],
        cachedRead: async () => "",
      },
      metadataCache: {
        getFileCache: (f: TFile) => {
          this.lookups++;
          return this.caches.get(f) ?? null;
        },
        getTags: () => this.tagCounts,
      },
    };
  }
}

/** The pre-cache membersOf, verbatim: the behavior the cache must match. */
function referenceMembersOf(v: FakeVault, tag: string, limit = 100): TFile[] {
  const want = tag.toLowerCase();
  const out: TFile[] = [];
  const cap = Math.max(1, Math.min(limit, 500));
  for (const f of [...v.files.values()].filter((x) => x.extension === "md")) {
    const cache = v.caches.get(f);
    if (!cache) continue;
    if (cache.tags.some((t) => t.replace(/^#/, "").toLowerCase() === want)) {
      out.push(f);
      if (out.length >= cap) break;
    }
  }
  return out.sort((a, b) => a.basename.localeCompare(b.basename));
}

function makeRegistry(v: FakeVault) {
  return new SupertagRegistry({
    app: v.app() as never,
    getScanOptions: () => ({ prefix: "type/", scopeFolders: [] }),
    getOverrides: () => ({}),
    getDefaultIcon: () => "tag",
  });
}

const names = (fs: TFile[]) => fs.map((f) => f.path);

describe("membersOf cache: workcount", () => {
  it("sparse 4330 files x 3 expanded tags: unrelated edit no longer rescans", () => {
    const v = new FakeVault();
    for (let i = 0; i < 4330; i++) v.add(`n${i}.md`, [`#other/${i % 7}`]);
    v.setTags([...v.files.values()][100], ["#type/a"]);
    v.setTags([...v.files.values()][2000], ["#type/b"]);
    v.setTags([...v.files.values()][4000], ["#type/c"]);
    const reg = makeRegistry(v);
    const expanded = ["type/a", "type/b", "type/c"];

    // Panel previews request 9 (8 visible + 1 to detect "more").
    for (const t of expanded) reg.membersOf(t, 9);
    expect(v.lookups).toBe(12990); // cold: same as before the cache

    // Debounced metadata refresh after editing an unrelated note.
    v.lookups = 0;
    const edited = [...v.files.values()][5];
    v.setTags(edited, ["#other/9"]);
    reg.metadataChanged(edited);
    for (const t of expanded) expect(names(reg.membersOf(t, 9))).toEqual(names(referenceMembersOf(v, t, 9)));
    expect(v.lookups).toBe(1); // was 12990 per refresh: one lookup for the event

    // Repeated refreshes with no events: zero metadata lookups.
    v.lookups = 0;
    for (let i = 0; i < 5; i++) for (const t of expanded) reg.membersOf(t, 9);
    expect(v.lookups).toBe(0);
  });

  it("body-only edits of a note carrying ALL expanded tags rescan nothing", () => {
    const v = new FakeVault();
    for (let i = 0; i < 4330; i++) v.add(`n${i}.md`, [`#other/${i % 7}`]);
    const all = [...v.files.values()][1234];
    v.setTags(all, ["#type/a", "#type/b", "#type/c", "#other/1"]);
    v.setTags([...v.files.values()][2000], ["#type/b"]);
    const reg = makeRegistry(v);
    const expanded = ["type/a", "type/b", "type/c"];
    for (const t of expanded) reg.membersOf(t, 9);
    expect(v.lookups).toBe(12990); // cold

    // Each body edit re-parses metadata: a fresh cache object, same tags
    // (different casing and order, which normalize to the same set).
    for (let edit = 0; edit < 5; edit++) {
      v.lookups = 0;
      v.setTags(all, edit % 2 ? ["#other/1", "#TYPE/C", "#type/b", "#Type/A"] : ["#type/a", "#type/b", "#type/c", "#other/1"]);
      reg.metadataChanged(all);
      for (const t of expanded) expect(names(reg.membersOf(t, 9))).toEqual(names(referenceMembersOf(v, t, 9)));
      expect(v.lookups).toBe(1); // was 12990 + 1: every carried tag rescanned
    }
  });

  it("a gained tag rescans only that tag", () => {
    const v = new FakeVault();
    for (let i = 0; i < 1000; i++) v.add(`n${i}.md`, ["#x"]);
    const a = v.add("a.md", ["#type/a"]);
    const b = v.add("b.md", ["#type/b"]);
    const reg = makeRegistry(v);
    reg.membersOf("type/a", 9);
    reg.membersOf("type/b", 9);
    v.lookups = 0;
    v.setTags(a, ["#type/a", "#y"]); // unchanged membership: no rescan
    reg.metadataChanged(a);
    reg.membersOf("type/a", 9);
    reg.membersOf("type/b", 9);
    expect(v.lookups).toBe(1);
    v.lookups = 0;
    v.setTags(b, ["#type/b", "#type/a"]); // b joins type/a only
    reg.metadataChanged(b);
    expect(names(reg.membersOf("type/a", 9))).toEqual(["a.md", "b.md"]);
    expect(names(reg.membersOf("type/b", 9))).toEqual(["b.md"]);
    expect(v.lookups).toBe(1 + 1002); // event + one rescan of type/a
  });

  it("dense capped tag: carrier past the cut is rescanned once, then free", () => {
    const v = new FakeVault();
    for (let i = 0; i < 2000; i++) v.add(`n${i}.md`, ["#x"]);
    for (let i = 0; i < 20; i++) v.add(`m${i}.md`, ["#type/p"]);
    const late = v.files.get("m15.md")!; // carrier never inspected by the cap-9 scan
    const reg = makeRegistry(v);
    reg.membersOf("type/p", 9);
    v.lookups = 0;
    reg.metadataChanged(late); // previous tags unknown: conservative rescan
    expect(names(reg.membersOf("type/p", 9))).toEqual(names(referenceMembersOf(v, "type/p", 9)));
    expect(v.lookups).toBe(1 + 2009);
    v.lookups = 0;
    reg.metadataChanged(late); // now known to carry it, outside the full list
    expect(names(reg.membersOf("type/p", 9))).toEqual(names(referenceMembersOf(v, "type/p", 9)));
    expect(v.lookups).toBe(1);
  });
});

describe("membersOf cache: freshness", () => {
  let v: FakeVault;
  let reg: SupertagRegistry;
  beforeEach(() => {
    v = new FakeVault();
    reg = makeRegistry(v);
  });

  it("equal-count membership swap refreshes members", () => {
    const a = v.add("Alpha.md", ["#type/p"]);
    const b = v.add("Beta.md", ["#other"]);
    expect(names(reg.membersOf("type/p"))).toEqual(["Alpha.md"]);
    v.setTags(a, ["#other"]);
    reg.metadataChanged(a); // lost the tag: found via the cached list
    expect(reg.membersOf("type/p")).toEqual([]);
    v.setTags(b, ["#type/p"]);
    reg.metadataChanged(b); // gained the tag: found via current tags
    expect(names(reg.membersOf("type/p"))).toEqual(["Beta.md"]);
  });

  it("equal-count swap on the all-tags carrier refreshes every tag", () => {
    const a = v.add("Alpha.md", ["#type/a", "#type/b", "#type/c"]);
    const b = v.add("Beta.md", ["#other"]);
    for (const t of ["type/a", "type/b", "type/c"]) reg.membersOf(t, 9);
    v.setTags(a, ["#other"]);
    reg.metadataChanged(a);
    v.setTags(b, ["#type/a", "#type/b", "#type/c"]);
    reg.metadataChanged(b);
    for (const t of ["type/a", "type/b", "type/c"]) expect(names(reg.membersOf(t, 9))).toEqual(["Beta.md"]);
  });

  it("a scanned non-carrier inside a full list's prefix joins when it gains the tag", () => {
    const early = v.add("early.md", ["#x"]);
    for (let i = 0; i < 12; i++) v.add(`m${i}.md`, ["#type/p"]);
    expect(names(reg.membersOf("type/p", 9))).not.toContain("early.md");
    v.setTags(early, ["#x", "#type/p"]); // known previous tags: a real gain
    reg.metadataChanged(early);
    expect(names(reg.membersOf("type/p", 9))).toEqual(names(referenceMembersOf(v, "type/p", 9)));
    expect(names(reg.membersOf("type/p", 9))).toContain("early.md");
  });

  it("a file unreadable at scan time forgets its previous tags", () => {
    const x = v.add("x.md", ["#type/p"]);
    const m0 = v.add("m0.md", ["#type/p"]);
    for (let i = 1; i < 12; i++) v.add(`m${i}.md`, ["#type/p"]);
    v.add("q.md", ["#type/q"]);
    reg.membersOf("type/p", 9); // learns x carries type/p
    reg.membersOf("type/q", 9); // keeps the cache (and witness) alive
    v.caches.delete(x); // unreadable, no event (re-index in flight)
    v.setTags(m0, []);
    reg.metadataChanged(m0); // drops type/p only
    expect(names(reg.membersOf("type/p", 9))).not.toContain("x.md"); // skips x
    v.setTags(x, ["#type/p"]);
    reg.metadataChanged(x); // x's previous tags must be unknown now: a gain
    expect(names(reg.membersOf("type/p", 9))).toEqual(names(referenceMembersOf(v, "type/p", 9)));
    expect(names(reg.membersOf("type/p", 9))).toContain("x.md");
  });

  it("previous-tag memory is bounded by the cache lifecycle", () => {
    const a = v.add("Alpha.md", ["#type/p"]);
    v.add("Beta.md", ["#x"]);
    const witness = () => (reg as unknown as { tagWitness: Map<TFile, unknown> }).tagWitness;
    reg.membersOf("type/p");
    expect(witness().size).toBe(2); // only scanned files
    const prev = v.remove(a);
    reg.invalidateMembers(a, prev);
    expect(witness().has(a)).toBe(false); // deleted files are forgotten
    reg.invalidateMembers(new TFolder());
    expect(witness().size).toBe(0);
  });

  it("metadata loss on a member drops it", () => {
    const a = v.add("Alpha.md", ["#type/p"]);
    v.add("Beta.md", ["#type/p"]);
    reg.membersOf("type/p", 9);
    v.caches.delete(a);
    reg.metadataChanged(a);
    expect(names(reg.membersOf("type/p", 9))).toEqual(["Beta.md"]);
  });

  it("metadata change with nothing cached is a no-op and keeps no witness", () => {
    const a = v.add("Alpha.md", ["#type/p"]);
    v.lookups = 0;
    reg.metadataChanged(a);
    expect(v.lookups).toBe(0);
    expect(names(reg.membersOf("type/p"))).toEqual(["Alpha.md"]);
  });

  it("rename of an all-tags carrier still refreshes names", () => {
    const a = v.add("Alpha.md", ["#type/a", "#type/b"]);
    v.add("Beta.md", ["#type/a", "#type/b"]);
    reg.membersOf("type/a");
    reg.membersOf("type/b");
    reg.metadataChanged(a); // body edit first: kept
    v.rename(a, "Zulu.md");
    reg.invalidateMembers(a);
    for (const t of ["type/a", "type/b"]) expect(reg.membersOf(t).map((f) => f.basename)).toEqual(["Beta", "Zulu"]);
  });

  it("rename refreshes name and sort without any tag change", () => {
    const a = v.add("Alpha.md", ["#type/p"]);
    v.add("Beta.md", ["#type/p"]);
    expect(reg.membersOf("type/p").map((f) => f.basename)).toEqual(["Alpha", "Beta"]);
    v.rename(a, "Zulu.md");
    reg.invalidateMembers(a);
    expect(reg.membersOf("type/p").map((f) => f.basename)).toEqual(["Beta", "Zulu"]);
  });

  it("rename refreshes even if metadata is not yet readable at the event", () => {
    const a = v.add("Alpha.md", ["#type/p"]);
    reg.membersOf("type/p");
    const tags = v.caches.get(a)!;
    v.caches.delete(a);
    v.rename(a, "Zulu.md");
    reg.invalidateMembers(a);
    v.caches.set(a, tags);
    expect(reg.membersOf("type/p").map((f) => f.basename)).toEqual(["Zulu"]);
  });

  it("metadata delete uses the previous tags when the file is no longer listed", () => {
    // A same-path replacement object: identity cannot match, previous tags must.
    const a = v.add("Alpha.md", ["#type/p"]);
    reg.membersOf("type/p");
    const prev = v.remove(a);
    const ghost = v.add("Alpha.md", null);
    v.files.delete("Alpha.md");
    reg.invalidateMembers(ghost, prev);
    expect(reg.membersOf("type/p")).toEqual([]);
  });

  it("rename moves a capped member to the end of vault order", () => {
    const first = v.add("m0.md", ["#type/p"]);
    for (let i = 1; i < 12; i++) v.add(`m${i}.md`, ["#type/p"]);
    reg.membersOf("type/p", 9);
    v.rename(first, "z/m0.md");
    reg.invalidateMembers(first);
    expect(names(reg.membersOf("type/p", 9))).toEqual(names(referenceMembersOf(v, "type/p", 9)));
    expect(names(reg.membersOf("type/p", 9))).not.toContain("z/m0.md");
  });

  it("delete via vault and metadata events refreshes members", () => {
    const a = v.add("Alpha.md", ["#type/p"]);
    v.add("Beta.md", ["#type/p"]);
    reg.membersOf("type/p");
    const prev = v.remove(a);
    reg.invalidateMembers(a, prev);
    expect(names(reg.membersOf("type/p"))).toEqual(["Beta.md"]);
  });

  it("folder events drop everything", () => {
    v.add("Alpha.md", ["#type/p"]);
    reg.membersOf("type/p");
    v.lookups = 0;
    reg.invalidateMembers(new TFolder());
    reg.membersOf("type/p");
    expect(v.lookups).toBe(1);
  });

  it("tag case and leading # normalize like the scan", () => {
    const a = v.add("Alpha.md", ["#other"]);
    reg.membersOf("Type/Person");
    v.setTags(a, ["#TYPE/person"]);
    reg.metadataChanged(a);
    expect(names(reg.membersOf("type/PERSON"))).toEqual(["Alpha.md"]);
    expect(names(reg.membersOf("Type/Person"))).toEqual(["Alpha.md"]);
  });

  it("dense tag keeps vault order cap before sort, per cap size", () => {
    for (const n of ["k", "j", "i", "h", "g", "f", "e", "d", "c", "b", "a"]) v.add(`${n}.md`, ["#type/p"]);
    // First 9 in vault order (k..c), then sorted: a and b are never included.
    expect(reg.membersOf("type/p", 9).map((f) => f.basename)).toEqual(["c", "d", "e", "f", "g", "h", "i", "j", "k"]);
    expect(reg.membersOf("type/p", 100)).toHaveLength(11);
    expect(names(reg.membersOf("type/p", 9))).toEqual(names(referenceMembersOf(v, "type/p", 9)));
  });

  it("callers cannot corrupt the cache by mutating results", () => {
    v.add("Alpha.md", ["#type/p"]);
    reg.membersOf("type/p").length = 0; // cold result
    reg.membersOf("type/p").length = 0; // cached result
    expect(names(reg.membersOf("type/p"))).toEqual(["Alpha.md"]);
  });

  it("files without metadata are skipped until their changed event", () => {
    const a = v.add("Alpha.md", null);
    reg.invalidateMembers(a); // create
    expect(reg.membersOf("type/p")).toEqual([]);
    v.setTags(a, ["#type/p"]);
    reg.metadataChanged(a); // metadataCache "changed"
    expect(names(reg.membersOf("type/p"))).toEqual(["Alpha.md"]);
  });

  it.each([7, 42, 1337])("matches a fresh scan across random event sequences (seed %i)", (initialSeed) => {
    let seed = initialSeed; // mulberry32
    const rnd = (n: number) => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (((t ^ (t >>> 14)) >>> 0) % n);
    };
    const pool = ["#type/a", "#type/A", "#type/b", "#other"];
    const live: TFile[] = [];
    for (let i = 0; i < 40; i++) live.push(v.add(`f${i}.md`, [pool[rnd(4)]]));
    let created = 40;
    for (let step = 0; step < 600; step++) {
      for (const [t, cap] of [["type/a", 9], ["type/b", 9], ["type/a", 100], ["type/b", 3]] as const) {
        expect(names(reg.membersOf(t, cap))).toEqual(names(referenceMembersOf(v, t, cap)));
      }
      const f = live[rnd(live.length)];
      switch (rnd(4)) {
        case 0:
          // Includes body-only edits: the same tags drawn again.
          if (rnd(2)) v.setTags(f, [...(v.caches.get(f)?.tags ?? [])]);
          else v.setTags(f, rnd(3) ? [pool[rnd(4)]] : [pool[rnd(4)], pool[rnd(4)]]);
          reg.metadataChanged(f);
          break;
        case 1:
          v.rename(f, `r${step}-${rnd(1000)}.md`);
          reg.invalidateMembers(f);
          break;
        case 2:
          if (live.length > 10) {
            live.splice(live.indexOf(f), 1);
            const prev = v.remove(f);
            reg.invalidateMembers(f);
            reg.invalidateMembers(f, prev);
          }
          break;
        default: {
          const n = v.add(`c${created++}.md`, null);
          live.push(n);
          reg.invalidateMembers(n);
          v.setTags(n, [pool[rnd(4)]]);
          reg.metadataChanged(n);
        }
      }
    }
  });
});

describe("membersOf cache: metadata seen by a cold scan before its event", () => {
  let v: FakeVault;
  let reg: SupertagRegistry;
  let early: TFile;
  beforeEach(() => {
    v = new FakeVault();
    reg = makeRegistry(v);
    early = v.add("early.md", ["#other"]);
    for (let i = 0; i < 10; i++) v.add(`m${i}.md`, ["#type/p"]);
    v.add("q.md", ["#type/q"]);
    expect(names(reg.membersOf("type/p", 9))).toEqual(names(referenceMembersOf(v, "type/p", 9)));
  });
  const exact = () => {
    for (const cap of [9, 3]) expect(names(reg.membersOf("type/p", cap))).toEqual(names(referenceMembersOf(v, "type/p", cap)));
  };

  it.each([
    ["another tag", () => reg.membersOf("type/q", 9)],
    ["another cap of the same tag", () => reg.membersOf("type/p", 3)],
  ])("gain inside a full list's prefix survives no event when %s scans first", (_label, coldScan) => {
    v.setTags(early, ["#other", "#type/p"]); // readable before our handler runs
    coldScan();
    reg.metadataChanged(early);
    exact();
    expect(names(reg.membersOf("type/p", 9))).toContain("early.md");
    for (let i = 0; i < 3; i++) {
      v.setTags(early, i % 2 ? ["#TYPE/P", "#other"] : ["#other", "#type/p"]); // body edits
      reg.metadataChanged(early);
      exact();
    }
  });

  it("gain after an unreadable scan, then a readable cold scan, then the event", () => {
    const keep = v.caches.get(early)!;
    v.caches.delete(early); // re-index in flight, no event yet
    reg.membersOf("type/q", 9);
    v.caches.set(early, keep);
    v.setTags(early, ["#type/p"]);
    reg.membersOf("type/r", 9);
    reg.metadataChanged(early);
    exact();
    expect(names(reg.membersOf("type/p", 9))).toContain("early.md");
  });

  it("a member's loss seen by another cold scan before its event", () => {
    const m0 = v.files.get("m0.md")!;
    v.setTags(m0, ["#other"]);
    reg.membersOf("type/q", 9);
    reg.metadataChanged(m0);
    exact();
  });

  it("a member going unreadable during another cold scan is not kept", () => {
    const m0 = v.files.get("m0.md")!;
    v.caches.delete(m0);
    reg.membersOf("type/q", 9);
    exact(); // matches a fresh scan even before any event
    v.setTags(m0, ["#type/p"]);
    reg.metadataChanged(m0);
    exact();
  });

  it("a cached read before the event is the pre-event list; the event refreshes it", () => {
    const old = names(reg.membersOf("type/p", 9));
    v.setTags(early, ["#type/p"]);
    expect(names(reg.membersOf("type/p", 9))).toEqual(old); // handler not run yet
    reg.metadataChanged(early);
    exact();
  });

  it("carriers past a full list's cut do not drop it during another scan", () => {
    const d = new FakeVault();
    for (let i = 0; i < 30; i++) d.add(`m${i}.md`, ["#type/p"]);
    for (let i = 0; i < 2000; i++) d.add(`n${i}.md`, ["#x"]);
    d.add("q.md", ["#type/q"]);
    const r = makeRegistry(d);
    r.membersOf("type/p", 9); // stops at m8: m9..m29 never witnessed
    r.membersOf("type/q", 9); // sees m9..m29 carrying type/p for the first time
    d.lookups = 0;
    expect(names(r.membersOf("type/p", 9))).toEqual(names(referenceMembersOf(d, "type/p", 9)));
    expect(d.lookups).toBe(0); // still cached
  });

  it.each([1, 3, 4])("random interleavings of reads, cold scans and late events (seed %i)", (initialSeed) => {
    let seed = initialSeed; // mulberry32
    const rnd = (n: number) => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (((t ^ (t >>> 14)) >>> 0) % n);
    };
    const w = new FakeVault();
    const r = makeRegistry(w);
    const pool = ["#type/a", "#type/A", "#type/b", "#type/c", "#other"];
    const live: TFile[] = [];
    for (let i = 0; i < 30; i++) live.push(w.add(`f${i}.md`, [pool[rnd(5)]]));
    const queries = [["type/a", 9], ["type/a", 3], ["type/b", 3], ["type/c", 9], ["type/b", 100]] as const;
    const pending: TFile[] = []; // metadata already readable, "changed" not delivered
    const flush = () => {
      while (pending.length) r.metadataChanged(pending.splice(rnd(pending.length), 1)[0]);
    };
    for (let step = 0; step < 3000; step++) {
      const f = live[rnd(live.length)];
      switch (rnd(6)) {
        case 0:
        case 1:
          // Metadata visible now, its event later (body edits included).
          if (rnd(4) === 0) w.caches.delete(f);
          else if (rnd(3) === 0) w.setTags(f, [...(w.caches.get(f)?.tags ?? [])]);
          else w.setTags(f, rnd(2) ? [pool[rnd(5)]] : [pool[rnd(5)], pool[rnd(5)]]);
          pending.push(f);
          break;
        case 2: {
          // Any read, cached or cold, between the change and its event.
          const [t, cap] = queries[rnd(queries.length)];
          r.membersOf(t, cap);
          break;
        }
        case 3:
          if (pending.length) r.metadataChanged(pending.splice(rnd(pending.length), 1)[0]);
          break;
        case 4:
          flush();
          w.rename(f, `r${step}.md`);
          r.invalidateMembers(f);
          break;
        default:
          flush();
          for (const [t, cap] of queries) expect(names(r.membersOf(t, cap))).toEqual(names(referenceMembersOf(w, t, cap)));
      }
    }
    flush();
    for (const [t, cap] of queries) expect(names(r.membersOf(t, cap))).toEqual(names(referenceMembersOf(w, t, cap)));
  });
});

describe("rebuild", () => {
  it("a held older rebuild cannot overwrite a newer one", async () => {
    const v = new FakeVault();
    v.add("People.base", null);
    v.tagCounts = { "#type/person": 1 };
    let release!: () => void;
    const app = v.app();
    const held = new Promise<string>((r) => (release = () => r("")));
    let calls = 0;
    app.vault.cachedRead = () => (calls++ === 0 ? held : Promise.resolve(""));
    const r = new SupertagRegistry({
      app: app as never,
      getScanOptions: () => ({ prefix: "type/", scopeFolders: [] }),
      getOverrides: () => ({}),
      getDefaultIcon: () => "tag",
    });
    const older = r.rebuild();
    v.tagCounts = { "#type/person": 2 };
    await r.rebuild();
    expect(r.supertags[0].memberCount).toBe(2);
    const published = r.supertags;
    v.files.clear(); // the held scan would now publish nothing
    release();
    await older;
    expect(r.supertags).toBe(published);
  });

  it("counts published after a held scan reflect metadata changed meanwhile", async () => {
    const v = new FakeVault();
    v.add("People.base", null);
    v.tagCounts = { "#type/person": 1 };
    const app = v.app();
    let release!: () => void;
    app.vault.cachedRead = () => new Promise<string>((r) => (release = () => r("")));
    const r = new SupertagRegistry({
      app: app as never,
      getScanOptions: () => ({ prefix: "type/", scopeFolders: [] }),
      getOverrides: () => ({}),
      getDefaultIcon: () => "tag",
    });
    const pending = r.rebuild();
    await Promise.resolve();
    v.tagCounts = { "#type/person": 5 };
    r.recount(); // debounced recount lands on the old list mid-rebuild
    release();
    await pending;
    expect(r.supertags[0].memberCount).toBe(5);
  });

  it("starts member previews cold", async () => {
    const v = new FakeVault();
    const a = v.add("Alpha.md", ["#type/p"]);
    const reg = makeRegistry(v);
    reg.membersOf("type/p");
    v.setTags(a, []); // change with no event: only a structural rebuild resets
    await reg.rebuild();
    expect(reg.membersOf("type/p")).toEqual([]);
  });

  it("rebuild forgets previous tags; previews stay exact across a held scan", async () => {
    const v = new FakeVault();
    v.add("People.base", null);
    for (let i = 0; i < 12; i++) v.add(`m${i}.md`, ["#type/p"]);
    const late = v.files.get("m11.md")!;
    const app = v.app();
    let release!: () => void;
    app.vault.cachedRead = () => new Promise<string>((r) => (release = () => r("")));
    const reg = new SupertagRegistry({
      app: app as never,
      getScanOptions: () => ({ prefix: "type/", scopeFolders: [] }),
      getOverrides: () => ({}),
      getDefaultIcon: () => "tag",
    });
    reg.membersOf("type/p", 9);
    reg.metadataChanged(late); // learned: late carries type/p
    const pending = reg.rebuild();
    // Change with no event while the rebuild is held, then a cold preview.
    v.setTags(late, []);
    expect(names(reg.membersOf("type/p", 9))).toEqual(names(referenceMembersOf(v, "type/p", 9)));
    v.lookups = 0;
    v.setTags(late, ["#type/p"]);
    reg.metadataChanged(late); // previous tags unknown again: rescan
    expect(names(reg.membersOf("type/p", 9))).toEqual(names(referenceMembersOf(v, "type/p", 9)));
    expect(v.lookups).toBeGreaterThan(1);
    release();
    await pending;
    expect(names(reg.membersOf("type/p", 9))).toEqual(names(referenceMembersOf(v, "type/p", 9)));
  });
});

describe("plugin wiring", () => {
  function wire(v: FakeVault, openPanels: number) {
    const handlers = new Map<string, (...a: unknown[]) => void>();
    const on = (scope: string) => (name: string, cb: (...a: unknown[]) => void) => {
      handlers.set(`${scope}:${name}`, cb);
      return {};
    };
    const base = v.app();
    const app = {
      ...base,
      vault: { ...base.vault, on: on("vault") },
      metadataCache: { ...base.metadataCache, on: on("meta") },
      workspace: { getLeavesOfType: () => Array.from({ length: openPanels }, () => ({ view: {} })) },
    };
    const plugin = new (SupertagsPlugin as unknown as new () => SupertagsPlugin)();
    const p = plugin as unknown as Record<string, unknown>;
    p.app = app;
    p.registerEvent = () => {};
    p.registry = new SupertagRegistry({
      app: app as never,
      getScanOptions: () => ({ prefix: "type/", scopeFolders: [] }),
      getOverrides: () => ({}),
      getDefaultIcon: () => "tag",
    });
    const recount = vi.fn(() => plugin.registry.recount());
    p.recountDebounced = recount;
    p.rebuildDebounced = vi.fn();
    (p.registerEventHandlers as () => void).call(plugin);
    return { plugin, handlers, recount };
  }

  it("recounts shared memberCount with the panel closed (Portal reads it)", async () => {
    const v = new FakeVault();
    v.add("People.base", null);
    v.tagCounts = { "#type/person": 1 };
    const { plugin, handlers } = wire(v, 0);
    await plugin.registry.rebuild();
    expect(plugin.registry.supertags[0].memberCount).toBe(1);

    // Real debounced callback from onload, run directly (debounce mock is sync).
    const p = plugin as unknown as Record<string, unknown>;
    p.loadData = async () => ({});
    const reg = plugin.registry;
    for (const k of ["registerView", "addRibbonIcon", "addCommand", "addSettingTab", "registerEditorSuggest"]) p[k] = () => ({});
    (p.app as { workspace: Record<string, unknown> }).workspace.onLayoutReady = () => {};
    await plugin.onload();
    p.registry = reg;
    v.tagCounts = { "#type/person": 3 };
    handlers.get("meta:changed")!(v.add("n.md", ["#type/person"]));
    expect(plugin.registry.supertags[0].memberCount).toBe(3);
  });

  it("routes each file event to member invalidation", () => {
    const v = new FakeVault();
    const a = v.add("Alpha.md", ["#type/p"]);
    v.add("Mid.md", ["#type/p"]);
    const { plugin, handlers, recount } = wire(v, 1);
    const members = () => names(plugin.registry.membersOf("type/p"));
    expect(members()).toEqual(["Alpha.md", "Mid.md"]);

    // vault rename alone (tags unchanged, sort order changes)
    v.rename(a, "Zed.md");
    handlers.get("vault:rename")!(a, "Alpha.md");
    expect(members()).toEqual(["Mid.md", "Zed.md"]);

    // metadataCache changed alone: gained the tag
    const b = v.add("Beta.md", null);
    expect(members()).toEqual(["Mid.md", "Zed.md"]);
    v.setTags(b, ["#type/p"]);
    handlers.get("meta:changed")!(b);
    expect(members()).toEqual(["Beta.md", "Mid.md", "Zed.md"]);
    expect(recount).toHaveBeenCalledTimes(1);

    // vault delete alone
    v.remove(b);
    handlers.get("vault:delete")!(b);
    expect(members()).toEqual(["Mid.md", "Zed.md"]);

    // metadataCache deleted alone
    const mid = v.files.get("Mid.md")!;
    v.remove(mid);
    handlers.get("meta:deleted")!(mid, { tags: ["#type/p"] });
    expect(members()).toEqual(["Zed.md"]);
    expect(recount).toHaveBeenCalledTimes(2);

    // vault create alone (metadata already readable)
    const c = v.add("Cee.md", ["#type/p"]);
    handlers.get("vault:create")!(c);
    expect(members()).toEqual(["Cee.md", "Zed.md"]);

    // folder rename alone
    v.rename(c, "sub/Cee.md");
    Object.assign(c, { basename: "Aaa" });
    handlers.get("vault:rename")!(new TFolder(), "old");
    expect(members()).toEqual(["sub/Cee.md", "Zed.md"]);
  });

  it("keeps previews fresh while the panel is closed, for reopen and Portal", () => {
    const v = new FakeVault();
    const a = v.add("Alpha.md", ["#type/p"]);
    const { plugin, handlers } = wire(v, 0);
    expect(names(plugin.registry.membersOf("type/p", 9))).toEqual(["Alpha.md"]);
    v.lookups = 0;
    v.setTags(a, ["#type/p"]);
    handlers.get("meta:changed")!(a); // body edit, panel closed: kept
    expect(names(plugin.registry.membersOf("type/p", 9))).toEqual(["Alpha.md"]);
    expect(v.lookups).toBe(1);
    v.setTags(a, []);
    handlers.get("meta:changed")!(a); // panel closed
    expect(plugin.registry.membersOf("type/p", 9)).toEqual([]); // panel reopens
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
  ...(await importOriginal<typeof import("obsidian")>()),
  parseYaml: () => ({ filters: 'file.hasTag("type/person")' }),
}));

import { SupertagRegistry } from "../src/registry";

function makeRegistry() {
  const getTags = vi.fn(() => ({ "#type/person": 7 }));
  const app = {
    vault: {
      getFiles: () => [{ path: "People.base", basename: "People", extension: "base" }],
      cachedRead: async () => "",
    },
    metadataCache: { getTags },
  };
  const registry = new SupertagRegistry({
    app: app as never,
    getScanOptions: () => ({ prefix: "type/", scopeFolders: [] }),
    getOverrides: () => ({}),
    getDefaultIcon: () => "tag",
  });
  return { registry, getTags };
}

describe("SupertagRegistry.rebuild", () => {
  it("counts members by default", async () => {
    const { registry, getTags } = makeRegistry();
    await registry.rebuild();
    expect(getTags).toHaveBeenCalledTimes(1);
    expect(registry.supertags[0].memberCount).toBe(7);
  });

  it("skips getTags() when counts are not needed, and recount() fills them in", async () => {
    const { registry, getTags } = makeRegistry();
    await registry.rebuild(false);
    expect(getTags).not.toHaveBeenCalled();
    expect(registry.supertags.map((s) => s.tag)).toEqual(["type/person"]);
    expect(registry.supertags[0].memberCount).toBe(0);
    registry.recount();
    expect(registry.supertags[0].memberCount).toBe(7);
  });
});

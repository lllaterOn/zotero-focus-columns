import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusColumnsPlugin } from "../src/plugin";
import { PREF_BRANCH } from "../src/constants";
import { defaultSyncableSettings } from "../src/settings";

describe("data refresh without column layout reconstruction", () => {
  const prefs = new Map<string, unknown>();
  const columns = new Map<string, any>();
  let observer: any;
  let plugin: FocusColumnsPlugin;
  let view: any;
  let rendered: string;
  let source: string;
  let rowCache: string | null;
  const item = {
    isRegularItem: () => true,
    getField: (field: string) => field === "publicationTitle" ? "Example Journal" : ""
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    prefs.clear();
    columns.clear();
    source = "before sync";
    rowCache = source;
    rendered = source;
    view = {
      selection: new Set([7, 9]),
      sort: { field: "dateAdded", direction: -1 },
      search: "bridge",
      widths: { title: 207.25, year: 76.5, status: 98.75 },
      tree: { invalidate: vi.fn(() => {
        rowCache ??= source;
        rendered = rowCache;
      }) },
      invalidateRowCache: vi.fn(() => { rowCache = null; })
    };
    vi.stubGlobal("PathUtils", { join: (...parts: string[]) => parts.join("/") });
    vi.stubGlobal("IOUtils", { exists: vi.fn(async () => false), writeUTF8: vi.fn(async () => {}) });
    vi.stubGlobal("Services", { prefs: { addObserver: vi.fn(), removeObserver: vi.fn() } });
    vi.stubGlobal("Zotero", {
      locale: "en-US",
      DataDirectory: { dir: "fixture-data" },
      Prefs: { get: (key: string) => prefs.get(key), set: (key: string, value: unknown) => prefs.set(key, value) },
      Notifier: {
        registerObserver: vi.fn((value: any) => { observer = value; return "observer"; }),
        unregisterObserver: vi.fn()
      },
      PreferencePanes: { register: vi.fn(async () => "preferences"), unregister: vi.fn() },
      ItemTreeManager: {
        registerColumn: vi.fn((option: any) => { columns.set(option.dataKey, option); return option.dataKey; }),
        unregisterColumn: vi.fn(),
        // Simulate the native rebuild's re-read of width bases. The old data
        // refresh path reaches here even if the user never saved their view.
        refreshColumns: vi.fn(() => { view.widths.title -= 2; })
      },
      ItemPaneManager: {
        registerInfoRow: vi.fn((option: any) => option.rowID),
        unregisterInfoRow: vi.fn(), refreshInfoRow: vi.fn()
      },
      getMainWindows: () => [{ ZoteroPane: { itemsView: view } }],
      logError: vi.fn()
    });
    plugin = new FocusColumnsPlugin();
    await plugin.startup({ rootURI: "chrome://focus-columns/", version: "1.2.2" });
  });

  afterEach(async () => {
    await plugin.shutdown();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([false, true])("preserves a dragged layout through sync notifications (view updated: %s)", async saved => {
    prefs.set(`${PREF_BRANCH}viewGroups.definitions`, JSON.stringify([
      { id: "reading", name: "Reading", columns: [{ key: "title", visible: true }] }
    ]));
    prefs.set(`${PREF_BRANCH}viewGroups.local`, JSON.stringify({
      activeID: "reading", widthsByGroup: { reading: saved ? { ...view.widths } : { title: 350 } }
    }));
    const beforePrefs = new Map(prefs);
    const beforeWidths = { ...view.widths };
    const selection = view.selection;
    source = "after sync";
    for (let index = 0; index < 3; index++) {
      observer.notify("modify", "item", [7]);
      observer.notify("modify", "setting", ["tag-colors"]);
      observer.notify("finish", "sync", []);
      await vi.advanceTimersByTimeAsync(60);
    }
    expect(rendered).toBe("after sync");
    expect(view.tree.invalidate).toHaveBeenCalledTimes(3);
    expect(Zotero.ItemTreeManager.refreshColumns).not.toHaveBeenCalled();
    expect(view.widths).toEqual(beforeWidths);
    expect(prefs).toEqual(beforePrefs);
    expect(view.selection).toBe(selection);
    expect([...view.selection]).toEqual([7, 9]);
    expect(view.sort).toEqual({ field: "dateAdded", direction: -1 });
    expect(view.search).toBe("bridge");
  });

  it("redraws remote publication data without relying on an item notification", async () => {
    expect(columns.get("publication-tags").dataProvider(item)).toBe("");
    await (plugin as any).sync.applyLocal("publications", {
      schemaVersion: 1,
      generatedAt: "2026-09-22T00:00:00.000Z",
      entries: { "example journal": {
        publication: "Example Journal", rank: { sci: "Q2" }, source: "easyscholar", fetchedAt: null
      } }
    });
    await vi.advanceTimersByTimeAsync(60);
    expect(columns.get("publication-tags").dataProvider(item)).not.toBe("");
    expect(view.tree.invalidate).toHaveBeenCalledOnce();
    expect(Zotero.ItemTreeManager.refreshColumns).not.toHaveBeenCalled();
  });

  it("redraws imported display settings without re-registering existing columns", async () => {
    const registrations = Zotero.ItemTreeManager.registerColumn.mock.calls.length;
    await (plugin as any).sync.applyLocal("settings", {
      ...defaultSyncableSettings(), hashTagsDefaultColor: "#123456"
    });
    await vi.advanceTimersByTimeAsync(60);
    expect(view.tree.invalidate).toHaveBeenCalledOnce();
    expect(Zotero.ItemTreeManager.registerColumn).toHaveBeenCalledTimes(registrations);
    expect(Zotero.ItemTreeManager.refreshColumns).not.toHaveBeenCalled();
  });

  it("removes the cache redraw listener on shutdown", async () => {
    const cache = (plugin as any).publications.cache;
    await plugin.shutdown();
    await cache.replace({ schemaVersion: 1, generatedAt: "", entries: {} });
    await vi.advanceTimersByTimeAsync(100);
    expect(view.tree.invalidate).not.toHaveBeenCalled();
  });
});

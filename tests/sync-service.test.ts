import { beforeEach, describe, expect, it, vi } from "vitest";
import { PREF_BRANCH, SYNC_CONTAINER_MARKER } from "../src/constants";
import { createSyncedChannel, createSyncData, parseSyncNote, renderSyncNote } from "../src/domain/sync";
import { SyncService } from "../src/services/syncService";
import { defaultSyncableSettings, readSyncableSettings } from "../src/settings";
import {
  readOptionalViewGroups,
  readViewGroupLocalState,
  writeViewGroups,
  writeViewGroupLocalState
} from "../src/services/viewGroupStore";
import type { PublicationCacheFile } from "../src/types";

function publications(rank = "Q1"): PublicationCacheFile {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-22T00:00:00.000Z",
    entries: {
      nature: {
        publication: "Nature",
        rank: { sci: rank },
        source: "easyscholar",
        fetchedAt: "2026-08-22T00:00:00.000Z"
      }
    }
  };
}

describe("SyncService Zotero object workflow", () => {
  const preferences = new Map<string, unknown>();
  const items = new Map<number, any>();
  let searchIDs: number[] = [];
  let nextID = 10;
  let Item: any;

  function setSyncPreferences(enabled: boolean, publicationsEnabled = true, settingsEnabled = false): void {
    preferences.set(`${PREF_BRANCH}sync.enabled`, enabled);
    preferences.set(`${PREF_BRANCH}sync.publications`, publicationsEnabled);
    preferences.set(`${PREF_BRANCH}sync.settings`, settingsEnabled);
  }

  function cache(initial: PublicationCacheFile) {
    let current = initial;
    return {
      snapshot: vi.fn(() => JSON.parse(JSON.stringify(current))),
      isEmpty: vi.fn(() => Object.keys(current.entries).length === 0),
      replace: vi.fn(async (value: PublicationCacheFile) => { current = value; }),
      onChange: vi.fn(() => vi.fn())
    };
  }

  function addExistingObjects(noteHTML: string): void {
    const container = {
      id: 1,
      key: "CONTAINER",
      deleted: false,
      getField: (field: string) => field === "extra" ? SYNC_CONTAINER_MARKER : "",
      getNotes: () => [2]
    };
    const note = {
      id: 2,
      key: "SYNCNOTE",
      deleted: false,
      getNoteTitle: () => "Focus Columns",
      getNote: () => noteHTML,
      setNote: vi.fn((value: string) => { noteHTML = value; }),
      saveTx: vi.fn(async () => 2)
    };
    items.set(1, container);
    items.set(2, note);
    searchIDs = [1];
  }

  beforeEach(() => {
    preferences.clear();
    items.clear();
    searchIDs = [];
    nextID = 10;
    setSyncPreferences(false);

    Item = vi.fn(function(this: any, type: string) {
      this.itemType = type;
      this.id = 0;
      this.key = "";
      this.fields = new Map<string, string>();
      this.note = "";
      this.setField = (name: string, value: string) => this.fields.set(name, value);
      this.getField = (name: string) => this.fields.get(name) || "";
      this.setNote = (value: string) => { this.note = value; };
      this.getNote = () => this.note;
      this.getNoteTitle = () => this.itemType === "note" ? "Focus Columns" : "";
      this.getNotes = () => [...items.values()]
        .filter(candidate => candidate.parentID === this.id && candidate.itemType === "note")
        .map(candidate => candidate.id);
      this.saveTx = vi.fn(async () => {
        if (!this.id) {
          this.id = nextID++;
          this.key = `KEY${this.id}`;
          items.set(this.id, this);
        }
        return this.id;
      });
    });

    class Search {
      libraryID = 0;
      addCondition = vi.fn();
      search = vi.fn(async () => searchIDs);
    }

    (globalThis as any).Services = {
      prompt: {
        confirm: vi.fn(() => true),
        confirmEx: vi.fn(() => 0),
        alert: vi.fn(),
        BUTTON_POS_0: 1,
        BUTTON_POS_1: 256,
        BUTTON_POS_2: 65536,
        BUTTON_TITLE_IS_STRING: 127,
        BUTTON_TITLE_CANCEL: 1
      }
    };
    (globalThis as any).Zotero = {
      Prefs: {
        get: (name: string) => preferences.get(name),
        set: (name: string, value: unknown) => preferences.set(name, value)
      },
      Libraries: { userLibraryID: 1 },
      Search,
      Items: {
        getAsync: vi.fn(async (ids: number[]) => ids.map(id => items.get(id)).filter(Boolean)),
        get: vi.fn((id: number) => items.get(id))
      },
      Item,
      logError: vi.fn()
    };
  });

  it("automatically imports existing publication data on a pristine new computer", async () => {
    setSyncPreferences(true);
    const syncData = createSyncData("1.0.0");
    syncData.channels.publications = createSyncedChannel(publications("Q2"));
    addExistingObjects(renderSyncNote(syncData));
    const localCache = cache({
      schemaVersion: 1,
      generatedAt: "2026-08-22T00:00:00.000Z",
      entries: {}
    });
    const backups = { create: vi.fn(), latest: vi.fn() };
    const service = new SyncService(localCache as any, "1.0.0", vi.fn(), backups as any);

    await service.start();

    expect(localCache.replace).toHaveBeenCalledWith(publications("Q2"));
    expect(backups.create).toHaveBeenCalledOnce();
    expect(Item).not.toHaveBeenCalled();
    expect(service.getStatus()).toMatchObject({ state: "ready", containerKey: "CONTAINER", noteKey: "SYNCNOTE" });
    await service.stop();
  });

  it("does not create Zotero items until synchronization is enabled and confirmed", async () => {
    const localCache = cache(publications());
    const service = new SyncService(
      localCache as any,
      "1.0.0",
      vi.fn(),
      { create: vi.fn(), latest: vi.fn() } as any
    );

    await service.start();
    expect(Item).not.toHaveBeenCalled();

    const status = await service.configure({ enabled: true, publications: true, settings: false }, {});

    expect(Services.prompt.confirm).toHaveBeenCalledOnce();
    expect(Item).toHaveBeenCalledTimes(2);
    expect(status.state).toBe("ready");
    const note = [...items.values()].find(candidate => candidate.itemType === "note");
    const parsed = parseSyncNote(note.getNote());
    expect(parsed.channels.publications?.data).toEqual(publications());
    expect(note.getNote()).not.toContain("secretKey");
    expect(Object.keys(parsed.channels.publications || {})).toEqual([
      "revision", "updatedAt", "baseHash", "contentHash", "data"
    ]);
    await service.stop();
  });

  it("creates nothing when the user cancels the first connection summary", async () => {
    const localCache = cache(publications());
    (Services.prompt.confirm as any).mockReturnValue(false);
    const service = new SyncService(
      localCache as any,
      "1.0.0",
      vi.fn(),
      { create: vi.fn(), latest: vi.fn() } as any
    );

    const status = await service.configure({ enabled: true, publications: true, settings: false }, {});

    expect(status.state).toBe("needs-choice");
    expect(Item).not.toHaveBeenCalled();
    expect(items.size).toBe(0);
  });

  it("pauses instead of recreating a previously connected container that disappeared", async () => {
    setSyncPreferences(true);
    preferences.set(`${PREF_BRANCH}sync.runtime.everConnected`, true);
    const service = new SyncService(
      cache(publications()) as any,
      "1.0.0",
      vi.fn(),
      { create: vi.fn(), latest: vi.fn() } as any
    );

    const status = await service.check({}, true);

    expect(status.state).toBe("missing-container");
    expect(Item).not.toHaveBeenCalled();
    expect(Services.prompt.confirm).not.toHaveBeenCalled();
  });

  it("blocks damaged synchronization notes without overwriting them", async () => {
    setSyncPreferences(true);
    addExistingObjects("<p><strong>Focus Columns</strong></p><p>damaged</p>");
    const service = new SyncService(
      cache(publications()) as any,
      "1.0.0",
      vi.fn(),
      { create: vi.fn(), latest: vi.fn() } as any
    );

    const status = await service.check({}, true);

    expect(status.state).toBe("invalid-data");
    expect(items.get(2).getNote()).toContain("damaged");
  });

  it("blocks duplicate shared containers", async () => {
    setSyncPreferences(true);
    const syncData = createSyncData("1.0.0");
    syncData.channels.publications = createSyncedChannel(publications());
    addExistingObjects(renderSyncNote(syncData));
    items.set(3, {
      id: 3,
      key: "CONTAINER2",
      deleted: false,
      getField: (field: string) => field === "extra" ? SYNC_CONTAINER_MARKER : "",
      getNotes: () => []
    });
    searchIDs = [1, 3];
    const service = new SyncService(
      cache(publications()) as any,
      "1.0.0",
      vi.fn(),
      { create: vi.fn(), latest: vi.fn() } as any
    );

    const status = await service.check({}, true);

    expect(status.state).toBe("duplicate-container");
    expect(Item).not.toHaveBeenCalled();
  });

  it("blocks duplicate Focus Columns synchronization notes", async () => {
    setSyncPreferences(true);
    const syncData = createSyncData("1.0.0");
    syncData.channels.publications = createSyncedChannel(publications());
    const html = renderSyncNote(syncData);
    addExistingObjects(html);
    items.get(1).getNotes = () => [2, 3];
    items.set(3, {
      id: 3,
      key: "SYNCNOTE2",
      deleted: false,
      getNoteTitle: () => "Focus Columns",
      getNote: () => html
    });
    const service = new SyncService(
      cache(publications()) as any,
      "1.0.0",
      vi.fn(),
      { create: vi.fn(), latest: vi.fn() } as any
    );

    const status = await service.check({}, true);

    expect(status.state).toBe("duplicate-note");
  });

  it("continues the publication channel while only settings are conflicted", async () => {
    setSyncPreferences(true, true, true);
    const publicationBase = createSyncedChannel(publications("Q1"));
    const publicationRemote = createSyncedChannel(publications("Q2"), publicationBase);
    const settingsBase = createSyncedChannel(defaultSyncableSettings());
    const settingsRemote = createSyncedChannel({
      ...defaultSyncableSettings(),
      endpoint: "https://www.easyscholar.cc/open/getPublicationRank"
    }, settingsBase);
    const syncData = createSyncData("1.0.0");
    syncData.channels.publications = publicationRemote;
    syncData.channels.settings = settingsRemote;
    addExistingObjects(renderSyncNote(syncData));
    preferences.set(`${PREF_BRANCH}sync.runtime.publicationsHead`, publicationBase.contentHash);
    preferences.set(`${PREF_BRANCH}sync.runtime.settingsHead`, settingsBase.contentHash);
    preferences.set(`${PREF_BRANCH}easyscholar.autoFetchMissing`, false);
    const localCache = cache(publications("Q1"));
    const service = new SyncService(
      localCache as any,
      "1.0.0",
      vi.fn(),
      { create: vi.fn(), latest: vi.fn() } as any
    );

    await service.start();

    expect(localCache.replace).toHaveBeenCalledWith(publications("Q2"));
    expect(service.getStatus()).toMatchObject({
      state: "conflict",
      publicationsState: "ready",
      settingsState: "conflict"
    });
    expect(preferences.get(`${PREF_BRANCH}easyscholar.autoFetchMissing`)).toBe(false);
    await service.stop();
  });

  it("does not rewrite legacy settings or upgrade the note when view groups have not been used", async () => {
    setSyncPreferences(true, false, true);
    const data = createSyncData("1.1.3");
    data.channels.settings = createSyncedChannel(defaultSyncableSettings());
    const original = renderSyncNote(data);
    addExistingObjects(original);
    const service = new SyncService(cache(publications()) as any, "1.2.0", vi.fn(), {
      create: vi.fn(), latest: vi.fn()
    } as any);

    expect((await service.check(null, false)).state).toBe("ready");
    expect(items.get(2).setNote).not.toHaveBeenCalled();
    expect(items.get(2).getNote()).toBe(original);
    expect(readSyncableSettings()).not.toHaveProperty("viewGroups");
    expect(preferences.get(`${PREF_BRANCH}sync.runtime.settingsHead`)).toBe(data.channels.settings.contentHash);
  });

  it("upgrades the envelope only when publishing groups and preserves channel revisions and other data", async () => {
    setSyncPreferences(true, true, true);
    const data = createSyncData("1.1.3");
    data.channels.settings = createSyncedChannel(defaultSyncableSettings());
    data.channels.publications = createSyncedChannel(publications());
    addExistingObjects(renderSyncNote(data));
    preferences.set(`${PREF_BRANCH}sync.runtime.settingsHead`, data.channels.settings.contentHash);
    writeViewGroups([{ id: "reading", name: "Reading", columns: [{ key: "title", visible: true }] }]);
    const localState = { activeID: "reading", widthsByGroup: { reading: { title: 430 } } };
    writeViewGroupLocalState(localState);
    const service = new SyncService(cache(publications()) as any, "1.2.0", vi.fn(), {
      create: vi.fn(), latest: vi.fn()
    } as any);

    expect((await service.check(null, false)).state).toBe("ready");
    const updated = parseSyncNote(items.get(2).getNote());
    expect(updated.schemaVersion).toBe(2);
    expect(updated.channels.settings).toMatchObject({
      revision: 2,
      baseHash: data.channels.settings.contentHash,
      data: readSyncableSettings()
    });
    expect(updated.channels.publications).toEqual(data.channels.publications);
    expect(items.get(2).getNote()).not.toContain("widthsByGroup");
    expect(items.get(2).getNote()).not.toContain("activeID");
    expect(readViewGroupLocalState()).toEqual(localState);

    await service.check(null, false);
    expect(items.get(2).saveTx).toHaveBeenCalledOnce();
  });

  it("does not share groups or upgrade a legacy note when the settings channel is disabled", async () => {
    setSyncPreferences(true, true, false);
    const data = createSyncData("1.1.3");
    data.channels.settings = createSyncedChannel(defaultSyncableSettings());
    data.channels.publications = createSyncedChannel(publications());
    addExistingObjects(renderSyncNote(data));
    preferences.set(`${PREF_BRANCH}sync.runtime.publicationsHead`, data.channels.publications.contentHash);
    writeViewGroups([{ id: "reading", name: "Reading", columns: [{ key: "title", visible: true }] }]);
    const service = new SyncService(cache(publications("Q2")) as any, "1.2.0", vi.fn(), {
      create: vi.fn(), latest: vi.fn()
    } as any);

    expect((await service.check(null, false)).state).toBe("ready");
    const updated = parseSyncNote(items.get(2).getNote());
    expect(updated.schemaVersion).toBe(1);
    expect(updated.channels.settings).toEqual(data.channels.settings);
    expect(updated.channels.publications?.data).toEqual(publications("Q2"));
  });

  it("imports schema 2 groups on a pristine computer without importing widths or the active group", async () => {
    setSyncPreferences(true, false, true);
    const data = createSyncData("1.2.0");
    data.schemaVersion = 2;
    const groups = [{ id: "reading", name: "Reading", columns: [{ key: "title", visible: true }] }];
    data.channels.settings = createSyncedChannel({ ...defaultSyncableSettings(), viewGroups: groups });
    addExistingObjects(renderSyncNote(data));
    const localState = { activeID: null, widthsByGroup: { reading: { title: 210 } } };
    writeViewGroupLocalState(localState);
    const backups = { create: vi.fn(), latest: vi.fn() };
    const imported = vi.fn();
    const service = new SyncService(cache(publications()) as any, "1.2.0", imported, backups as any);

    expect((await service.check(null, false)).state).toBe("ready");
    expect(readOptionalViewGroups()).toEqual(groups);
    expect(readViewGroupLocalState()).toEqual(localState);
    expect(backups.create).toHaveBeenCalledWith("settings", defaultSyncableSettings());
    expect(imported).toHaveBeenCalledOnce();
    expect(items.get(2).saveTx).not.toHaveBeenCalled();
    await service.check(null, false);
    expect(imported).toHaveBeenCalledOnce();
  });

  it("requires a choice for new local groups and independently changed legacy settings", async () => {
    setSyncPreferences(true, false, true);
    const base = createSyncedChannel(defaultSyncableSettings());
    const remote = createSyncedChannel({ ...defaultSyncableSettings(), autoFetchMissing: false }, base);
    const data = createSyncData("1.1.3");
    data.channels.settings = remote;
    addExistingObjects(renderSyncNote(data));
    preferences.set(`${PREF_BRANCH}sync.runtime.settingsHead`, base.contentHash);
    const groups = [{ id: "reading", name: "Reading", columns: [{ key: "title", visible: true }] }];
    writeViewGroups(groups);
    const before = readSyncableSettings();
    const backups = { create: vi.fn(), latest: vi.fn() };
    const service = new SyncService(cache(publications()) as any, "1.2.0", vi.fn(), backups as any);

    expect((await service.check(null, false)).state).toBe("conflict");
    expect(items.get(2).saveTx).not.toHaveBeenCalled();
    expect(readSyncableSettings()).toEqual(before);

    // Choosing the legacy settings does not treat their absent group field as deletion.
    expect((await service.check({}, true)).state).toBe("ready");
    expect(Services.prompt.confirmEx).toHaveBeenCalledOnce();
    expect(readOptionalViewGroups()).toEqual(groups);
    expect(readSyncableSettings().autoFetchMissing).toBe(false);
    expect(backups.create).toHaveBeenCalledWith("settings", before);
    expect(items.get(2).saveTx).not.toHaveBeenCalled();
    expect(preferences.get(`${PREF_BRANCH}sync.runtime.settingsHead`)).toBe(remote.contentHash);

    // The preserved groups are subsequently published from the accepted legacy base.
    expect((await service.check(null, false)).state).toBe("ready");
    const updated = parseSyncNote(items.get(2).getNote());
    expect(updated.schemaVersion).toBe(2);
    expect(updated.channels.settings).toMatchObject({
      revision: 3,
      baseHash: remote.contentHash,
      data: { ...remote.data, viewGroups: groups }
    });
  });

  it("propagates an explicit group deletion without losing local widths or downgrading schema 2", async () => {
    setSyncPreferences(true, false, true);
    const groups = [{ id: "reading", name: "Reading", columns: [{ key: "title", visible: true }] }];
    const base = createSyncedChannel({ ...defaultSyncableSettings(), viewGroups: groups });
    const remote = createSyncedChannel({ ...defaultSyncableSettings(), viewGroups: [] }, base);
    const data = createSyncData("1.2.0");
    data.schemaVersion = 2;
    data.channels.settings = remote;
    addExistingObjects(renderSyncNote(data));
    preferences.set(`${PREF_BRANCH}sync.runtime.settingsHead`, base.contentHash);
    writeViewGroups(groups);
    const localState = { activeID: "reading", widthsByGroup: { reading: { title: 210 } } };
    writeViewGroupLocalState(localState);
    const backups = { create: vi.fn(), latest: vi.fn() };
    const service = new SyncService(cache(publications()) as any, "1.2.0", vi.fn(), backups as any);

    expect((await service.check(null, false)).state).toBe("ready");
    expect(readOptionalViewGroups()).toEqual([]);
    expect(readViewGroupLocalState()).toEqual(localState);
    expect(backups.create).toHaveBeenCalledWith("settings", base.data);

    preferences.set(`${PREF_BRANCH}easyscholar.autoFetchMissing`, false);
    expect((await service.check(null, false)).state).toBe("ready");
    const updated = parseSyncNote(items.get(2).getNote());
    expect(updated.schemaVersion).toBe(2);
    expect(updated.channels.settings?.data.viewGroups).toEqual([]);
    expect(updated.channels.settings?.baseHash).toBe(remote.contentHash);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncBackupStore } from "../src/services/syncBackup";
import { defaultSyncableSettings } from "../src/settings";

describe("local synchronization backups", () => {
  const files = new Map<string, string>();

  beforeEach(() => {
    files.clear();
    (globalThis as any).PathUtils = { join: (...parts: string[]) => parts.join("/") };
    (globalThis as any).Zotero = {
      DataDirectory: { dir: "data" },
      logError: vi.fn()
    };
    (globalThis as any).IOUtils = {
      exists: vi.fn(async (path: string) => path === "backups" || files.has(path)),
      makeDirectory: vi.fn(),
      writeUTF8: vi.fn(async (path: string, value: string) => { files.set(path, value); }),
      readUTF8: vi.fn(async (path: string) => files.get(path)),
      getChildren: vi.fn(async () => [...files.keys()]),
      remove: vi.fn(async (path: string) => { files.delete(path); })
    };
  });

  it("keeps only the newest three backups per channel and restores the latest", async () => {
    const store = new SyncBackupStore("backups");
    for (let index = 0; index < 4; index += 1) {
      await store.create("settings", {
        ...defaultSyncableSettings(),
        autoFetchMissing: index % 2 === 0
      });
    }
    await store.create("publications", {
      schemaVersion: 1,
      generatedAt: "2026-08-22T00:00:00.000Z",
      entries: {}
    });

    expect([...files.keys()].filter(path => path.includes("settings-"))).toHaveLength(3);
    expect([...files.keys()].filter(path => path.includes("publications-"))).toHaveLength(1);
    expect((await store.latest("settings"))?.data).toMatchObject({ autoFetchMissing: false });
  });

  it("does not return a backup whose content checksum was changed", async () => {
    const store = new SyncBackupStore("backups");
    const record = await store.create("settings", defaultSyncableSettings());
    files.set(record.path, files.get(record.path)!.replace('"autoFetchMissing": true', '"autoFetchMissing": false'));

    expect(await store.latest("settings")).toBeNull();
    expect(Zotero.logError).toHaveBeenCalled();
  });
});

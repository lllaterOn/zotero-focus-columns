import { describe, expect, it } from "vitest";
import { SYNC_DATA_MAX_CHARACTERS, SYNC_NOTE_MARKER } from "../src/constants";
import {
  contentHash,
  createSyncedChannel,
  createSyncData,
  parseSyncNote,
  reconcileChannel,
  renderSyncNote,
  SyncDataError
} from "../src/domain/sync";
import { defaultSyncableSettings, validateSyncableSettings } from "../src/settings";
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

describe("Focus Columns synchronization data", () => {
  it("round-trips a versioned synchronization note with valid checksums", () => {
    const data = createSyncData("0.1.8");
    data.channels.publications = createSyncedChannel(publications(), "installation-a");
    data.channels.settings = createSyncedChannel(defaultSyncableSettings(), "installation-a");

    const html = renderSyncNote(data);
    const parsed = parseSyncNote(html, "0.1.8");

    expect(parsed.migrated).toBe(false);
    expect(parsed.value).toEqual(data);
    expect(html).toContain("Do not edit");
    expect(html).not.toContain("secretKey");
  });

  it("detects same-base offline edits as a conflict", () => {
    const base = publications("Q1");
    const first = createSyncedChannel(base, "installation-a");
    const deviceBHead = first.contentHash;
    const remote = createSyncedChannel(publications("Q2"), "installation-a", first);

    expect(reconcileChannel(base, deviceBHead, remote, false)).toBe("pull");
    expect(reconcileChannel(publications("Q3"), deviceBHead, remote, false)).toBe("conflict");
    expect(reconcileChannel(publications("Q2"), remote.contentHash, remote, false)).toBe("equal");
  });

  it("pulls several missed remote revisions when local data did not change", () => {
    const first = createSyncedChannel(publications("Q1"), "installation-a");
    const second = createSyncedChannel(publications("Q2"), "installation-a", first);
    const third = createSyncedChannel(publications("Q3"), "installation-a", second);

    expect(third.baseHash).toBe(second.contentHash);
    expect(reconcileChannel(publications("Q1"), first.contentHash, third, false)).toBe("pull");
  });

  it("initializes a missing enabled channel from local data", () => {
    expect(reconcileChannel(publications(), "previous-head", undefined, false)).toBe("push");
  });

  it("keeps publication and settings decisions independent", () => {
    const publicationBase = createSyncedChannel(publications("Q1"), "installation-a");
    const publicationRemote = createSyncedChannel(publications("Q2"), "installation-a", publicationBase);
    const settings = defaultSyncableSettings();
    const settingsBase = createSyncedChannel(settings, "installation-a");
    const remoteSettingsData = { ...settings, autoFetchMissing: false };
    const settingsRemote = createSyncedChannel(remoteSettingsData, "installation-a", settingsBase);
    const localSettingsData = { ...settings, endpoint: "https://www.easyscholar.cc/open/getPublicationRank" };

    expect(reconcileChannel(publications("Q1"), publicationBase.contentHash, publicationRemote, false))
      .toBe("pull");
    expect(reconcileChannel(localSettingsData, settingsBase.contentHash, settingsRemote, false))
      .toBe("conflict");
  });

  it("rejects damaged, oversized, and newer synchronization data", () => {
    const data = createSyncData("0.1.8");
    data.channels.publications = createSyncedChannel(publications(), "installation-a");
    const damaged = renderSyncNote(data).replace("Q1", "Q4");
    expect(() => parseSyncNote(damaged, "0.1.8"))
      .toThrowError(expect.objectContaining({ kind: "invalid" }));

    const newer = `<pre>${SYNC_NOTE_MARKER}\n${JSON.stringify({ ...data, schemaVersion: 2 })}</pre>`;
    expect(() => parseSyncNote(newer, "0.1.8"))
      .toThrowError(expect.objectContaining({ kind: "newer-schema" }));

    data.channels.settings = createSyncedChannel({
      ...defaultSyncableSettings(),
      mapSource: "x".repeat(SYNC_DATA_MAX_CHARACTERS)
    }, "installation-a");
    expect(() => renderSyncNote(data))
      .toThrowError(expect.objectContaining({ kind: "too-large" }));
  });

  it("migrates recognized old data in memory", () => {
    const legacy = {
      schemaVersion: 0,
      pluginID: "focus-columns@lllateron.github.io",
      writerID: "old-installation",
      publications: publications()
    };
    const html = `<pre>${SYNC_NOTE_MARKER}\n${JSON.stringify(legacy)}</pre>`;

    const parsed = parseSyncNote(html, "0.1.8");

    expect(parsed.migrated).toBe(true);
    expect(parsed.value.schemaVersion).toBe(1);
    expect(parsed.value.channels.publications?.data).toEqual(publications());
  });

  it("strictly rejects unknown synchronized settings such as credentials", () => {
    const settings = { ...defaultSyncableSettings(), secretKey: "must-not-sync" };

    expect(validateSyncableSettings(settings as any)).toContain("Unexpected synced setting");
    expect(contentHash(defaultSyncableSettings())).not.toContain("must-not-sync");
  });

  it("rejects unknown synchronization fields instead of carrying them forward", () => {
    const data: any = createSyncData("0.1.8");
    data.channels.publications = createSyncedChannel(publications(), "installation-a");
    data.channels.credentials = { secretKey: "must-not-sync" };
    const html = `<pre>${SYNC_NOTE_MARKER}\n${JSON.stringify(data)}</pre>`;

    expect(() => parseSyncNote(html, "0.1.8"))
      .toThrowError(expect.objectContaining({ kind: "invalid" }));
  });
});

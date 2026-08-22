import { describe, expect, it } from "vitest";
import { PLUGIN_ID, SYNC_DATA_MAX_CHARACTERS, SYNC_NOTE_MARKER } from "../src/constants";
import {
  contentHash,
  createSyncedChannel,
  createSyncData,
  parseSyncNote,
  reconcileChannel,
  renderSyncNote
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
  it("round-trips a versioned note without device metadata", () => {
    const data = createSyncData("1.0.0");
    data.channels.publications = createSyncedChannel(publications());
    data.channels.settings = createSyncedChannel(defaultSyncableSettings());

    const html = renderSyncNote(data);
    const parsed = parseSyncNote(html);

    expect(parsed).toEqual(data);
    expect(html).toContain("Do not edit");
    expect(html).not.toContain("secretKey");
    expect(Object.keys(parsed.channels.publications || {})).toEqual([
      "revision", "updatedAt", "baseHash", "contentHash", "data"
    ]);
  });

  it("detects same-base offline edits as a conflict", () => {
    const base = publications("Q1");
    const first = createSyncedChannel(base);
    const deviceBHead = first.contentHash;
    const remote = createSyncedChannel(publications("Q2"), first);

    expect(reconcileChannel(base, deviceBHead, remote, false)).toBe("pull");
    expect(reconcileChannel(publications("Q3"), deviceBHead, remote, false)).toBe("conflict");
    expect(reconcileChannel(publications("Q2"), remote.contentHash, remote, false)).toBe("equal");
  });

  it("pulls several missed remote revisions when local data did not change", () => {
    const first = createSyncedChannel(publications("Q1"));
    const second = createSyncedChannel(publications("Q2"), first);
    const third = createSyncedChannel(publications("Q3"), second);

    expect(third.baseHash).toBe(second.contentHash);
    expect(reconcileChannel(publications("Q1"), first.contentHash, third, false)).toBe("pull");
  });

  it("initializes a missing enabled channel from local data", () => {
    expect(reconcileChannel(publications(), "previous-head", undefined, false)).toBe("push");
  });

  it("keeps publication and settings decisions independent", () => {
    const publicationBase = createSyncedChannel(publications("Q1"));
    const publicationRemote = createSyncedChannel(publications("Q2"), publicationBase);
    const settings = defaultSyncableSettings();
    const settingsBase = createSyncedChannel(settings);
    const remoteSettingsData = { ...settings, autoFetchMissing: false };
    const settingsRemote = createSyncedChannel(remoteSettingsData, settingsBase);
    const localSettingsData = { ...settings, endpoint: "https://www.easyscholar.cc/open/getPublicationRank" };

    expect(reconcileChannel(publications("Q1"), publicationBase.contentHash, publicationRemote, false))
      .toBe("pull");
    expect(reconcileChannel(localSettingsData, settingsBase.contentHash, settingsRemote, false))
      .toBe("conflict");
  });

  it("rejects damaged, oversized, and newer synchronization data", () => {
    const data = createSyncData("1.0.0");
    data.channels.publications = createSyncedChannel(publications());
    const damaged = renderSyncNote(data).replace("Q1", "Q4");
    expect(() => parseSyncNote(damaged))
      .toThrowError(expect.objectContaining({ kind: "invalid" }));

    const newer = `<pre>${SYNC_NOTE_MARKER}\n${JSON.stringify({ ...data, schemaVersion: 2 })}</pre>`;
    expect(() => parseSyncNote(newer))
      .toThrowError(expect.objectContaining({ kind: "newer-schema" }));

    data.channels.settings = createSyncedChannel({
      ...defaultSyncableSettings(),
      mapSource: "x".repeat(SYNC_DATA_MAX_CHARACTERS)
    });
    expect(() => renderSyncNote(data))
      .toThrowError(expect.objectContaining({ kind: "too-large" }));
  });

  it("rejects legacy and foreign synchronization identities", () => {
    const data: any = createSyncData("1.0.0");
    data.channels.publications = {
      ...createSyncedChannel(publications()),
      deviceMetadata: "must-not-sync"
    };
    const legacy = `<pre>${SYNC_NOTE_MARKER}\n${JSON.stringify(data)}</pre>`;
    expect(() => parseSyncNote(legacy))
      .toThrowError(expect.objectContaining({ kind: "invalid" }));

    const foreign = `<pre>${SYNC_NOTE_MARKER}\n${JSON.stringify({
      ...createSyncData("1.0.0"),
      pluginID: "another-plugin@example.invalid"
    })}</pre>`;
    expect(() => parseSyncNote(foreign))
      .toThrowError(expect.objectContaining({ kind: "invalid" }));
    expect(PLUGIN_ID).toBe("focus-columns@lllateron.github.io");
  });

  it("strictly rejects unknown synchronized settings such as credentials", () => {
    const settings = { ...defaultSyncableSettings(), secretKey: "must-not-sync" };

    expect(validateSyncableSettings(settings as any)).toContain("Unexpected synced setting");
    expect(contentHash(defaultSyncableSettings())).not.toContain("must-not-sync");
  });

  it("rejects unknown synchronization fields instead of carrying them forward", () => {
    const data: any = createSyncData("1.0.0");
    data.channels.publications = createSyncedChannel(publications());
    data.channels.credentials = { secretKey: "must-not-sync" };
    const html = `<pre>${SYNC_NOTE_MARKER}\n${JSON.stringify(data)}</pre>`;

    expect(() => parseSyncNote(html))
      .toThrowError(expect.objectContaining({ kind: "invalid" }));
  });
});

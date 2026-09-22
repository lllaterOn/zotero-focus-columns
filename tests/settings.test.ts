import { beforeEach, describe, expect, it, vi } from "vitest";
import { contentHash } from "../src/domain/sync";
import {
  defaultSyncableSettings,
  readSyncableSettings,
  validateAdvancedSettings,
  validateEasyScholarEndpoint,
  validateSyncableSettings,
  writeSyncableSettings
} from "../src/settings";
import {
  readOptionalViewGroups,
  readViewGroupLocalState,
  writeViewGroups,
  writeViewGroupLocalState
} from "../src/services/viewGroupStore";

const groups = [{
  id: "reading",
  name: "Reading",
  columns: [{ key: "title", visible: true }, { key: "date", visible: false }]
}];

describe("settings validation", () => {
  it("allows only the EasyScholar HTTPS domain for secret-bearing requests", () => {
    expect(validateEasyScholarEndpoint("https://easyscholar.cc/open/getPublicationRank")).toBeNull();
    expect(validateEasyScholarEndpoint("http://easyscholar.cc/open/getPublicationRank")).not.toBeNull();
    expect(validateEasyScholarEndpoint("https://example.com/collect")).not.toBeNull();
  });

  it("validates all editable advanced fields together", () => {
    expect(validateAdvancedSettings({
      fields: "sci,sciif",
      sort: "sci,-sciif",
      map: "SCI=\n/SCIIF/=IF",
      rankColors: "#ffe2dd,#e8deee,#dbeddb,#fadec9,#e9e8e7",
      publicationDefaultColor: "#86dad1",
      hashTagsDefaultColor: "#8e44ad",
      endpoint: "https://easyscholar.cc/open/getPublicationRank"
    })).toEqual([]);
  });
});

describe("synchronized view-group settings", () => {
  const preferences = new Map<string, unknown>();

  beforeEach(() => {
    preferences.clear();
    vi.stubGlobal("Zotero", {
      Prefs: {
        get: (name: string) => preferences.get(name),
        set: (name: string, value: unknown) => preferences.set(name, value)
      }
    });
  });

  it("keeps the legacy settings representation and hash until groups have been saved", () => {
    expect(readOptionalViewGroups()).toBeUndefined();
    const settings = readSyncableSettings();
    expect(settings).toEqual(defaultSyncableSettings());
    expect(settings).not.toHaveProperty("viewGroups");
    expect(contentHash(settings)).toBe(contentHash(defaultSyncableSettings()));
  });

  it("syncs group definitions while excluding device-local widths and the active group", () => {
    writeViewGroups(groups);
    const settings = readSyncableSettings();
    const hash = contentHash(settings);
    writeViewGroupLocalState({ activeID: "reading", widthsByGroup: { reading: { title: 420 } } });

    expect(readSyncableSettings()).toEqual({ ...defaultSyncableSettings(), viewGroups: groups });
    expect(contentHash(readSyncableSettings())).toBe(hash);
    expect(validateSyncableSettings({ ...settings, widths: {} } as any))
      .toContain("Unexpected synced setting");
    expect(validateSyncableSettings({ ...settings, lastActive: "reading" } as any))
      .toContain("Unexpected synced setting");
  });

  it("preserves local groups when importing legacy settings, but honors an explicit empty list", () => {
    writeViewGroups(groups);
    const localState = { activeID: "reading", widthsByGroup: { reading: { title: 420 } } };
    writeViewGroupLocalState(localState);

    writeSyncableSettings({ ...defaultSyncableSettings(), autoFetchMissing: false });
    expect(readOptionalViewGroups()).toEqual(groups);
    expect(readSyncableSettings().autoFetchMissing).toBe(false);

    writeSyncableSettings({ ...defaultSyncableSettings(), viewGroups: [] });
    expect(readOptionalViewGroups()).toEqual([]);
    expect(readSyncableSettings()).toHaveProperty("viewGroups", []);
    expect(readViewGroupLocalState()).toEqual(localState);
  });

  it("rejects malformed or private group fields before writing any settings", () => {
    const invalidSettings = {
      ...defaultSyncableSettings(),
      viewGroups: [{ ...groups[0], widths: { title: 300 } }]
    };
    expect(validateSyncableSettings(invalidSettings).length).toBeGreaterThan(0);
    expect(() => writeSyncableSettings(invalidSettings)).toThrow();
    expect(preferences.size).toBe(0);
    expect(validateSyncableSettings({ ...defaultSyncableSettings(), viewGroups: undefined }).length)
      .toBeGreaterThan(0);
  });
});

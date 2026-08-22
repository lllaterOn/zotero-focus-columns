import { beforeEach, describe, expect, it, vi } from "vitest";
import { ColumnController } from "../src/features/columns";
import { InfoRowController } from "../src/features/infoRows";
import { publicationSortKey } from "../src/domain/publication";
import type { SettingsSnapshot } from "../src/settings";

function settings(overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  return {
    publicationColumn: true,
    hashTagsColumn: true,
    statusColumn: true,
    remarkColumn: true,
    publicationInfoRow: true,
    remarkInfoRow: true,
    autoFetchMissing: false,
    secretKey: "",
    endpoint: "https://easyscholar.cc/open/getPublicationRank",
    fields: ["sci"],
    sort: ["sci"],
    mapSource: "",
    mapRules: [],
    rankColors: ["#111111", "#222222", "#333333", "#444444", "#555555"],
    publicationDefaultColor: "#666666",
    hashTagsDefaultColor: "#777777",
    ...overrides
  };
}

describe("feature controllers", () => {
  beforeEach(() => {
    (globalThis as any).Zotero = {
      ItemTreeManager: {
        registerColumn: vi.fn((option: any) => `registered-${option.dataKey}`),
        unregisterColumn: vi.fn(),
        refreshColumns: vi.fn()
      },
      ItemPaneManager: {
        registerInfoRow: vi.fn((option: any) => `registered-${option.rowID}`),
        unregisterInfoRow: vi.fn(),
        refreshInfoRow: vi.fn()
      },
      Tags: {
        getColors: vi.fn(() => new Map([
          ["/ no", { color: "#ff0000", position: 0 }],
          ["#重点", { color: "#2255aa", position: 1 }]
        ]))
      }
    };
  });

  it("registers column switches independently with Zotero-compatible widths", () => {
    let current = settings();
    const controller = new ColumnController(() => current, {} as any, vi.fn());

    controller.sync();

    const registered = (Zotero.ItemTreeManager.registerColumn as ReturnType<typeof vi.fn>).mock.calls
      .map((call: any[]) => call[0]);
    expect(registered.map((option: any) => option.dataKey)).toEqual([
      "publication-tags",
      "hash-tags",
      "reading-status",
      "remark"
    ]);
    expect(registered.map((option: any) => option.width)).toEqual(["240", "150", "92", "250"]);
    expect(registered.every((option: any) => /^\d+$/.test(option.width))).toBe(true);
    expect(registered.every((option: any) => option.minWidth === undefined)).toBe(true);
    expect(Zotero.ItemTreeManager.refreshColumns).not.toHaveBeenCalled();

    vi.clearAllMocks();
    current = settings({ statusColumn: false });
    controller.sync();

    expect(Zotero.ItemTreeManager.unregisterColumn).toHaveBeenCalledOnce();
    expect(Zotero.ItemTreeManager.unregisterColumn).toHaveBeenCalledWith("registered-reading-status");
    expect(Zotero.ItemTreeManager.registerColumn).not.toHaveBeenCalled();
    expect(Zotero.ItemTreeManager.refreshColumns).not.toHaveBeenCalled();
  });

  it("returns only visible values as custom-column sort keys", () => {
    const rank = { sci: "Q1" };
    const publications = {
      get: vi.fn(() => ({ rank })),
      queueMissing: vi.fn()
    };
    const controller = new ColumnController(() => settings(), publications as any, vi.fn());
    controller.sync();
    const options = Object.fromEntries(
      Zotero.ItemTreeManager.registerColumn.mock.calls
        .map((call: any[]) => [call[0].dataKey, call[0]])
    );
    const fields: Record<string, string> = {
      publicationTitle: "Example Journal",
      proceedingsTitle: "",
      extra: "remark: Alpha"
    };
    const item = {
      id: 42,
      libraryID: 1,
      isRegularItem: () => true,
      getTags: () => [{ tag: "#重点" }, { tag: "/ no" }],
      getField: (field: string) => fields[field] || ""
    };
    const sameValuesDifferentID = { ...item, id: 99 };

    expect(options["publication-tags"].dataProvider(item))
      .toBe(publicationSortKey(rank, ["sci"]));
    expect(options["hash-tags"].dataProvider(item)).toBe("重点");
    expect(options["reading-status"].dataProvider(item)).toBe("/ no");
    expect(options.remark.dataProvider(item)).toBe("Alpha");
    for (const option of Object.values(options) as any[]) {
      expect(option.dataProvider(item)).toBe(option.dataProvider(sameValuesDifferentID));
      expect(option.dataProvider(item)).not.toContain("itemID");
    }
  });

  it.each([
    ["publicationColumn", "publication-tags"],
    ["hashTagsColumn", "hash-tags"],
    ["statusColumn", "reading-status"],
    ["remarkColumn", "remark"]
  ] as const)("can toggle %s without registering another column", (feature, dataKey) => {
    const allColumnsOff = {
      publicationColumn: false,
      hashTagsColumn: false,
      statusColumn: false,
      remarkColumn: false
    };
    let current = settings({ ...allColumnsOff, [feature]: true });
    const controller = new ColumnController(() => current, {} as any, vi.fn());

    controller.sync();

    expect(Zotero.ItemTreeManager.registerColumn).toHaveBeenCalledOnce();
    expect(Zotero.ItemTreeManager.registerColumn.mock.calls[0][0].dataKey).toBe(dataKey);

    current = settings(allColumnsOff);
    controller.sync();

    expect(Zotero.ItemTreeManager.unregisterColumn).toHaveBeenCalledOnce();
    expect(Zotero.ItemTreeManager.unregisterColumn).toHaveBeenCalledWith(`registered-${dataKey}`);
  });

  it("registers and removes item-pane rows independently", () => {
    let current = settings();
    const columns = { saveRemark: vi.fn() };
    const controller = new InfoRowController(() => current, {} as any, columns as any);

    controller.sync();

    const registered = (Zotero.ItemPaneManager.registerInfoRow as ReturnType<typeof vi.fn>).mock.calls
      .map((call: any[]) => call[0]);
    expect(registered.find((option: any) => option.rowID === "remark")?.position).toBe("start");
    expect(registered.find((option: any) => option.rowID === "publication-tags")?.position)
      .toBe("afterCreators");
    expect(Zotero.ItemPaneManager.refreshInfoRow).not.toHaveBeenCalled();

    vi.clearAllMocks();
    current = settings({ publicationInfoRow: false });
    controller.sync();

    expect(Zotero.ItemPaneManager.unregisterInfoRow).toHaveBeenCalledOnce();
    expect(Zotero.ItemPaneManager.unregisterInfoRow)
      .toHaveBeenCalledWith("registered-publication-tags");
    expect(Zotero.ItemPaneManager.registerInfoRow).not.toHaveBeenCalled();

    controller.refresh();
    expect(Zotero.ItemPaneManager.refreshInfoRow).toHaveBeenCalledOnce();
    expect(Zotero.ItemPaneManager.refreshInfoRow).toHaveBeenCalledWith("registered-remark");
  });

  it.each([
    ["publicationInfoRow", "publication-tags"],
    ["remarkInfoRow", "remark"]
  ] as const)("can toggle %s without registering another info row", (feature, rowID) => {
    const bothRowsOff = {
      publicationInfoRow: false,
      remarkInfoRow: false
    };
    let current = settings({ ...bothRowsOff, [feature]: true });
    const controller = new InfoRowController(
      () => current,
      {} as any,
      { saveRemark: vi.fn() } as any
    );

    controller.sync();

    expect(Zotero.ItemPaneManager.registerInfoRow).toHaveBeenCalledOnce();
    expect(Zotero.ItemPaneManager.registerInfoRow.mock.calls[0][0].rowID).toBe(rowID);

    current = settings(bothRowsOff);
    controller.sync();

    expect(Zotero.ItemPaneManager.unregisterInfoRow).toHaveBeenCalledOnce();
    expect(Zotero.ItemPaneManager.unregisterInfoRow).toHaveBeenCalledWith(`registered-${rowID}`);
  });
});

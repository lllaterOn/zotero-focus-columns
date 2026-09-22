import { describe, expect, it, vi } from "vitest";
import { applyViewLayout, canUseViewLayout, captureViewLayout } from "../src/features/viewGroupLayout";

type Spec = {
  dataKey: string;
  hidden?: boolean;
  disabled?: boolean;
  ordinal?: number;
  width?: number;
  fixedWidth?: boolean;
  primary?: boolean;
  sortDirection?: number;
};

function fixture(
  definitions: Spec[] = [
    { dataKey: "title", primary: true, width: 176 },
    { dataKey: "year", width: 90 },
    { dataKey: "custom", hidden: true, width: 120 }
  ],
  initial: Record<string, Record<string, unknown>> = {}
) {
  let prefs = initial;
  let runtime: Spec[] = [];
  const rebuild = () => {
    runtime = definitions.map((column, ordinal) => ({ ordinal, ...column, ...prefs[column.dataKey] }))
      .sort((a, b) => a.ordinal - b.ordinal);
    if (!runtime.some(column => column.primary && !column.hidden)) {
      const title = runtime.find(column => column.dataKey === "title");
      if (title) title.hidden = false;
    }
    if (!runtime.some(column => column.sortDirection)) {
      const first = runtime.find(column => !column.hidden && !column.disabled);
      if (first) first.sortDirection = 1;
    }
  };
  rebuild();
  const selection = { selected: new Set([1, 3]) };
  const rows = [{ id: 3 }, { id: 1 }];
  const view = {
    props: { columnPicker: true },
    _matchesViewType: vi.fn(() => true),
    _getColumnPrefs: () => prefs,
    _storeColumnPrefs: vi.fn((next: typeof initial) => {
      // Zotero retains prefs for built-ins absent from the incoming object.
      for (const [key, value] of Object.entries(prefs)) {
        if (!(key in next) && definitions.some(column => column.dataKey === key)) next[key] = value;
      }
      prefs = next;
    }),
    _resetColumns: vi.fn(async () => { rebuild(); }),
    getSortField: () => runtime.find(column => column.sortDirection)!.dataKey,
    getSortDirection: () => runtime.find(column => column.sortDirection)!.sortDirection,
    tree: { _columns: { getAsArray: () => runtime } },
    selection,
    _rows: rows,
    search: "unchanged search",
    filters: { tags: ["retained"] },
    sort: vi.fn(),
    refresh: vi.fn(),
    selectItems: vi.fn()
  };
  return { window: { ZoteroPane: { itemsView: view } }, view, rows, selection };
}

describe("view group layout adapter", () => {
  it("captures registered hidden columns in ordinal order, excluding context-disabled columns", () => {
    const { window } = fixture([
      { dataKey: "title", primary: true, ordinal: 8, width: 176 },
      { dataKey: "custom", hidden: true, ordinal: 2, width: 120 },
      { dataKey: "feedOnly", disabled: true, hidden: true, ordinal: 0, width: 99 },
      { dataKey: "icon", fixedWidth: true, ordinal: 3, width: 16 }
    ], { title: { width: 166 } });
    expect(captureViewLayout(window)).toEqual({
      columns: [
        { key: "custom", visible: false }, { key: "icon", visible: true }, { key: "title", visible: true }
      ],
      widths: { custom: 120, title: 166 }
    });
  });

  it("applies visibility, normalized order and local widths without changing rows, selection, search or sort", async () => {
    const { window, view, rows, selection } = fixture(undefined, {
      title: { sortDirection: -1, width: 176, extensionSetting: "retain" },
      absent: { hidden: false, ordinal: 20, width: 300 }
    });
    const input = [
      { key: "year", visible: true }, { key: "title", visible: false }, { key: "missing", visible: true }
    ];
    const result = await applyViewLayout(window, input, { year: 88 });
    expect(result).toEqual({ missingKeys: ["missing"] });
    expect(view._getColumnPrefs()).toMatchObject({
      year: { ordinal: 0, hidden: false, width: 88 },
      title: { ordinal: 1, hidden: false, sortDirection: -1, extensionSetting: "retain" },
      custom: { ordinal: 2, hidden: true },
      absent: { hidden: false, ordinal: 20, width: 300 }
    });
    expect(input[1].visible).toBe(false);
    expect(view._rows).toBe(rows);
    expect(view.selection).toBe(selection);
    expect([...selection.selected]).toEqual([1, 3]);
    expect(view.search).toBe("unchanged search");
    expect(view.filters).toEqual({ tags: ["retained"] });
    expect(view.sort).not.toHaveBeenCalled();
    expect(view.refresh).not.toHaveBeenCalled();
    expect(view.selectItems).not.toHaveBeenCalled();
  });

  it("keeps the effective initial default sort when another column becomes first", async () => {
    const { window, view } = fixture();
    expect(view._getColumnPrefs()).toEqual({});
    await applyViewLayout(window, [{ key: "year", visible: true }, { key: "title", visible: true }], {});
    expect(view.getSortField()).toBe("title");
    expect(view.getSortDirection()).toBe(1);
    expect(view._getColumnPrefs().title.sortDirection).toBe(1);
  });

  it("allows a replacement primary column without force-showing title", async () => {
    const { window, view } = fixture([
      { dataKey: "title", primary: true, width: 176 },
      { dataKey: "replacement", primary: true, hidden: true, width: 200 }
    ]);
    await applyViewLayout(window, [{ key: "replacement", visible: true }], {});
    expect(view._getColumnPrefs().title.hidden).toBe(true);
    expect(view.getSortField()).toBe("title");
  });

  it("does not accumulate padding or first-column width on repeated capture/apply", async () => {
    const { window } = fixture(undefined, { title: { width: 176 }, year: { width: 90 } });
    const first = captureViewLayout(window);
    for (let index = 0; index < 4; index++) {
      await applyViewLayout(window, first.columns, captureViewLayout(window).widths);
    }
    expect(captureViewLayout(window).widths).toEqual(first.widths);
  });

  it("uses the receiving computer's widths when no local group widths exist and ignores fixed widths", async () => {
    const { window, view } = fixture([
      { dataKey: "title", primary: true, width: 230 },
      { dataKey: "icon", fixedWidth: true, width: 16 }
    ], { title: { width: 210 } });
    await applyViewLayout(window, [{ key: "title", visible: true }, { key: "icon", visible: true }], { icon: 999 });
    expect(captureViewLayout(window).widths).toEqual({ title: 210 });
    expect(view._getColumnPrefs().icon).not.toHaveProperty("width");
  });

  it("fails unsupported or special views before any preference mutation", async () => {
    const { window, view } = fixture();
    view._matchesViewType.mockReturnValue(false);
    expect(canUseViewLayout(window)).toBe(false);
    expect(canUseViewLayout({})).toBe(false);
    await expect(applyViewLayout(window, [], {})).rejects.toThrow("unavailable");
    expect(view._storeColumnPrefs).not.toHaveBeenCalled();
  });

  it("rejects duplicate saved keys before any preference mutation", async () => {
    const { window, view } = fixture();
    await expect(applyViewLayout(window, [
      { key: "title", visible: true }, { key: "title", visible: false }
    ], {})).rejects.toThrow("Invalid saved");
    expect(view._storeColumnPrefs).not.toHaveBeenCalled();
  });

  it("restores the effective layout on reset failure, including initially unset prefs", async () => {
    const { window, view } = fixture();
    const before = captureViewLayout(window);
    view._resetColumns.mockRejectedValueOnce(new Error("reset failed"));
    await expect(applyViewLayout(window, [{ key: "year", visible: true }], { title: 444, year: 55 }))
      .rejects.toThrow("previous layout was restored");
    expect(captureViewLayout(window)).toEqual(before);
    expect(view.getSortField()).toBe("title");
    expect(view._storeColumnPrefs).toHaveBeenCalledTimes(2);
  });

  it("reports rollback failure instead of claiming the original layout was restored", async () => {
    const { window, view } = fixture();
    view._resetColumns.mockRejectedValue(new Error("reset failed"));
    await expect(applyViewLayout(window, [{ key: "year", visible: true }], {}))
      .rejects.toThrow("Unable to apply or restore");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PREF_BRANCH } from "../src/constants";
import { mergeViewGroupColumns, validateViewGroups, type ViewGroup } from "../src/domain/viewGroups";
import {
  readOptionalViewGroups,
  readViewGroupLocalState,
  readViewGroups,
  writeViewGroupLocalState,
  writeViewGroups
} from "../src/services/viewGroupStore";

const definitionsPref = `${PREF_BRANCH}viewGroups.definitions`;
const localPref = `${PREF_BRANCH}viewGroups.local`;
const preferences = new Map<string, unknown>();

const readingView: ViewGroup = {
  id: "reading",
  name: "阅读",
  columns: [
    { key: "title", visible: true },
    { key: "focus-columns-status", visible: true },
    { key: "dateAdded", visible: false }
  ]
};

beforeEach(() => {
  preferences.clear();
  vi.stubGlobal("Zotero", {
    Prefs: {
      get: (name: string) => preferences.get(name),
      set: (name: string, value: unknown) => preferences.set(name, value)
    }
  });
});

describe("view-group definitions", () => {
  it("validates the shared shape without local widths", () => {
    expect(validateViewGroups([readingView])).toEqual([]);
    expect(validateViewGroups([{ ...readingView, widths: { title: 400 } }])).toContain(
      "View group 1 has invalid or unexpected fields"
    );
  });

  it("accepts Zotero's CSS-escaped plugin column keys but rejects dangerous object keys", () => {
    const pluginKey = "focus-columns\\@lllateron\\.github\\.io-reading-status";
    expect(validateViewGroups([{
      ...readingView,
      columns: [{ key: pluginKey, visible: true }]
    }])).toEqual([]);
    expect(validateViewGroups([{
      ...readingView,
      columns: [{ key: "__proto__", visible: true }]
    }])).toContain("View group 1, column 1 has an invalid key");

    writeViewGroupLocalState({
      activeID: "reading",
      widthsByGroup: { reading: { [pluginKey]: 120 } }
    });
    expect(readViewGroupLocalState().widthsByGroup.reading).toEqual({ [pluginKey]: 120 });
    expect(() => writeViewGroupLocalState({
      activeID: "reading",
      widthsByGroup: { reading: { ["__proto__"]: 120 } }
    })).toThrow("invalid column width");
  });

  it("rejects duplicate ids, trimmed names, and column keys", () => {
    const errors = validateViewGroups([
      readingView,
      {
        id: "reading",
        name: " 阅读 ",
        columns: [
          { key: "title", visible: true },
          { key: "title", visible: false }
        ]
      }
    ]);
    expect(errors).toContain("View group 2 has a duplicate id");
    expect(errors).toContain("View group 2 has a duplicate name");
    expect(errors).toContain("View group 2, column 2 has a duplicate key");
  });

  it("distinguishes a missing legacy preference from a deliberately empty list", () => {
    expect(readOptionalViewGroups()).toBeUndefined();
    expect(readViewGroups()).toEqual([]);

    writeViewGroups([]);
    expect(readOptionalViewGroups()).toEqual([]);
    expect(preferences.get(definitionsPref)).toBe("[]");
  });

  it("rejects malformed or invalid stored definitions instead of replacing them", () => {
    preferences.set(definitionsPref, "not JSON");
    expect(() => readViewGroups()).toThrow("malformed JSON");

    preferences.set(definitionsPref, JSON.stringify([{ ...readingView, widths: { title: 400 } }]));
    expect(() => readViewGroups()).toThrow("Invalid view group definitions");
  });

  it("keeps unavailable plugin columns when updating from the columns on this computer", () => {
    const previous = [
      { key: "title", visible: true },
      { key: "other-plugin-score", visible: false },
      { key: "year", visible: true }
    ];
    const current = [
      { key: "title", visible: true },
      { key: "year", visible: false },
      { key: "dateAdded", visible: true }
    ];

    expect(mergeViewGroupColumns(current, previous)).toEqual([
      { key: "title", visible: true },
      { key: "other-plugin-score", visible: false },
      { key: "year", visible: false },
      { key: "dateAdded", visible: true }
    ]);
    expect(current).toHaveLength(3);
    expect(previous).toHaveLength(3);
  });
});

describe("local view-group state", () => {
  it("stores widths and active selection separately from shared definitions", () => {
    writeViewGroups([readingView]);
    writeViewGroupLocalState({
      activeID: "reading",
      widthsByGroup: { reading: { title: 420, "focus-columns-status": 96 } }
    });

    expect(JSON.parse(String(preferences.get(definitionsPref)))).toEqual([readingView]);
    expect(String(preferences.get(definitionsPref))).not.toContain("420");
    expect(readViewGroupLocalState()).toEqual({
      activeID: "reading",
      widthsByGroup: { reading: { title: 420, "focus-columns-status": 96 } }
    });
  });

  it("preserves local widths when shared definitions are updated", () => {
    writeViewGroupLocalState({ activeID: "reading", widthsByGroup: { reading: { title: 420 } } });
    writeViewGroups([readingView]);
    writeViewGroups([{ ...readingView, columns: [...readingView.columns, { key: "year", visible: true }] }]);

    expect(readViewGroupLocalState()).toEqual({
      activeID: "reading",
      widthsByGroup: { reading: { title: 420 } }
    });
  });

  it("rejects shared fields and invalid widths in local state", () => {
    preferences.set(localPref, JSON.stringify({
      activeID: "reading",
      widthsByGroup: { reading: { title: 0 } },
      definitions: [readingView]
    }));
    expect(() => readViewGroupLocalState()).toThrow("invalid or unexpected fields");

    preferences.set(localPref, JSON.stringify({
      activeID: "reading",
      widthsByGroup: { reading: { title: Number.POSITIVE_INFINITY } }
    }));
    expect(() => readViewGroupLocalState()).toThrow("invalid column width");
  });
});

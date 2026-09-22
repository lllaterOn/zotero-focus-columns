import { PREF_BRANCH } from "../constants";
import {
  isSafeViewGroupKey,
  isSafeColumnKey,
  validateViewGroups,
  type ViewGroup,
  type ViewWidths
} from "../domain/viewGroups";

const DEFINITIONS_PREF = `${PREF_BRANCH}viewGroups.definitions`;
const LOCAL_PREF = `${PREF_BRANCH}viewGroups.local`;
const MAX_GROUPS = 50;
const MAX_COLUMNS = 200;
const MAX_COLUMN_WIDTH = 10_000;

export interface ViewGroupLocalState {
  activeID: string | null;
  widthsByGroup: Record<string, ViewWidths>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function parsePreference(name: string, source: unknown): unknown {
  if (typeof source !== "string") throw new Error(`${name} preference must contain JSON`);
  try {
    return JSON.parse(source);
  }
  catch {
    throw new Error(`${name} preference contains malformed JSON`);
  }
}

function assertViewGroups(value: unknown): asserts value is ViewGroup[] {
  const errors = validateViewGroups(value);
  if (errors.length) throw new Error(`Invalid view group definitions: ${errors.join("; ")}`);
}

function validateLocalState(value: unknown): string[] {
  if (!isRecord(value) || !hasExactKeys(value, ["activeID", "widthsByGroup"])) {
    return ["Local view-group state has invalid or unexpected fields"];
  }
  if (value.activeID !== null && !isSafeViewGroupKey(value.activeID)) {
    return ["Local view-group state has an invalid active id"];
  }
  if (!isRecord(value.widthsByGroup)) {
    return ["Local view-group widths must be an object"];
  }

  const groupEntries = Object.entries(value.widthsByGroup);
  if (groupEntries.length > MAX_GROUPS) {
    return [`Local view-group widths cannot exceed ${MAX_GROUPS} entries`];
  }
  const errors: string[] = [];
  for (const [groupID, widths] of groupEntries) {
    if (!isSafeViewGroupKey(groupID)) {
      errors.push("Local view-group widths contain an invalid group id");
      continue;
    }
    if (!isRecord(widths)) {
      errors.push(`Local widths for '${groupID}' must be an object`);
      continue;
    }
    const widthEntries = Object.entries(widths);
    if (widthEntries.length > MAX_COLUMNS) {
      errors.push(`Local widths for '${groupID}' cannot exceed ${MAX_COLUMNS} columns`);
      continue;
    }
    for (const [columnKey, width] of widthEntries) {
      if (!isSafeColumnKey(columnKey)
        || typeof width !== "number"
        || !Number.isFinite(width)
        || width <= 0
        || width > MAX_COLUMN_WIDTH) {
        errors.push(`Local widths for '${groupID}' contain an invalid column width`);
      }
    }
  }
  return errors;
}

function assertLocalState(value: unknown): asserts value is ViewGroupLocalState {
  const errors = validateLocalState(value);
  if (errors.length) throw new Error(`Invalid local view-group state: ${errors.join("; ")}`);
}

export function readOptionalViewGroups(): ViewGroup[] | undefined {
  const source = Zotero.Prefs.get(DEFINITIONS_PREF, true);
  if (source === undefined || source === null) return undefined;
  const value = parsePreference("View group definitions", source);
  assertViewGroups(value);
  return value;
}

export function readViewGroups(): ViewGroup[] {
  return readOptionalViewGroups() ?? [];
}

export function writeViewGroups(groups: ViewGroup[]): void {
  assertViewGroups(groups);
  Zotero.Prefs.set(DEFINITIONS_PREF, JSON.stringify(groups), true);
}

export function readViewGroupLocalState(): ViewGroupLocalState {
  const source = Zotero.Prefs.get(LOCAL_PREF, true);
  if (source === undefined || source === null) return { activeID: null, widthsByGroup: {} };
  const value = parsePreference("Local view-group state", source);
  assertLocalState(value);
  return value;
}

export function writeViewGroupLocalState(state: ViewGroupLocalState): void {
  assertLocalState(state);
  Zotero.Prefs.set(LOCAL_PREF, JSON.stringify(state), true);
}

import type { ViewGroupColumn, ViewWidths } from "../domain/viewGroups";

type NativeColumn = {
  dataKey: string;
  hidden?: boolean;
  disabled?: boolean;
  ordinal?: number;
  width?: number;
  fixedWidth?: boolean;
  primary?: boolean;
};

type ColumnPrefs = Record<string, Record<string, unknown>>;

const UNAVAILABLE = "Column layouts are unavailable in this Zotero view.";

function getItemTree(window: any): any {
  const view = window?.ZoteroPane?.itemsView;
  if (!view?.props?.columnPicker
    || typeof view._matchesViewType !== "function"
    || !view._matchesViewType(["default"])
    || typeof view._getColumnPrefs !== "function"
    || typeof view._storeColumnPrefs !== "function"
    || typeof view._resetColumns !== "function"
    || typeof view.getSortField !== "function"
    || typeof view.getSortDirection !== "function"
    || typeof view.tree?._columns?.getAsArray !== "function") {
    throw new Error(UNAVAILABLE);
  }
  return view;
}

function availableColumns(view: any): NativeColumn[] {
  const columns = view.tree._columns.getAsArray() as NativeColumn[];
  if (!Array.isArray(columns) || !columns.length
    || columns.some(column => !column || typeof column.dataKey !== "string" || !column.dataKey)
    || new Set(columns.map(column => column.dataKey)).size !== columns.length) {
    throw new Error(UNAVAILABLE);
  }
  return columns.filter(column => !column.disabled)
    .map((column, index) => ({ column, ordinal: Number.isFinite(column.ordinal) ? column.ordinal! : index }))
    .sort((a, b) => a.ordinal - b.ordinal)
    .map(({ column }) => column);
}

function clonePrefs(prefs: ColumnPrefs): ColumnPrefs {
  return Object.fromEntries(Object.entries(prefs).map(([key, value]) => [key, { ...value }]));
}

function isWidth(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function canUseViewLayout(window: any): boolean {
  try {
    return availableColumns(getItemTree(window)).length > 0;
  } catch {
    return false;
  }
}

export function captureViewLayout(window: any): { columns: ViewGroupColumn[]; widths: ViewWidths } {
  const view = getItemTree(window);
  const nativeColumns = availableColumns(view);
  const prefs = view._getColumnPrefs() as ColumnPrefs;
  const widths: ViewWidths = {};
  for (const column of nativeColumns) {
    // Stored and runtime widths already use Zotero's preference units. DOM
    // widths include padding/first-column decoration and drift on each apply.
    const width = prefs[column.dataKey]?.width ?? column.width;
    if (!column.fixedWidth && isWidth(width)) {
      Object.defineProperty(widths, column.dataKey, { value: width, enumerable: true, writable: true, configurable: true });
    }
  }
  return {
    columns: nativeColumns.map(column => ({ key: column.dataKey, visible: !column.hidden })),
    widths
  };
}

export async function applyViewLayout(
  window: any,
  columns: ViewGroupColumn[],
  widths: ViewWidths
): Promise<{ missingKeys: string[] }> {
  const view = getItemTree(window);
  const nativeColumns = availableColumns(view);
  if (!Array.isArray(columns) || columns.some(column => !column
    || typeof column.key !== "string" || !column.key || typeof column.visible !== "boolean")
    || new Set(columns.map(column => column.key)).size !== columns.length) {
    throw new Error("Invalid saved column layout.");
  }
  const previous = clonePrefs(view._getColumnPrefs());
  const next = clonePrefs(previous);
  const available = new Map(nativeColumns.map(column => [column.dataKey, column]));
  const desired = new Map(columns.map(column => [column.key, column]));
  const missingKeys = columns.filter(column => !available.has(column.key)).map(column => column.key);
  const orderedKeys = [
    ...columns.filter(column => available.has(column.key)).map(column => column.key),
    ...nativeColumns.filter(column => !desired.has(column.dataKey)).map(column => column.dataKey)
  ];
  const sortKey = view.getSortField();
  const sortDirection = view.getSortDirection();
  if (typeof sortKey !== "string" || !available.has(sortKey)
    || (sortDirection !== 1 && sortDirection !== -1)) {
    throw new Error(UNAVAILABLE);
  }
  // Native _storeColumnPrefs preserves missing built-in keys. Include the
  // effective old layout so rollback also works with previously unset prefs.
  const rollback = clonePrefs(previous);
  for (const [index, column] of nativeColumns.entries()) {
    const old = {
      ...rollback[column.dataKey],
      hidden: Boolean(column.hidden),
      ordinal: index
    };
    if (!column.fixedWidth && isWidth(column.width)) {
      Object.assign(old, { width: previous[column.dataKey]?.width ?? column.width });
    }
    Object.defineProperty(rollback, column.dataKey, { value: old, enumerable: true, writable: true, configurable: true });
  }
  rollback[sortKey].sortDirection = sortDirection;
  for (const [ordinal, key] of orderedKeys.entries()) {
    const column = available.get(key)!;
    const settings = { ...next[key], ordinal, hidden: !(desired.get(key)?.visible ?? false) };
    if (!column.fixedWidth && Object.hasOwn(widths, key) && isWidth(widths[key])) {
      Object.assign(settings, { width: widths[key] });
    }
    Object.defineProperty(next, key, { value: settings, enumerable: true, writable: true, configurable: true });
  }
  // Match Zotero's native fallback when a layout has no visible primary column.
  if (!nativeColumns.some(column => column.primary && !next[column.dataKey].hidden)
    && available.has("title")) {
    next.title.hidden = false;
  }
  // A fresh profile's effective default sort may not have been persisted yet.
  // Anchor it before changing visibility/order, without sorting the item rows.
  next[sortKey].sortDirection = sortDirection;
  try {
    view._storeColumnPrefs(next);
    await view._resetColumns();
  } catch (cause) {
    try {
      view._storeColumnPrefs(rollback);
      await view._resetColumns();
    } catch {
      throw new Error("Unable to apply or restore the column layout. Reopen the Zotero library window.", { cause });
    }
    throw new Error("Unable to apply the column layout; the previous layout was restored.", { cause });
  }
  return { missingKeys };
}

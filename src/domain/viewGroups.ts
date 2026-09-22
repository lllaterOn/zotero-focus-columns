export interface ViewGroupColumn {
  key: string;
  visible: boolean;
}

export interface ViewGroup {
  id: string;
  name: string;
  columns: ViewGroupColumn[];
}

export type ViewWidths = Record<string, number>;

const MAX_GROUPS = 50;
const MAX_COLUMNS = 200;
const MAX_NAME_LENGTH = 80;
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

export function isSafeViewGroupKey(value: unknown): value is string {
  return typeof value === "string" && SAFE_KEY.test(value)
    && !["__proto__", "constructor", "prototype"].includes(value);
}

export function isSafeColumnKey(value: unknown): value is string {
  // Zotero namespaces plugin columns with CSS.escape(), including backslashes.
  return typeof value === "string" && value.length > 0 && value.length <= 512
    && !/[\u0000-\u001f\u007f]/.test(value)
    && !["__proto__", "constructor", "prototype"].includes(value);
}

export function validateViewGroups(value: unknown): string[] {
  if (!Array.isArray(value)) return ["View groups must be an array"];
  if (value.length > MAX_GROUPS) return [`View groups cannot exceed ${MAX_GROUPS} entries`];

  const errors: string[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();

  value.forEach((candidate, groupIndex) => {
    const label = `View group ${groupIndex + 1}`;
    if (!isRecord(candidate) || !hasExactKeys(candidate, ["id", "name", "columns"])) {
      errors.push(`${label} has invalid or unexpected fields`);
      return;
    }

    if (!isSafeViewGroupKey(candidate.id)) {
      errors.push(`${label} has an invalid id`);
    }
    else if (ids.has(candidate.id)) {
      errors.push(`${label} has a duplicate id`);
    }
    else {
      ids.add(candidate.id);
    }

    if (typeof candidate.name !== "string"
      || candidate.name.trim().length === 0
      || candidate.name.length > MAX_NAME_LENGTH) {
      errors.push(`${label} has an invalid name`);
    }
    else {
      const normalizedName = candidate.name.trim();
      if (names.has(normalizedName)) errors.push(`${label} has a duplicate name`);
      else names.add(normalizedName);
    }

    if (!Array.isArray(candidate.columns) || candidate.columns.length > MAX_COLUMNS) {
      errors.push(`${label} has an invalid columns list`);
      return;
    }

    const columnKeys = new Set<string>();
    candidate.columns.forEach((column, columnIndex) => {
      const columnLabel = `${label}, column ${columnIndex + 1}`;
      if (!isRecord(column) || !hasExactKeys(column, ["key", "visible"])) {
        errors.push(`${columnLabel} has invalid or unexpected fields`);
        return;
      }
      if (!isSafeColumnKey(column.key)) {
        errors.push(`${columnLabel} has an invalid key`);
      }
      else if (columnKeys.has(column.key)) {
        errors.push(`${columnLabel} has a duplicate key`);
      }
      else {
        columnKeys.add(column.key);
      }
      if (typeof column.visible !== "boolean") errors.push(`${columnLabel} has an invalid visibility`);
    });
  });

  return errors;
}

export function mergeViewGroupColumns(
  current: ViewGroupColumn[],
  previous: ViewGroupColumn[]
): ViewGroupColumn[] {
  const merged = current.map(column => ({ ...column }));
  const currentKeys = new Set(current.map(column => column.key));

  previous.forEach((column, previousIndex) => {
    if (currentKeys.has(column.key)) return;

    let insertionIndex = -1;
    for (let index = previousIndex - 1; index >= 0; index -= 1) {
      const precedingIndex = merged.findIndex(candidate => candidate.key === previous[index].key);
      if (precedingIndex >= 0) {
        insertionIndex = precedingIndex + 1;
        break;
      }
    }
    if (insertionIndex < 0) {
      for (let index = previousIndex + 1; index < previous.length; index += 1) {
        const followingIndex = merged.findIndex(candidate => candidate.key === previous[index].key);
        if (followingIndex >= 0) {
          insertionIndex = followingIndex;
          break;
        }
      }
    }
    merged.splice(insertionIndex < 0 ? merged.length : insertionIndex, 0, { ...column });
  });

  return merged;
}

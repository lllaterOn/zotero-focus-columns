import type { Badge, NativeTag, TagColor } from "../types";

export const DEFAULT_HASH_TAG_COLOR = "#8e44ad";

function stableTagSort(
  left: { name: string; position: number },
  right: { name: string; position: number }
): number {
  if (left.position !== right.position) return left.position - right.position;
  return left.name.localeCompare(right.name, "zh-CN", { sensitivity: "base" });
}

export function hashTagBadges(
  tags: NativeTag[],
  colors: Map<string, TagColor>,
  defaultColor = DEFAULT_HASH_TAG_COLOR
): Badge[] {
  return tags
    .filter(({ tag }) => tag.startsWith("#"))
    .map(({ tag }) => {
      const color = colors.get(tag);
      return {
        name: tag,
        position: color?.position ?? Number.MAX_SAFE_INTEGER,
        badge: {
          key: tag,
          text: tag.slice(1),
          background: color?.color ?? defaultColor,
          foreground: color?.color ? "auto" : defaultColor
        }
      };
    })
    .sort((left, right) => stableTagSort(left, right))
    .map(({ badge }) => badge);
}

export function statusCandidates(colors: Map<string, TagColor>): Array<{
  tag: string;
  color: string;
  position: number;
}> {
  return [...colors.entries()]
    .filter(([tag]) => tag.startsWith("/"))
    .map(([tag, value]) => ({ tag, ...value }))
    .sort((left, right) => stableTagSort(
      { name: left.tag, position: left.position },
      { name: right.tag, position: right.position }
    ));
}

export function currentStatus(
  tags: NativeTag[],
  colors: Map<string, TagColor>
): { tag: string; color: string } | null {
  const assigned = new Set(tags.map(({ tag }) => tag));
  const current = statusCandidates(colors).find(({ tag }) => assigned.has(tag));
  return current ? { tag: current.tag, color: current.color } : null;
}

export function statusTagsAfterSelection(
  tags: NativeTag[],
  colors: Map<string, TagColor>,
  selected: string | null
): NativeTag[] {
  const statusNames = new Set(statusCandidates(colors).map(({ tag }) => tag));
  const retained = tags.filter(({ tag }) => !statusNames.has(tag));
  if (selected && statusNames.has(selected)) retained.push({ tag: selected, type: 0 });
  return retained;
}

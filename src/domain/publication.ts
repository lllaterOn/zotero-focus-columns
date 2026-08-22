import {
  DEFAULT_RANK_COLORS,
  FIELD_LABELS,
  MEMBERSHIP_FIELDS
} from "../constants";
import type { Badge, MapRule, ParseResult, RankRecord, RankScalar } from "../types";

export function normalizePublicationName(value: string): string {
  return value.trim().replace(/\s+/g, " ").normalize("NFC").toLocaleLowerCase("en-US");
}

function splitRuleEntries(input: string): string[] {
  const entries: string[] = [];
  let current = "";
  let inRegex = false;
  let escaped = false;
  let braceDepth = 0;

  const push = () => {
    const value = current.trim();
    if (value) entries.push(value);
    current = "";
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "\r" || char === "\n") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      push();
      inRegex = false;
      escaped = false;
      braceDepth = 0;
      continue;
    }
    if (!current.trim() && char === "/") inRegex = true;
    if (inRegex) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "/" && current.trim().length > 0) inRegex = false;
    }
    else {
      if (char === "{") braceDepth += 1;
      if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
      if (char === "," && braceDepth === 0) {
        push();
        continue;
      }
    }
    current += char;
  }
  push();
  return entries;
}

export function parseMapRules(input: string): ParseResult<MapRule[]> {
  const rules: MapRule[] = [];
  const errors: string[] = [];
  for (const [index, entry] of splitRuleEntries(input).entries()) {
    const equals = entry.indexOf("=");
    if (equals < 0) {
      errors.push(`Rule ${index + 1} is missing '='`);
      continue;
    }
    const source = entry.slice(0, equals).trim();
    const replacement = entry.slice(equals + 1).trim();
    if (!source) {
      errors.push(`Rule ${index + 1} has an empty source`);
      continue;
    }
    if (source.startsWith("/")) {
      const closingSlash = source.lastIndexOf("/");
      if (closingSlash <= 0) {
        errors.push(`Rule ${index + 1} has an invalid regular expression`);
        continue;
      }
      const pattern = source.slice(1, closingSlash);
      const flags = source.slice(closingSlash + 1);
      try {
        rules.push({
          kind: "regex",
          source,
          replacement,
          regex: new RegExp(pattern, flags)
        });
      }
      catch (error) {
        errors.push(`Rule ${index + 1}: ${String(error)}`);
      }
    }
    else {
      rules.push({ kind: "literal", source, replacement });
    }
  }
  return { value: rules, errors };
}

export function applyMapRules(value: string, rules: MapRule[]): string {
  let result = value;
  for (const rule of rules) {
    if (rule.kind === "literal") {
      if (result === rule.source) result = rule.replacement;
    }
    else if (rule.regex) {
      result = result.replace(rule.regex, rule.replacement);
    }
  }
  return result.trim();
}

function scalarText(value: RankScalar): string {
  if (value === null || value === undefined || value === false || value === "") return "";
  if (value === true) return "1";
  return String(value).trim();
}

export function rankFieldText(field: string, value: RankScalar, rules: MapRule[]): string {
  const raw = scalarText(value);
  if (!raw) return "";
  const label = FIELD_LABELS[field] || field;
  const labelText = applyMapRules(label, rules);
  const membershipOnly = MEMBERSHIP_FIELDS.has(field)
    && ["1", "true", "yes", "EI", label].includes(raw);
  const valueText = membershipOnly ? "" : applyMapRules(raw, rules);
  return [...new Set([labelText, valueText].filter(Boolean))].join(" ");
}

function paletteIndex(field: string, value: RankScalar): number | null {
  const text = scalarText(value);
  if (field === "sciif") {
    const numeric = Number.parseFloat(text);
    if (!Number.isNaN(numeric)) {
      if (numeric >= 10) return 0;
      if (numeric >= 4) return 1;
      if (numeric >= 3) return 2;
      if (numeric >= 2) return 3;
      return 4;
    }
  }
  const rank = text.match(/(?:Q|分区|区|T)?\s*([1-5])(?:\D|$)/i)?.[1];
  if (rank) return Number(rank) - 1;
  if (field === "eii") return 1;
  if (field === "sciwarn") return 0;
  return null;
}

function readableForeground(background: string): string {
  const match = background.match(/^#([0-9a-f]{6})$/i);
  if (!match) return "#1f2328";
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.55 ? "#3b3f45" : "#ffffff";
}

export function publicationBadges(
  rank: RankRecord,
  fields: string[],
  rules: MapRule[],
  colors = DEFAULT_RANK_COLORS,
  defaultColor = "#86dad1"
): Badge[] {
  return fields.flatMap(field => {
    const value = rank[field];
    const text = rankFieldText(field, value, rules);
    if (!text) return [];
    const index = paletteIndex(field, value);
    const background = index === null ? defaultColor : (colors[index] || defaultColor);
    return [{
      key: field,
      text,
      background,
      foreground: readableForeground(background),
      title: `${FIELD_LABELS[field] || field}: ${scalarText(value)}`
    }];
  });
}

export function parseCSV(value: string): string[] {
  return [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
}

export function publicationSortKey(rank: RankRecord, specification: string[]): string {
  return specification.map(part => {
    const descending = part.startsWith("-");
    const field = descending ? part.slice(1) : part;
    const value = scalarText(rank[field]);
    const numeric = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
    if (!Number.isNaN(numeric) && value) {
      const normalized = descending ? 999999 - numeric : numeric;
      return `0${normalized.toFixed(6).padStart(16, "0")}`;
    }
    const text = descending
      ? [...value].map(char => String.fromCodePoint(0x10ffff - (char.codePointAt(0) || 0))).join("")
      : value;
    return `1${text}`;
  }).join("\u001e");
}

export function extractEasyScholarRank(response: unknown): RankRecord {
  if (!response || typeof response !== "object") return {};
  const root = response as Record<string, any>;
  const data = root.data && typeof root.data === "object" ? root.data : root;
  const official = data.officialRank?.all;
  const result: RankRecord = official && typeof official === "object" ? { ...official } : {};
  const rankInfo = Array.isArray(data.customRank?.rankInfo) ? data.customRank.rankInfo : [];
  const selectedRanks = Array.isArray(data.customRank?.rank) ? data.customRank.rank : [];
  const rankFieldByNumber: Record<string, string> = {
    "1": "oneRankText",
    "2": "twoRankText",
    "3": "threeRankText",
    "4": "fourRankText",
    "5": "fiveRankText"
  };
  for (const selected of selectedRanks) {
    const [uuid, number] = String(selected).split("&&&");
    const info = rankInfo.find((candidate: any) => String(candidate?.uuid) === uuid);
    const rankField = rankFieldByNumber[number];
    if (info?.abbName && rankField && info[rankField] !== undefined) {
      result[String(info.abbName)] = info[rankField];
    }
  }
  return result;
}

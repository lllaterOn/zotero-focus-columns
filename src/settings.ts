import { DEFAULT_MAP, DEFAULT_RANK_COLORS, PREF_BRANCH } from "./constants";
import { parseCSV, parseMapRules } from "./domain/publication";
import type { MapRule } from "./types";

export interface SettingsSnapshot {
  publicationColumn: boolean;
  hashTagsColumn: boolean;
  statusColumn: boolean;
  remarkColumn: boolean;
  publicationInfoRow: boolean;
  remarkInfoRow: boolean;
  autoFetchMissing: boolean;
  secretKey: string;
  endpoint: string;
  fields: string[];
  sort: string[];
  mapSource: string;
  mapRules: MapRule[];
  rankColors: string[];
  publicationDefaultColor: string;
  hashTagsDefaultColor: string;
}

export interface SyncableSettings {
  features: {
    publicationColumn: boolean;
    hashTagsColumn: boolean;
    statusColumn: boolean;
    remarkColumn: boolean;
    publicationInfoRow: boolean;
    remarkInfoRow: boolean;
  };
  autoFetchMissing: boolean;
  endpoint: string;
  fields: string[];
  sort: string[];
  mapSource: string;
  rankColors: string[];
  publicationDefaultColor: string;
  hashTagsDefaultColor: string;
}

export interface SyncPreferences {
  enabled: boolean;
  publications: boolean;
  settings: boolean;
}

function pref(name: string, fallback: unknown): any {
  const value = Zotero.Prefs.get(PREF_BRANCH + name, true);
  return value === undefined || value === null ? fallback : value;
}

function boolPref(name: string, fallback: boolean): boolean {
  return Boolean(pref(name, fallback));
}

export function defaultSyncableSettings(): SyncableSettings {
  return {
    features: {
      publicationColumn: true,
      hashTagsColumn: true,
      statusColumn: true,
      remarkColumn: true,
      publicationInfoRow: true,
      remarkInfoRow: true
    },
    autoFetchMissing: true,
    endpoint: "https://easyscholar.cc/open/getPublicationRank",
    fields: ["sci", "ssci", "sciUp", "pku", "sciwarn", "eii", "sciif"],
    sort: ["sci", "-sciif"],
    mapSource: DEFAULT_MAP,
    rankColors: [...DEFAULT_RANK_COLORS],
    publicationDefaultColor: "#86dad1",
    hashTagsDefaultColor: "#8e44ad"
  };
}

export function validateEasyScholarEndpoint(value: string): string | null {
  try {
    const url = new URL(value);
    const allowedHost = url.hostname === "easyscholar.cc" || url.hostname.endsWith(".easyscholar.cc");
    if (url.protocol !== "https:" || !allowedHost) {
      return "EasyScholar endpoint must use HTTPS on easyscholar.cc";
    }
    return null;
  }
  catch {
    return "EasyScholar endpoint is not a valid URL";
  }
}

export function validateColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

export function validateAdvancedSettings(values: {
  fields: string;
  sort: string;
  map: string;
  rankColors: string;
  publicationDefaultColor: string;
  hashTagsDefaultColor: string;
  endpoint: string;
}): string[] {
  const errors: string[] = [];
  const fields = parseCSV(values.fields);
  if (!fields.length) errors.push("At least one publication field is required");
  const sort = parseCSV(values.sort).map(value => value.replace(/^-/, ""));
  for (const field of sort) {
    if (!fields.includes(field)) errors.push(`Sort field '${field}' is not enabled`);
  }
  errors.push(...parseMapRules(values.map).errors);
  const colors = parseCSV(values.rankColors);
  if (colors.length !== 5 || colors.some(color => !validateColor(color))) {
    errors.push("Rank colors must contain exactly five #RRGGBB values");
  }
  if (!validateColor(values.publicationDefaultColor)) errors.push("Invalid publication default color");
  if (!validateColor(values.hashTagsDefaultColor)) errors.push("Invalid hash-tag default color");
  const endpointError = validateEasyScholarEndpoint(values.endpoint);
  if (endpointError) errors.push(endpointError);
  return errors;
}

export function readSettings(): SettingsSnapshot {
  const mapSource = String(pref("publication.map", DEFAULT_MAP));
  const parsedMap = parseMapRules(mapSource);
  const colors = parseCSV(String(pref("publication.rankColors", DEFAULT_RANK_COLORS.join(","))));
  const endpoint = String(pref(
    "easyscholar.endpoint",
    "https://easyscholar.cc/open/getPublicationRank"
  ));
  const endpointError = validateEasyScholarEndpoint(endpoint);

  return {
    publicationColumn: boolPref("feature.publicationColumn", true),
    hashTagsColumn: boolPref("feature.hashTagsColumn", true),
    statusColumn: boolPref("feature.statusColumn", true),
    remarkColumn: boolPref("feature.remarkColumn", true),
    publicationInfoRow: boolPref("feature.publicationInfoRow", true),
    remarkInfoRow: boolPref("feature.remarkInfoRow", true),
    autoFetchMissing: boolPref("easyscholar.autoFetchMissing", true),
    secretKey: String(pref("easyscholar.secretKey", "")).trim(),
    endpoint: endpointError ? "https://easyscholar.cc/open/getPublicationRank" : endpoint,
    fields: parseCSV(String(pref("publication.fields", "sci,ssci,sciUp,pku,sciwarn,eii,sciif"))),
    sort: parseCSV(String(pref("publication.sort", "sci,-sciif"))),
    mapSource,
    mapRules: parsedMap.errors.length ? parseMapRules(DEFAULT_MAP).value : parsedMap.value,
    rankColors: colors.length === 5 && colors.every(validateColor) ? colors : DEFAULT_RANK_COLORS,
    publicationDefaultColor: validateColor(String(pref("publication.defaultColor", "#86dad1")))
      ? String(pref("publication.defaultColor", "#86dad1"))
      : "#86dad1",
    hashTagsDefaultColor: validateColor(String(pref("hashTags.defaultColor", "#8e44ad")))
      ? String(pref("hashTags.defaultColor", "#8e44ad"))
      : "#8e44ad"
  };
}

export function readSyncableSettings(): SyncableSettings {
  const settings = readSettings();
  return {
    features: {
      publicationColumn: settings.publicationColumn,
      hashTagsColumn: settings.hashTagsColumn,
      statusColumn: settings.statusColumn,
      remarkColumn: settings.remarkColumn,
      publicationInfoRow: settings.publicationInfoRow,
      remarkInfoRow: settings.remarkInfoRow
    },
    autoFetchMissing: settings.autoFetchMissing,
    endpoint: settings.endpoint,
    fields: [...settings.fields],
    sort: [...settings.sort],
    mapSource: settings.mapSource,
    rankColors: [...settings.rankColors],
    publicationDefaultColor: settings.publicationDefaultColor,
    hashTagsDefaultColor: settings.hashTagsDefaultColor
  };
}

export function validateSyncableSettings(value: SyncableSettings): string[] {
  if (!value || typeof value !== "object" || !value.features) return ["Invalid synced settings"];
  const expectedTopLevel = [
    "features", "autoFetchMissing", "endpoint", "fields", "sort", "mapSource",
    "rankColors", "publicationDefaultColor", "hashTagsDefaultColor"
  ];
  const expectedFeatures = [
    "publicationColumn", "hashTagsColumn", "statusColumn", "remarkColumn",
    "publicationInfoRow", "remarkInfoRow"
  ];
  if (Object.keys(value).sort().join("\n") !== expectedTopLevel.sort().join("\n")
    || Object.keys(value.features).sort().join("\n") !== expectedFeatures.sort().join("\n")) {
    return ["Unexpected synced setting"];
  }
  const booleans = [...expectedFeatures.map(name => value.features[name as keyof typeof value.features]), value.autoFetchMissing];
  if (booleans.some(candidate => typeof candidate !== "boolean")) {
    return ["Invalid synced feature settings"];
  }
  if (!Array.isArray(value.fields) || !value.fields.every(candidate => typeof candidate === "string")
    || !Array.isArray(value.sort) || !value.sort.every(candidate => typeof candidate === "string")
    || !Array.isArray(value.rankColors) || !value.rankColors.every(candidate => typeof candidate === "string")
    || typeof value.endpoint !== "string"
    || typeof value.mapSource !== "string"
    || typeof value.publicationDefaultColor !== "string"
    || typeof value.hashTagsDefaultColor !== "string") {
    return ["Invalid synced list settings"];
  }
  return validateAdvancedSettings({
    fields: value.fields.join(","),
    sort: value.sort.join(","),
    map: String(value.mapSource || ""),
    rankColors: value.rankColors.join(","),
    publicationDefaultColor: String(value.publicationDefaultColor || ""),
    hashTagsDefaultColor: String(value.hashTagsDefaultColor || ""),
    endpoint: String(value.endpoint || "")
  });
}

export function writeSyncableSettings(value: SyncableSettings): void {
  const errors = validateSyncableSettings(value);
  if (errors.length) throw new Error(errors.join("; "));
  for (const [name, enabled] of Object.entries(value.features)) {
    Zotero.Prefs.set(`${PREF_BRANCH}feature.${name}`, enabled, true);
  }
  Zotero.Prefs.set(`${PREF_BRANCH}easyscholar.autoFetchMissing`, value.autoFetchMissing, true);
  Zotero.Prefs.set(`${PREF_BRANCH}easyscholar.endpoint`, value.endpoint, true);
  Zotero.Prefs.set(`${PREF_BRANCH}publication.fields`, value.fields.join(","), true);
  Zotero.Prefs.set(`${PREF_BRANCH}publication.sort`, value.sort.join(","), true);
  Zotero.Prefs.set(`${PREF_BRANCH}publication.map`, value.mapSource, true);
  Zotero.Prefs.set(`${PREF_BRANCH}publication.rankColors`, value.rankColors.join(","), true);
  Zotero.Prefs.set(`${PREF_BRANCH}publication.defaultColor`, value.publicationDefaultColor, true);
  Zotero.Prefs.set(`${PREF_BRANCH}hashTags.defaultColor`, value.hashTagsDefaultColor, true);
}

export function readSyncPreferences(): SyncPreferences {
  return {
    enabled: boolPref("sync.enabled", false),
    publications: boolPref("sync.publications", true),
    settings: boolPref("sync.settings", false)
  };
}

export function writeSyncPreferences(value: SyncPreferences): void {
  Zotero.Prefs.set(`${PREF_BRANCH}sync.enabled`, value.enabled, true);
  Zotero.Prefs.set(`${PREF_BRANCH}sync.publications`, value.publications, true);
  Zotero.Prefs.set(`${PREF_BRANCH}sync.settings`, value.settings, true);
}

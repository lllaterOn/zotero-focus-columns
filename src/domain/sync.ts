import {
  PLUGIN_ID,
  SYNC_DATA_MAX_CHARACTERS,
  SYNC_NOTE_MARKER,
  SYNC_NOTE_TITLE
} from "../constants";
import { validateSyncableSettings, type SyncableSettings } from "../settings";
import type { PublicationCacheFile } from "../types";
import { normalizePublicationName } from "./publication";

export type SyncChannelName = "publications" | "settings";
export type SyncChannelData = PublicationCacheFile | SyncableSettings;

export interface SyncedChannel<T extends SyncChannelData> {
  revision: number;
  updatedAt: string;
  writerID: string;
  baseHash: string | null;
  contentHash: string;
  data: T;
}

export interface FocusColumnsSyncData {
  schemaVersion: 1;
  pluginID: typeof PLUGIN_ID;
  pluginVersion: string;
  updatedAt: string;
  channels: {
    publications?: SyncedChannel<PublicationCacheFile>;
    settings?: SyncedChannel<SyncableSettings>;
  };
}

export interface ParsedSyncData {
  value: FocusColumnsSyncData;
  migrated: boolean;
}

export type ReconcileAction = "equal" | "pull" | "push" | "conflict";

export class SyncDataError extends Error {
  constructor(readonly kind: "missing" | "invalid" | "newer-schema" | "too-large") {
    super(kind);
  }
}

function hasOnlyKeys(value: object, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.join("\n") === [...expected].sort().join("\n");
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(candidate => canonicalValue(candidate));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const candidate = (value as Record<string, unknown>)[key];
      if (candidate !== undefined) output[key] = canonicalValue(candidate);
    }
    return output;
  }
  return value;
}

export function canonicalJSON(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function contentHash(value: unknown): string {
  const text = canonicalJSON(value);
  let first = 0xdeadbeef ^ text.length;
  let second = 0x41c6ce57 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507)
    ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507)
    ^ Math.imul(first ^ (first >>> 13), 3266489909);
  return `${(second >>> 0).toString(16).padStart(8, "0")}${(first >>> 0).toString(16).padStart(8, "0")}`;
}

export function createSyncData(pluginVersion: string): FocusColumnsSyncData {
  return {
    schemaVersion: 1,
    pluginID: PLUGIN_ID,
    pluginVersion,
    updatedAt: new Date().toISOString(),
    channels: {}
  };
}

export function createSyncedChannel<T extends SyncChannelData>(
  data: T,
  writerID: string,
  previous?: SyncedChannel<T>
): SyncedChannel<T> {
  return {
    revision: (previous?.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
    writerID,
    baseHash: previous?.contentHash || null,
    contentHash: contentHash(data),
    data: JSON.parse(JSON.stringify(data)) as T
  };
}

export function reconcileChannel<T extends SyncChannelData>(
  localData: T,
  localHeadHash: string | null,
  remote: SyncedChannel<T> | undefined,
  localIsPristine: boolean
): ReconcileAction {
  if (!remote) return "push";
  const localHash = contentHash(localData);
  if (localHash === remote.contentHash) return "equal";
  if (!localHeadHash) return localIsPristine ? "pull" : "conflict";
  if (localHash === localHeadHash) return "pull";
  if (remote.contentHash === localHeadHash) return "push";
  return "conflict";
}

function validPublicationCache(value: unknown): value is PublicationCacheFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PublicationCacheFile>;
  return hasOnlyKeys(candidate, ["schemaVersion", "generatedAt", "entries"])
    && candidate.schemaVersion === 1
    && typeof candidate.generatedAt === "string"
    && Boolean(candidate.entries)
    && typeof candidate.entries === "object"
    && !Array.isArray(candidate.entries)
    && Object.entries(candidate.entries as Record<string, any>).every(([key, entry]) => (
      Boolean(entry)
      && typeof entry === "object"
      && !Array.isArray(entry)
      && hasOnlyKeys(entry, ["publication", "rank", "source", "fetchedAt"])
      && typeof entry.publication === "string"
      && Boolean(entry.publication.trim())
      && key === normalizePublicationName(key)
      && Boolean(entry.rank)
      && typeof entry.rank === "object"
      && !Array.isArray(entry.rank)
      && Object.values(entry.rank).every(rank => (
        rank === null
        || typeof rank === "string"
        || typeof rank === "number"
        || typeof rank === "boolean"
      ))
      && ["easyscholar", "zotero-style-6.0.8-import", "user-cleared"].includes(entry.source)
      && (entry.fetchedAt === null || typeof entry.fetchedAt === "string")
    ));
}

function validChannel<T extends SyncChannelData>(
  value: unknown,
  validateData: (data: unknown) => data is T
): value is SyncedChannel<T> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SyncedChannel<T>>;
  return hasOnlyKeys(candidate, ["revision", "updatedAt", "writerID", "baseHash", "contentHash", "data"])
    && Number.isInteger(candidate.revision)
    && Number(candidate.revision) > 0
    && typeof candidate.updatedAt === "string"
    && typeof candidate.writerID === "string"
    && (candidate.baseHash === null || typeof candidate.baseHash === "string")
    && typeof candidate.contentHash === "string"
    && validateData(candidate.data)
    && candidate.contentHash === contentHash(candidate.data);
}

function validSettings(value: unknown): value is SyncableSettings {
  return validateSyncableSettings(value as SyncableSettings).length === 0;
}

function validateCurrent(value: unknown): FocusColumnsSyncData {
  if (!value || typeof value !== "object") throw new SyncDataError("invalid");
  const candidate = value as Partial<FocusColumnsSyncData>;
  if (Number(candidate.schemaVersion) > 1) throw new SyncDataError("newer-schema");
  if (!hasOnlyKeys(candidate, ["schemaVersion", "pluginID", "pluginVersion", "updatedAt", "channels"])
    || candidate.schemaVersion !== 1
    || candidate.pluginID !== PLUGIN_ID
    || typeof candidate.pluginVersion !== "string"
    || typeof candidate.updatedAt !== "string"
    || !candidate.channels
    || typeof candidate.channels !== "object") {
    throw new SyncDataError("invalid");
  }
  if (!hasOnlyKeys(candidate.channels, Object.keys(candidate.channels).filter(key => (
    key === "publications" || key === "settings"
  ))) || Object.keys(candidate.channels).some(key => key !== "publications" && key !== "settings")) {
    throw new SyncDataError("invalid");
  }
  if (candidate.channels.publications
    && !validChannel(candidate.channels.publications, validPublicationCache)) {
    throw new SyncDataError("invalid");
  }
  if (candidate.channels.settings
    && !validChannel(candidate.channels.settings, validSettings)) {
    throw new SyncDataError("invalid");
  }
  return candidate as FocusColumnsSyncData;
}

function migrateLegacy(value: any, pluginVersion: string): FocusColumnsSyncData | null {
  if (!value || value.schemaVersion !== 0 || value.pluginID !== PLUGIN_ID) return null;
  const writerID = typeof value.writerID === "string" ? value.writerID : "legacy";
  const migrated = createSyncData(pluginVersion);
  if (validPublicationCache(value.publications)) {
    migrated.channels.publications = createSyncedChannel(value.publications, writerID);
  }
  if (validSettings(value.settings)) {
    migrated.channels.settings = createSyncedChannel(value.settings, writerID);
  }
  return migrated;
}

function escapeHTML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeHTML(value: string): string {
  return value
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

export function renderSyncNote(value: FocusColumnsSyncData): string {
  const serialized = JSON.stringify(value);
  const html = `<p><strong>${SYNC_NOTE_TITLE}</strong></p>`
    + "<p>Managed by Focus Columns. Do not edit this synchronization data manually.</p>"
    + `<pre>${SYNC_NOTE_MARKER}\n${escapeHTML(serialized)}</pre>`;
  if (html.length > SYNC_DATA_MAX_CHARACTERS) throw new SyncDataError("too-large");
  return html;
}

export function parseSyncNote(html: string, pluginVersion: string): ParsedSyncData {
  const blocks = [...String(html).matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)];
  const block = blocks.map(match => decodeHTML(match[1])).find(text => text.includes(SYNC_NOTE_MARKER));
  if (!block) throw new SyncDataError("missing");
  const source = block.slice(block.indexOf(SYNC_NOTE_MARKER) + SYNC_NOTE_MARKER.length).trim();
  if (source.length > SYNC_DATA_MAX_CHARACTERS) throw new SyncDataError("too-large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  }
  catch {
    throw new SyncDataError("invalid");
  }
  if (Number((parsed as any)?.schemaVersion) > 1) throw new SyncDataError("newer-schema");
  const legacy = migrateLegacy(parsed, pluginVersion);
  return legacy
    ? { value: legacy, migrated: true }
    : { value: validateCurrent(parsed), migrated: false };
}

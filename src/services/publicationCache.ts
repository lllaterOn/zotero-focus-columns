import { CACHE_FILE_NAME } from "../constants";
import { normalizePublicationName } from "../domain/publication";
import type { PublicationCacheEntry, PublicationCacheFile, RankRecord } from "../types";

function emptyCache(): PublicationCacheFile {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    entries: {}
  };
}

function isRankRecord(value: unknown): value is RankRecord {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(candidate => (
      candidate === null
      || candidate === undefined
      || typeof candidate === "string"
      || typeof candidate === "number"
      || typeof candidate === "boolean"
    ));
}

function isValidCache(value: unknown): value is PublicationCacheFile {
  if (!value || typeof value !== "object") return false;
  const cache = value as Partial<PublicationCacheFile>;
  return cache.schemaVersion === 1 && Boolean(cache.entries) && typeof cache.entries === "object";
}

function normalizedCache(value: PublicationCacheFile): PublicationCacheFile {
  if (!isValidCache(value)) throw new Error("Unsupported publication cache schema");
  const entries: Record<string, PublicationCacheEntry> = {};
  for (const [key, entry] of Object.entries(value.entries)) {
    const candidate = entry as Partial<PublicationCacheEntry>;
    if (!candidate.publication
      || !isRankRecord(candidate.rank)
      || (candidate.source !== "easyscholar" && candidate.source !== "user-cleared")) continue;
    entries[normalizePublicationName(key)] = {
      publication: String(candidate.publication),
      rank: { ...candidate.rank },
      source: candidate.source,
      fetchedAt: candidate.fetchedAt ? String(candidate.fetchedAt) : null
    };
  }
  return {
    schemaVersion: 1,
    generatedAt: String(value.generatedAt || new Date().toISOString()),
    entries
  };
}

export class PublicationCache {
  readonly path: string;
  private data = emptyCache();
  private mutationChain: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(path = PathUtils.join(Zotero.DataDirectory.dir, CACHE_FILE_NAME)) {
    this.path = path;
  }

  async load(): Promise<void> {
    if (!(await IOUtils.exists(this.path))) return;
    try {
      const parsed = JSON.parse(await IOUtils.readUTF8(this.path));
      if (!isValidCache(parsed)) throw new Error("Unsupported publication cache schema");
      this.data = normalizedCache(parsed);
    }
    catch (error) {
      Zotero.logError(error);
      const backup = `${this.path}.invalid-${Date.now()}`;
      try {
        await IOUtils.copy(this.path, backup);
      }
      catch (backupError) {
        Zotero.logError(backupError);
      }
      this.data = emptyCache();
    }
  }

  has(publication: string): boolean {
    return Object.hasOwn(this.data.entries, normalizePublicationName(publication));
  }

  get(publication: string): PublicationCacheEntry | null {
    return this.data.entries[normalizePublicationName(publication)] || null;
  }

  snapshot(): PublicationCacheFile {
    return JSON.parse(JSON.stringify(this.data)) as PublicationCacheFile;
  }

  isEmpty(): boolean {
    return Object.keys(this.data.entries).length === 0;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  hasRankData(publication: string): boolean {
    const entry = this.get(publication);
    return Boolean(entry && Object.values(entry.rank).some(value => (
      value !== null
      && value !== undefined
      && value !== false
      && String(value).trim() !== ""
    )));
  }

  async set(
    publication: string,
    rank: RankRecord,
    source: PublicationCacheEntry["source"] = "easyscholar"
  ): Promise<void> {
    const key = normalizePublicationName(publication);
    if (!key) return;
    await this.mutate(async () => {
      const previous = this.data.entries[key];
      const previousGeneratedAt = this.data.generatedAt;
      this.data.entries[key] = {
        publication: publication.trim(),
        rank,
        source,
        fetchedAt: source === "easyscholar" ? new Date().toISOString() : null
      };
      this.data.generatedAt = new Date().toISOString();
      try {
        await this.save();
      }
      catch (error) {
        if (previous) this.data.entries[key] = previous;
        else delete this.data.entries[key];
        this.data.generatedAt = previousGeneratedAt;
        throw error;
      }
      this.notifyChange();
    });
  }

  async replace(value: PublicationCacheFile): Promise<void> {
    const next = normalizedCache(value);
    await this.mutate(async () => {
      const previous = this.data;
      this.data = next;
      try {
        await this.save();
      }
      catch (error) {
        this.data = previous;
        throw error;
      }
      this.notifyChange();
    });
  }

  async clearRanks(publications: string[]): Promise<{ deleted: number; skipped: number }> {
    const unique = new Map<string, string>();
    for (const publication of publications) {
      const key = normalizePublicationName(publication);
      if (key && !unique.has(key)) unique.set(key, publication.trim());
    }
    return this.mutate(async () => {
      const deletable = [...unique].filter(([, publication]) => this.hasRankData(publication));
      if (!deletable.length) return { deleted: 0, skipped: unique.size };

      const previous = new Map(deletable.map(([key]) => [key, this.data.entries[key]]));
      const previousGeneratedAt = this.data.generatedAt;
      for (const [key, publication] of deletable) {
        this.data.entries[key] = {
          publication: this.data.entries[key]?.publication || publication,
          rank: {},
          source: "user-cleared",
          fetchedAt: null
        };
      }
      this.data.generatedAt = new Date().toISOString();
      try {
        await this.save();
      }
      catch (error) {
        for (const [key, entry] of previous) this.data.entries[key] = entry;
        this.data.generatedAt = previousGeneratedAt;
        throw error;
      }
      this.notifyChange();
      return { deleted: deletable.length, skipped: unique.size - deletable.length };
    });
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.mutationChain.then(operation);
    this.mutationChain = task.then(() => undefined, () => undefined);
    return task;
  }

  private async save(): Promise<void> {
    const serialized = JSON.stringify(this.data, null, 2) + "\n";
    await IOUtils.writeUTF8(this.path, serialized, { tmpPath: `${this.path}.tmp` });
  }

  private notifyChange(): void {
    for (const listener of this.listeners) listener();
  }
}

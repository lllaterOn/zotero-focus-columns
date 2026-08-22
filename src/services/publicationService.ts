import { normalizePublicationName } from "../domain/publication";
import type { SettingsSnapshot } from "../settings";
import type { PublicationCacheEntry } from "../types";
import { EasyScholarClient, EasyScholarError } from "./easyScholar";
import { PublicationCache } from "./publicationCache";

interface QueueEntry {
  publication: string;
  attempts: number;
}

export interface ManualUpdateResult {
  success: number;
  empty: number;
  failed: number;
  error: EasyScholarError | null;
}

export interface PublicationClearPlan {
  publications: string[];
  skipped: number;
}

export interface PublicationClearResult {
  deleted: number;
  skipped: number;
  error: EasyScholarError | null;
}

function updateError(error: unknown): EasyScholarError {
  return error instanceof EasyScholarError
    ? error
    : new EasyScholarError("cache", false);
}

export function publicationTitle(item: any): string {
  if (!item?.isRegularItem?.()) return "";
  for (const field of ["publicationTitle", "proceedingsTitle"]) {
    const value = String(item.getField(field) || "").trim();
    if (value) return value;
  }
  return "";
}

export class PublicationService {
  private readonly queued = new Map<string, QueueEntry>();
  private draining = false;
  private stopped = false;

  constructor(
    readonly cache: PublicationCache,
    readonly client: EasyScholarClient,
    private readonly getSettings: () => SettingsSnapshot,
    private readonly onUpdate: () => void
  ) {}

  get(publication: string): PublicationCacheEntry | null {
    return this.cache.get(publication);
  }

  queueMissing(publication: string): void {
    const settings = this.getSettings();
    const key = normalizePublicationName(publication);
    if (!key || !settings.autoFetchMissing || !settings.secretKey || this.cache.has(publication)) return;
    if (!this.queued.has(key)) this.queued.set(key, { publication, attempts: 0 });
    void this.drain();
  }

  stop(): void {
    this.stopped = true;
    this.queued.clear();
  }

  async updateItems(items: any[]): Promise<ManualUpdateResult> {
    const publications = [...new Set(items.map(publicationTitle).filter(Boolean))];
    const result: ManualUpdateResult = { success: 0, empty: 0, failed: 0, error: null };
    for (const publication of publications) {
      try {
        const rank = await this.client.fetch(publication);
        await this.cache.set(publication, rank);
        if (Object.keys(rank).length) result.success += 1;
        else result.empty += 1;
      }
      catch (error) {
        const failure = updateError(error);
        result.failed += 1;
        result.error = failure;
        Zotero.logError(failure);
        break;
      }
    }
    this.onUpdate();
    return result;
  }

  planClearItems(items: any[]): PublicationClearPlan {
    const unique = new Map<string, string>();
    for (const item of items) {
      const publication = publicationTitle(item);
      const key = normalizePublicationName(publication);
      if (key && !unique.has(key)) unique.set(key, publication);
    }
    const publications = [...unique.values()].filter(publication => this.cache.hasRankData(publication));
    return { publications, skipped: unique.size - publications.length };
  }

  async clearItems(plan: PublicationClearPlan): Promise<PublicationClearResult> {
    try {
      const result = await this.cache.clearRanks(plan.publications);
      this.onUpdate();
      return {
        deleted: result.deleted,
        skipped: plan.skipped + result.skipped,
        error: null
      };
    }
    catch (error) {
      const failure = updateError(error);
      Zotero.logError(failure);
      this.onUpdate();
      return { deleted: 0, skipped: plan.skipped, error: failure };
    }
  }

  private async drain(): Promise<void> {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      while (this.queued.size && !this.stopped) {
        const entry = this.queued.entries().next().value?.[1] as QueueEntry | undefined;
        if (!entry) return;
        this.queued.delete(normalizePublicationName(entry.publication));
        while (!this.stopped) {
          try {
            const rank = await this.client.fetch(entry.publication);
            await this.cache.set(entry.publication, rank);
            this.onUpdate();
            break;
          }
          catch (error) {
            const failure = updateError(error);
            if (failure.retryable && entry.attempts < 2) {
              entry.attempts += 1;
              await new Promise(resolve => setTimeout(resolve, 750 * (2 ** entry.attempts)));
              continue;
            }
            Zotero.logError(failure);
            this.queued.clear();
            return;
          }
        }
      }
    }
    finally {
      this.draining = false;
      if (this.queued.size && !this.stopped) void this.drain();
    }
  }
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsSnapshot } from "../src/settings";
import { EasyScholarError } from "../src/services/easyScholar";
import { PublicationService } from "../src/services/publicationService";

function item(publication: string): any {
  return {
    isRegularItem: () => true,
    getField: (field: string) => field === "publicationTitle" ? publication : ""
  };
}

function settings(): SettingsSnapshot {
  return {
    publicationColumn: true,
    hashTagsColumn: true,
    statusColumn: true,
    remarkColumn: true,
    publicationInfoRow: true,
    remarkInfoRow: true,
    autoFetchMissing: true,
    secretKey: "test-key",
    endpoint: "https://easyscholar.cc/open/getPublicationRank",
    fields: ["sci"],
    sort: ["sci"],
    mapSource: "",
    mapRules: [],
    rankColors: ["#111111", "#222222", "#333333", "#444444", "#555555"],
    publicationDefaultColor: "#666666",
    hashTagsDefaultColor: "#777777"
  };
}

describe("PublicationService updates", () => {
  beforeEach(() => {
    (globalThis as any).Zotero = { logError: vi.fn() };
  });

  it("stops a manual batch on the first systemic error and preserves cached data", async () => {
    const cache = {
      has: vi.fn(() => true),
      get: vi.fn((_publication: string) => ({ publication: "Nature", rank: { sci: "Q1" } })),
      set: vi.fn()
    };
    const client = {
      fetch: vi.fn().mockRejectedValue(new EasyScholarError("invalid-key", false, 40002))
    };
    const onUpdate = vi.fn();
    const service = new PublicationService(cache as any, client as any, settings, onUpdate);

    const result = await service.updateItems([item("Nature"), item("Science")]);

    expect(result).toMatchObject({ success: 0, empty: 0, failed: 1 });
    expect(result.error).toMatchObject({ kind: "invalid-key", code: 40002 });
    expect(client.fetch).toHaveBeenCalledOnce();
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.get("Nature")?.rank).toEqual({ sci: "Q1" });
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it("retries one transient background failure twice, then stops the queue", async () => {
    vi.useFakeTimers();
    const cache = {
      has: vi.fn(() => false),
      get: vi.fn(() => null),
      set: vi.fn()
    };
    const client = {
      fetch: vi.fn().mockRejectedValue(new EasyScholarError("timeout", true))
    };
    const service = new PublicationService(cache as any, client as any, settings, vi.fn());

    service.queueMissing("Nature");
    service.queueMissing("Science");
    await vi.runAllTimersAsync();

    expect(client.fetch).toHaveBeenCalledTimes(3);
    expect(client.fetch).toHaveBeenCalledWith("Nature");
    expect(client.fetch).not.toHaveBeenCalledWith("Science");
    expect(cache.set).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("plans a clear by normalized publication name and skips empty cache entries", () => {
    const cache = {
      hasRankData: vi.fn((publication: string) => publication.toLowerCase() === "nature")
    };
    const service = new PublicationService(cache as any, {} as any, settings, vi.fn());

    const plan = service.planClearItems([
      item("Nature"),
      item("  nature  "),
      item("Science"),
      { isRegularItem: () => false, getField: () => "Nature" }
    ]);

    expect(plan).toEqual({ publications: ["Nature"], skipped: 1 });
    expect(cache.hasRankData).toHaveBeenCalledTimes(2);
  });

  it("clears a confirmed plan without calling EasyScholar", async () => {
    const cache = {
      clearRanks: vi.fn().mockResolvedValue({ deleted: 2, skipped: 0 })
    };
    const client = { fetch: vi.fn() };
    const onUpdate = vi.fn();
    const service = new PublicationService(cache as any, client as any, settings, onUpdate);

    const result = await service.clearItems({ publications: ["Nature", "Science"], skipped: 1 });

    expect(result).toEqual({ deleted: 2, skipped: 1, error: null });
    expect(cache.clearRanks).toHaveBeenCalledWith(["Nature", "Science"]);
    expect(client.fetch).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it("reports a cache failure after the cache has rolled back", async () => {
    const cache = {
      clearRanks: vi.fn().mockRejectedValue(new Error("disk full"))
    };
    const onUpdate = vi.fn();
    const service = new PublicationService(cache as any, {} as any, settings, onUpdate);

    const result = await service.clearItems({ publications: ["Nature"], skipped: 0 });

    expect(result).toMatchObject({ deleted: 0, skipped: 0, error: { kind: "cache" } });
    expect(onUpdate).toHaveBeenCalledOnce();
  });
});

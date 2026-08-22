import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicationCache } from "../src/services/publicationCache";

describe("PublicationCache clearing", () => {
  const writeUTF8 = vi.fn();

  beforeEach(() => {
    writeUTF8.mockReset().mockResolvedValue(undefined);
    (globalThis as any).IOUtils = { writeUTF8 };
  });

  it("persists a user-cleared marker and keeps the cache entry present", async () => {
    const cache = new PublicationCache("focus-columns-publications.json");
    await cache.set("Nature", { sci: "Q1", sciif: "48.5" });

    const result = await cache.clearRanks([" Nature ", "nature", "Science"]);

    expect(result).toEqual({ deleted: 1, skipped: 1 });
    expect(cache.has("Nature")).toBe(true);
    expect(cache.hasRankData("Nature")).toBe(false);
    expect(cache.get("Nature")).toMatchObject({
      publication: "Nature",
      rank: {},
      source: "user-cleared",
      fetchedAt: null
    });
    expect(JSON.parse(writeUTF8.mock.calls.at(-1)?.[1]).entries.nature.source)
      .toBe("user-cleared");
  });

  it("allows a later manual update to replace the cleared marker", async () => {
    const cache = new PublicationCache("focus-columns-publications.json");
    await cache.set("Nature", { sci: "Q1" });
    await cache.clearRanks(["Nature"]);
    await cache.set("Nature", { sci: "Q2" });

    expect(cache.hasRankData("Nature")).toBe(true);
    expect(cache.get("Nature")).toMatchObject({
      rank: { sci: "Q2" },
      source: "easyscholar"
    });
  });

  it("rolls back every cleared entry when the single cache write fails", async () => {
    const cache = new PublicationCache("focus-columns-publications.json");
    await cache.set("Nature", { sci: "Q1" });
    await cache.set("Science", { sci: "Q2" });
    writeUTF8.mockRejectedValueOnce(new Error("disk full"));

    await expect(cache.clearRanks(["Nature", "Science"])).rejects.toThrow("disk full");

    expect(cache.get("Nature")?.rank).toEqual({ sci: "Q1" });
    expect(cache.get("Science")?.rank).toEqual({ sci: "Q2" });
    writeUTF8.mockResolvedValueOnce(undefined);
    await expect(cache.clearRanks(["Nature"])).resolves.toEqual({ deleted: 1, skipped: 0 });
  });
});

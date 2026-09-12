import { describe, expect, it } from "vitest";
import { currentStatus, hashTagBadges, hashTagsAfterSelection, statusCandidates, statusTagsAfterSelection } from "../src/domain/tags";

const colors = new Map([
  ["/ no", { color: "#ff0000", position: 1 }],
  ["/ yes", { color: "#00aa00", position: 2 }],
  ["/ ing", { color: "#ffaa00", position: 0 }],
  ["#重点", { color: "#2255aa", position: 3 }],
  ["normal", { color: "#000000", position: 4 }]
]);

describe("native tag views", () => {
  it("replaces all hash tags without changing other tags or the input", () => {
    const original = [{ tag: "#old", type: 1 }, { tag: "##other" },
      { tag: "/ ing", type: 0 }, { tag: "normal", type: 1 }];
    const before = structuredClone(original);
    expect(hashTagsAfterSelection(original, "#重点")).toEqual([
      { tag: "/ ing", type: 0 }, { tag: "normal", type: 1 }, { tag: "#重点", type: 0 }
    ]);
    expect(original).toEqual(before);
  });

  it("clears only hash tags and refuses an invalid selection", () => {
    const tags = [{ tag: "#old" }, { tag: "normal", type: 1 }];
    expect(hashTagsAfterSelection(tags, null)).toEqual([{ tag: "normal", type: 1 }]);
    expect(() => hashTagsAfterSelection(tags, "normal")).toThrow();
    expect(hashTagsAfterSelection([], "#new")).toEqual([{ tag: "#new", type: 0 }]);
  });
  it("shows every hash tag and strips only the first hash", () => {
    const badges = hashTagBadges(
      [{ tag: "#重点" }, { tag: "#a/b" }, { tag: "normal" }],
      colors
    );
    expect(badges.map(({ text }) => text)).toEqual(["重点", "a/b"]);
    expect(badges[1].background).toBe("#8e44ad");
  });

  it("derives status candidates from all colored slash tags", () => {
    expect(statusCandidates(colors).map(({ tag }) => tag))
      .toEqual(["/ ing", "/ no", "/ yes"]);
  });

  it("uses the earliest colored status if inconsistent legacy data contains two", () => {
    expect(currentStatus([{ tag: "/ yes" }, { tag: "/ ing" }], colors)?.tag).toBe("/ ing");
  });

  it("replaces the entire colored slash status group and preserves other tags", () => {
    const next = statusTagsAfterSelection(
      [{ tag: "/ ing" }, { tag: "#重点" }, { tag: "normal" }],
      colors,
      "/ yes"
    );
    expect(next).toEqual([{ tag: "#重点" }, { tag: "normal" }, { tag: "/ yes", type: 0 }]);
  });
});

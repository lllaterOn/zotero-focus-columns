import { describe, expect, it } from "vitest";
import { currentStatus, hashTagBadges, statusCandidates, statusTagsAfterSelection } from "../src/domain/tags";

const colors = new Map([
  ["/ no", { color: "#ff0000", position: 1 }],
  ["/ yes", { color: "#00aa00", position: 2 }],
  ["/ ing", { color: "#ffaa00", position: 0 }],
  ["#重点", { color: "#2255aa", position: 3 }],
  ["normal", { color: "#000000", position: 4 }]
]);

describe("native tag views", () => {
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

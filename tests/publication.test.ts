import { describe, expect, it } from "vitest";
import { DEFAULT_MAP } from "../src/constants";
import {
  extractEasyScholarRank,
  normalizePublicationName,
  parseMapRules,
  publicationBadges,
  rankFieldText
} from "../src/domain/publication";

const parsed = parseMapRules(DEFAULT_MAP);

describe("publication rank rendering", () => {
  it("parses the confirmed mapping without errors", () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toHaveLength(25);
  });

  it("accepts the original comma-separated mapping form", () => {
    const result = parseMapRules("SCI升级版=中, SCI=, /^(\\d+)\\.(\\d{1})\\d*$/=$1.$2");
    expect(result.errors).toEqual([]);
    expect(result.value).toHaveLength(3);
  });

  it("recreates the primary visible labels", () => {
    expect(rankFieldText("sci", "Q1", parsed.value)).toBe("Q1");
    expect(rankFieldText("sciUp", "工程技术1区", parsed.value)).toBe("中 工1");
    expect(rankFieldText("eii", "EI", parsed.value)).toBe("EI");
    expect(rankFieldText("sciif", "8.94", parsed.value)).toBe("IF 8.9");
    expect(rankFieldText("pku", 1, parsed.value)).toBe("北核");
  });

  it("produces ordered badges for a representative journal", () => {
    const badges = publicationBadges(
      { sci: "Q1", sciUp: "工程技术1区", eii: "EI", sciif: "8.9" },
      ["sci", "ssci", "sciUp", "pku", "sciwarn", "eii", "sciif"],
      parsed.value
    );
    expect(badges.map(({ text }) => text)).toEqual(["Q1", "中 工1", "EI", "IF 8.9"]);
    expect(badges[0].background).toBe("#ffe2dd");
    expect(badges[3].background).toBe("#e8deee");
  });

  it("normalizes cache keys consistently", () => {
    expect(normalizePublicationName("  Mechanical   Systems  "))
      .toBe("mechanical systems");
  });

  it("extracts official and custom EasyScholar data", () => {
    expect(extractEasyScholarRank({
      data: {
        officialRank: { all: { sci: "Q1" } },
        customRank: {
          rank: ["abc&&&2"],
          rankInfo: [{ uuid: "abc", abbName: "mine", twoRankText: "A" }]
        }
      }
    })).toEqual({ sci: "Q1", mine: "A" });
  });
});

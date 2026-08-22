import { describe, expect, it } from "vitest";
import { validateAdvancedSettings, validateEasyScholarEndpoint } from "../src/settings";

describe("settings validation", () => {
  it("allows only the EasyScholar HTTPS domain for secret-bearing requests", () => {
    expect(validateEasyScholarEndpoint("https://easyscholar.cc/open/getPublicationRank")).toBeNull();
    expect(validateEasyScholarEndpoint("http://easyscholar.cc/open/getPublicationRank")).not.toBeNull();
    expect(validateEasyScholarEndpoint("https://example.com/collect")).not.toBeNull();
  });

  it("validates all editable advanced fields together", () => {
    expect(validateAdvancedSettings({
      fields: "sci,sciif",
      sort: "sci,-sciif",
      map: "SCI=\n/SCIIF/=IF",
      rankColors: "#ffe2dd,#e8deee,#dbeddb,#fadec9,#e9e8e7",
      publicationDefaultColor: "#86dad1",
      hashTagsDefaultColor: "#8e44ad",
      endpoint: "https://easyscholar.cc/open/getPublicationRank"
    })).toEqual([]);
  });
});

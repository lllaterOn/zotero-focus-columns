import { describe, expect, it } from "vitest";
import { readRemark, writeRemark } from "../src/domain/remark";

describe("remark Extra storage", () => {
  it("reads the first remark case-insensitively", () => {
    expect(readRemark("DOI: 10.1/x\n Remark :  keep me ")).toBe("keep me");
  });

  it("adds a remark without changing existing lines", () => {
    expect(writeRemark("DOI: 10.1/x\r\nCitation Key: abc", "重点方法"))
      .toBe("DOI: 10.1/x\r\nCitation Key: abc\r\nremark: 重点方法");
  });

  it("updates one remark and preserves every unrelated byte", () => {
    const before = "DOI: 10.1/x\nremark: old\nCitation Key: abc\n";
    expect(writeRemark(before, "new")).toBe("DOI: 10.1/x\nremark: new\nCitation Key: abc\n");
  });

  it("removes a final remark without introducing a trailing newline", () => {
    expect(writeRemark("DOI: 10.1/x\nremark: old", "")).toBe("DOI: 10.1/x");
  });

  it("removes duplicate remark lines but leaves other lines untouched", () => {
    expect(writeRemark("remark: first\nDOI: x\nremark: second", "kept"))
      .toBe("remark: kept\nDOI: x");
  });
});

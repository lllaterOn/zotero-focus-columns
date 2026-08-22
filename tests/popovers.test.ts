import { describe, expect, it } from "vitest";
import { centeredPopupX } from "../src/features/popovers";

describe("popover placement", () => {
  it("centers the popup on its cell when there is room", () => {
    expect(centeredPopupX(200, 100, 160, 0, 1000)).toBe(170);
  });

  it("keeps the popup inside either screen edge", () => {
    expect(centeredPopupX(0, 40, 160, 0, 1000)).toBe(8);
    expect(centeredPopupX(970, 30, 160, 0, 1000)).toBe(832);
  });

  it("supports screens whose coordinate origin is not zero", () => {
    expect(centeredPopupX(-1200, 100, 200, -1280, 1280)).toBe(-1250);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  createDeletePublicationMenuDefinition,
  createPublicationMenuDefinition,
  easyScholarErrorText,
  WindowUI
} from "../src/features/windowUI";
import { EasyScholarError } from "../src/services/easyScholar";

describe("publication update menu", () => {
  it("registers as an icon-bearing menu item in the official item target", () => {
    const runUpdate = vi.fn();
    const menu = createPublicationMenuDefinition(runUpdate);

    expect(menu).toMatchObject({
      menuType: "menuitem",
      l10nID: "focus-columns-update-publication",
      icon: "chrome://focus-columns/content/icons/focus-columns.svg",
      darkIcon: "chrome://focus-columns/content/icons/focus-columns.svg"
    });
  });

  it("registers deletion as a second icon-bearing command", () => {
    const runDelete = vi.fn();
    const menu = createDeletePublicationMenuDefinition(runDelete);

    expect(menu).toMatchObject({
      menuType: "menuitem",
      l10nID: "focus-columns-delete-publication",
      icon: "chrome://focus-columns/content/icons/focus-columns.svg",
      darkIcon: "chrome://focus-columns/content/icons/focus-columns.svg"
    });
  });

  it("does not clear publication tags when confirmation is cancelled", async () => {
    (globalThis as any).Zotero = { locale: "zh-CN" };
    const alert = vi.fn();
    const confirm = vi.fn(() => false);
    (globalThis as any).Services = { prompt: { alert, confirm } };
    const publications = {
      planClearItems: vi.fn(() => ({ publications: ["Nature"], skipped: 0 })),
      clearItems: vi.fn()
    };
    const ui = new WindowUI(publications as any);
    const window = {
      ZoteroPane: { getSelectedItems: () => [{ isRegularItem: () => true }] }
    };

    await (ui as any).deleteSelected(window);

    expect(confirm).toHaveBeenCalledWith(
      window,
      "Focus Columns",
      expect.stringContaining("同名期刊的其他条目")
    );
    expect(publications.clearItems).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it("reports unique publication counts after a confirmed clear", async () => {
    (globalThis as any).Zotero = { locale: "zh-CN" };
    const alert = vi.fn();
    (globalThis as any).Services = { prompt: { alert, confirm: vi.fn(() => true) } };
    const plan = { publications: ["Nature", "Science"], skipped: 1 };
    const publications = {
      planClearItems: vi.fn(() => plan),
      clearItems: vi.fn().mockResolvedValue({ deleted: 2, skipped: 1, error: null })
    };
    const ui = new WindowUI(publications as any);
    const window = {
      ZoteroPane: { getSelectedItems: () => [{ isRegularItem: () => true }] }
    };

    await (ui as any).deleteSelected(window);

    expect(publications.clearItems).toHaveBeenCalledWith(plan);
    expect(alert).toHaveBeenCalledWith(
      window,
      "Focus Columns",
      "期刊标签删除完成：已删除 2 种期刊，跳过 1 种无可删除标签的期刊。"
    );
  });

  it("enables only when the current selection contains a regular item", () => {
    const runUpdate = vi.fn();
    const menu = createPublicationMenuDefinition(runUpdate);
    const setEnabled = vi.fn();

    menu.onShowing({}, { items: [{ isRegularItem: () => false }], setEnabled });
    expect(setEnabled).toHaveBeenLastCalledWith(false);

    menu.onShowing({}, { items: [{ isRegularItem: () => true }], setEnabled });
    expect(setEnabled).toHaveBeenLastCalledWith(true);
  });

  it("passes the owning Zotero window to the command handler", () => {
    const runUpdate = vi.fn();
    const menu = createPublicationMenuDefinition(runUpdate);
    const window = {};

    menu.onCommand({}, { menuElem: { ownerDocument: { defaultView: window } } });
    expect(runUpdate).toHaveBeenCalledWith(window);
  });

  it("turns EasyScholar failures into a specific message without request details", () => {
    (globalThis as any).Zotero = { locale: "zh-CN" };

    const message = easyScholarErrorText(new EasyScholarError("invalid-key", false, 40002));

    expect(message).toBe("EasyScholar 密钥无效（代码 40002）。");
    expect(message).not.toContain("secretKey");
    expect(message).not.toContain("https://");
  });
});

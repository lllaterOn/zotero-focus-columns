import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type FakeElement = {
  dataset: Record<string, string>;
  hidden: boolean;
  textContent: string;
};

type PreferencesController = {
  formatSyncTime(value: string | null): string;
  renderSyncStatus(status: Record<string, unknown>): void;
};

function fakeElement(): FakeElement {
  return { dataset: {}, hidden: false, textContent: "" };
}

function loadPreferences(locale = "zh-CN") {
  const ids = [
    "focus-sync-status",
    "focus-sync-state",
    "focus-sync-publications-summary",
    "focus-sync-settings-summary",
    "focus-sync-updated",
    "focus-sync-checked",
    "focus-sync-detail"
  ];
  const elements = Object.fromEntries(ids.map(id => [id, fakeElement()])) as Record<string, FakeElement>;
  const context: Record<string, unknown> = {
    Zotero: { locale },
    document: {
      getElementById(id: string) {
        return elements[id] || null;
      }
    },
    setTimeout() {
      return 0;
    }
  };
  const source = readFileSync(new URL("../addon/content/preferences.js", import.meta.url), "utf8");
  runInNewContext(source, context);
  return {
    controller: context.FocusColumnsPreferences as PreferencesController,
    elements
  };
}

function readyStatus() {
  return {
    state: "ready",
    publicationCount: 203,
    syncedPublicationCount: 203,
    publicationsState: "ready",
    settingsState: "ready",
    syncDataUpdatedAt: "2026-08-22T07:40:35.000Z",
    checkedAt: "2026-08-22T07:40:44.000Z",
    detail: "Focus Columns 同步数据已连接。网络同步由 Zotero 负责。"
  };
}

describe("preferences synchronization status", () => {
  it("renders a compact Chinese summary and hides the redundant ready detail", () => {
    const { controller, elements } = loadPreferences();
    controller.renderSyncStatus(readyStatus());

    expect(elements["focus-sync-status"].dataset.state).toBe("ready");
    expect(elements["focus-sync-state"].textContent).toBe("已连接");
    expect(elements["focus-sync-publications-summary"].textContent)
      .toBe("期刊标签：已就绪（本机 203 · 同步笔记 203）");
    expect(elements["focus-sync-settings-summary"].textContent).toBe("设置：已就绪");
    expect(elements["focus-sync-updated"].textContent).not.toContain(":35");
    expect(elements["focus-sync-checked"].textContent).not.toContain(":44");
    expect(elements["focus-sync-detail"].hidden).toBe(true);
    expect(elements["focus-sync-detail"].textContent).toBe("");
  });

  it("shows an error detail separately from the summary", () => {
    const { controller, elements } = loadPreferences();
    controller.renderSyncStatus({
      ...readyStatus(),
      state: "invalid-data",
      publicationsState: "error",
      detail: "同步笔记内容已损坏。"
    });

    expect(elements["focus-sync-status"].dataset.state).toBe("error");
    expect(elements["focus-sync-state"].textContent).toBe("同步笔记内容已损坏");
    expect(elements["focus-sync-detail"].hidden).toBe(false);
    expect(elements["focus-sync-detail"].textContent).toBe("同步笔记内容已损坏。");
  });
});

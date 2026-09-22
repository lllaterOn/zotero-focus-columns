import { beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({
  apply: vi.fn(),
  canUse: vi.fn(() => true),
  capture: vi.fn()
}));

vi.mock("../src/features/viewGroupLayout", () => ({
  applyViewLayout: layout.apply,
  canUseViewLayout: layout.canUse,
  captureViewLayout: layout.capture
}));

import { PREF_BRANCH } from "../src/constants";
import { ViewGroupController } from "../src/features/viewGroups";
import {
  readViewGroupLocalState,
  readViewGroups,
  writeViewGroupLocalState,
  writeViewGroups
} from "../src/services/viewGroupStore";

class FakeNode {
  id = "";
  parentNode: FakeNode | null = null;
  readonly attributes = new Map<string, string>();
  readonly children: FakeNode[] = [];
  private readonly listeners = new Map<string, Array<(event: any) => void>>();

  constructor(readonly localName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(name: string, handler: (event: any) => void): void {
    const handlers = this.listeners.get(name) || [];
    handlers.push(handler);
    this.listeners.set(name, handlers);
  }

  appendChild(node: FakeNode): FakeNode {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  insertBefore(node: FakeNode, before: FakeNode | null): FakeNode {
    node.parentNode = this;
    const index = before ? this.children.indexOf(before) : -1;
    if (index < 0) this.children.push(node);
    else this.children.splice(index, 0, node);
    return node;
  }

  querySelector(selector: string): FakeNode | null {
    if (selector === "spacer") return this.children.find(node => node.localName === "spacer") || null;
    return null;
  }

  replaceChildren(...nodes: FakeNode[]): void {
    for (const child of this.children) child.parentNode = null;
    this.children.splice(0, this.children.length);
    for (const node of nodes) this.appendChild(node);
  }

  remove(): void {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  emit(name: string): void {
    for (const handler of this.listeners.get(name) || []) handler({ target: this });
  }
}

function fixture() {
  const toolbar = new FakeNode("toolbar");
  toolbar.id = "zotero-items-toolbar";
  toolbar.appendChild(new FakeNode("spacer"));
  const find = (node: FakeNode, id: string): FakeNode | null => {
    if (node.id === id) return node;
    for (const child of node.children) {
      const match = find(child, id);
      if (match) return match;
    }
    return null;
  };
  const document = {
    getElementById: (id: string) => find(toolbar, id),
    createXULElement: (name: string) => new FakeNode(name)
  };
  return { window: { document }, toolbar };
}

const preferences = new Map<string, unknown>();
const promptedNames: Array<string | null> = [];
const alerts = vi.fn();
const confirms = vi.fn(() => true);
const prompts = vi.fn();
const logError = vi.fn();
let nextID = 0;

function group(id: string, name: string, columns = [{ key: "title", visible: true }]) {
  return { id, name, columns };
}

beforeEach(() => {
  preferences.clear();
  promptedNames.splice(0);
  alerts.mockClear();
  confirms.mockClear();
  prompts.mockReset().mockImplementation(
    (_window: unknown, _title: string, _message: string, input: { value: string }) => {
      const answer = promptedNames.shift() ?? null;
      if (answer === null) return false;
      input.value = answer;
      return true;
    }
  );
  logError.mockClear();
  nextID = 0;
  layout.apply.mockReset().mockResolvedValue({ missingKeys: [] });
  layout.capture.mockReset();
  layout.canUse.mockReset().mockReturnValue(true);
  vi.stubGlobal("Zotero", {
    locale: "en-US",
    logError,
    Prefs: {
      get: (name: string) => preferences.get(name),
      set: (name: string, value: unknown) => preferences.set(name, value)
    },
    Utilities: { randomString: () => `group${++nextID}` }
  });
  vi.stubGlobal("Services", {
    prompt: {
      alert: alerts,
      confirm: confirms,
      prompt: prompts
    }
  });
});

describe("view-group controller", () => {
  it("saves, selects, and manually updates a layout without losing unavailable columns or widths", async () => {
    const { window } = fixture();
    const controller = new ViewGroupController();
    const pluginColumn = "focus-columns\\@lllateron\\.github\\.io-reading-status";
    layout.capture.mockReturnValueOnce({
      columns: [
        { key: "title", visible: true },
        { key: pluginColumn, visible: false },
        { key: "year", visible: true }
      ],
      widths: { title: 220, [pluginColumn]: 110, year: 80 }
    });
    promptedNames.push("Reading");

    (controller as any).save(window);
    const saved = readViewGroups()[0];
    expect(saved.name).toBe("Reading");
    expect(readViewGroupLocalState()).toEqual({
      activeID: saved.id,
      widthsByGroup: { [saved.id]: { title: 220, [pluginColumn]: 110, year: 80 } }
    });

    await (controller as any).select(window, saved.id);
    expect(layout.apply).toHaveBeenCalledWith(window, saved.columns, {
      title: 220, [pluginColumn]: 110, year: 80
    });

    layout.capture.mockReturnValueOnce({
      columns: [
        { key: "year", visible: false },
        { key: "title", visible: true },
        { key: "dateAdded", visible: true }
      ],
      widths: { year: 84, title: 260, dateAdded: 140 }
    });
    (controller as any).save(window, saved.id);

    expect(readViewGroups()[0].columns).toEqual([
      { key: "year", visible: false },
      { key: "title", visible: true },
      { key: pluginColumn, visible: false },
      { key: "dateAdded", visible: true }
    ]);
    expect(readViewGroupLocalState().widthsByGroup[saved.id]).toEqual({
      title: 260, [pluginColumn]: 110, year: 84, dateAdded: 140
    });
  });

  it("rejects a duplicate name and accepts the next unique trimmed name", () => {
    const { window } = fixture();
    const controller = new ViewGroupController();
    writeViewGroups([group("reading", "Reading"), group("writing", "Writing")]);
    writeViewGroupLocalState({ activeID: "reading", widthsByGroup: {} });
    promptedNames.push(" Writing ", "  Deep reading  ");

    (controller as any).rename(window, "reading");

    expect(readViewGroups().map(candidate => candidate.name)).toEqual(["Deep reading", "Writing"]);
    expect(alerts).toHaveBeenCalledOnce();
    expect(alerts.mock.calls[0][2]).toContain("unique view name");
  });

  it("does not overwrite definitions or local widths changed while a modal prompt is open", () => {
    const { window } = fixture();
    const controller = new ViewGroupController();
    const one = group("one", "One");
    const two = group("two", "Two");
    writeViewGroups([one]);
    writeViewGroupLocalState({ activeID: "one", widthsByGroup: { one: { title: 100 } } });
    layout.capture.mockReturnValue({
      columns: [{ key: "title", visible: true }],
      widths: { title: 180 }
    });
    prompts.mockImplementationOnce(
      (_window: unknown, _title: string, _message: string, input: { value: string }) => {
        writeViewGroups([one, two]);
        writeViewGroupLocalState({
          activeID: "one",
          widthsByGroup: { one: { title: 100 }, two: { title: 240 } }
        });
        input.value = "Three";
        return true;
      }
    );

    (controller as any).save(window);

    expect(readViewGroups().map(candidate => candidate.name)).toEqual(["One", "Two", "Three"]);
    const local = readViewGroupLocalState();
    expect(local.widthsByGroup.two).toEqual({ title: 240 });
    expect(local.widthsByGroup[local.activeID!]).toEqual({ title: 180 });
  });

  it("renames and deletes against fresh state after modal dialogs", () => {
    const { window } = fixture();
    const controller = new ViewGroupController();
    const one = group("one", "One");
    const two = group("two", "Two");
    const synced = group("synced", "Synced");
    writeViewGroups([one, two]);
    writeViewGroupLocalState({
      activeID: "one",
      widthsByGroup: { one: { title: 100 }, two: { title: 200 } }
    });
    prompts.mockImplementationOnce(
      (_window: unknown, _title: string, _message: string, input: { value: string }) => {
        writeViewGroups([one, two, synced]);
        input.value = "Renamed";
        return true;
      }
    );

    (controller as any).rename(window, "one");
    expect(readViewGroups().map(candidate => candidate.name)).toEqual(["Renamed", "Two", "Synced"]);

    confirms.mockImplementationOnce(() => {
      writeViewGroupLocalState({
        activeID: "one",
        widthsByGroup: { one: { title: 100 }, two: { title: 200 }, synced: { title: 300 } }
      });
      return true;
    });
    (controller as any).remove(window, "one");
    expect(readViewGroups().map(candidate => candidate.name)).toEqual(["Two", "Synced"]);
    expect(readViewGroupLocalState()).toEqual({
      activeID: null,
      widthsByGroup: { two: { title: 200 }, synced: { title: 300 } }
    });
  });

  it("moves and deletes the active view while preserving unrelated local widths", () => {
    const { window } = fixture();
    const controller = new ViewGroupController();
    writeViewGroups([group("one", "One"), group("two", "Two"), group("three", "Three")]);
    writeViewGroupLocalState({
      activeID: "two",
      widthsByGroup: { one: { title: 100 }, two: { title: 200 }, three: { title: 300 } }
    });

    (controller as any).move("two", -1);
    expect(readViewGroups().map(candidate => candidate.id)).toEqual(["two", "one", "three"]);

    (controller as any).remove(window, "two");
    expect(confirms).toHaveBeenCalledOnce();
    expect(readViewGroups().map(candidate => candidate.id)).toEqual(["one", "three"]);
    expect(readViewGroupLocalState()).toEqual({
      activeID: null,
      widthsByGroup: { one: { title: 100 }, three: { title: 300 } }
    });
  });

  it("refreshes incoming definitions without applying a layout", () => {
    const { window, toolbar } = fixture();
    const controller = new ViewGroupController();
    writeViewGroups([group("reading", "Reading")]);
    writeViewGroupLocalState({ activeID: "reading", widthsByGroup: { reading: { title: 200 } } });
    controller.load(window);

    writeViewGroups([group("reading", "Remote reading", [
      { key: "year", visible: true }, { key: "title", visible: false }
    ])]);
    controller.refresh();

    const button = toolbar.children.find(node => node.id === "focus-columns-view-groups");
    expect(button?.getAttribute("label")).toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("View: Remote reading");
    expect(button?.getAttribute("tooltiptext")).toBe("View: Remote reading\nSwitch column layouts. Update the view manually after changes. Column widths stay on this computer.");
    expect(layout.apply).not.toHaveBeenCalled();
    expect(readViewGroupLocalState().widthsByGroup.reading).toEqual({ title: 200 });
  });

  it("keeps the previous active view when switching layouts fails", async () => {
    const { window } = fixture();
    const controller = new ViewGroupController();
    writeViewGroups([group("reading", "Reading"), group("writing", "Writing")]);
    writeViewGroupLocalState({ activeID: "reading", widthsByGroup: { writing: { title: 320 } } });
    layout.apply.mockRejectedValueOnce(new Error("reset failed"));

    await (controller as any).run(window, () => (controller as any).select(window, "writing"));

    expect(readViewGroupLocalState().activeID).toBe("reading");
    expect(alerts).toHaveBeenCalledWith(window, "Focus Columns", expect.stringContaining("could not be completed"));
    expect(logError).toHaveBeenCalledOnce();
  });

  it("mounts an accessible icon-only button before CSS loads, including after reload", () => {
    const { window, toolbar } = fixture();
    const controller = new ViewGroupController();
    // This fixture loads no stylesheet. Inspect each button before DOM insertion.
    const insert = toolbar.insertBefore.bind(toolbar);
    const mounted = vi.spyOn(toolbar, "insertBefore").mockImplementation((button, before) => {
      expect(button.getAttribute("label")).toBeNull();
      expect(button.getAttribute("aria-label")).toBe("View groups");
      expect(button.getAttribute("tooltiptext")).toContain("Switch column layouts.");
      expect(button.getAttribute("image")).toBe("chrome://focus-columns/content/icons/view-layout.svg");
      expect(button.getAttribute("type")).toBe("menu");
      return insert(button, before);
    });

    controller.load(window);
    controller.load(window);
    expect(toolbar.children.filter(node => node.id === "focus-columns-view-groups")).toHaveLength(1);

    controller.unload(window);
    expect(toolbar.children.filter(node => node.id === "focus-columns-view-groups")).toHaveLength(0);

    controller.load(window);
    expect(toolbar.children.filter(node => node.id === "focus-columns-view-groups")).toHaveLength(1);
    expect(mounted).toHaveBeenCalledTimes(2);
  });

  it("reports corrupt definitions without overwriting them or the current layout", () => {
    const { window, toolbar } = fixture();
    const controller = new ViewGroupController();
    const definitionsPref = `${PREF_BRANCH}viewGroups.definitions`;
    preferences.set(definitionsPref, "{broken");

    controller.load(window);
    const button = toolbar.children.find(node => node.id === "focus-columns-view-groups")!;
    const popup = button.children[0];
    popup.emit("popupshowing");

    expect(popup.children.map(node => node.getAttribute("label"))).toEqual([
      "Could not read view groups. Check the saved data."
    ]);
    expect(preferences.get(definitionsPref)).toBe("{broken");
    expect(layout.capture).not.toHaveBeenCalled();
    expect(layout.apply).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledOnce();
  });
});

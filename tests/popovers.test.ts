import { beforeEach, describe, expect, it, vi } from "vitest";
import { openHashTagPopover, openRemarkPopover, openStatusPopover } from "../src/features/popovers";

// A small DOM double exercises events and state; Gecko layout remains a manual check.
class Element {
  children: Element[] = [];
  attributes = new Map<string, string>();
  events = new Map<string, Array<(event: any) => void>>();
  style: Record<string, string> = {};
  className = "";
  textContent = "";
  value = "";
  hidden = false;
  disabled = false;
  type = "";
  removed = false;
  isConnected = true;
  parent: Element | null = null;
  constructor(readonly name: string, readonly ownerDocument: any) {}
  append(...elements: Element[]) {
    elements.forEach(element => { element.parent = this; });
    this.children.push(...elements);
  }
  appendChild(element: Element) { this.append(element); }
  replaceChildren(...elements: Element[]) { this.children = elements; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addEventListener(name: string, handler: (event: any) => void) {
    this.events.set(name, [...this.events.get(name) || [], handler]);
  }
  removeEventListener(name: string, handler: (event: any) => void) {
    this.events.set(name, (this.events.get(name) || []).filter(value => value !== handler));
  }
  emit(name: string, values: Record<string, unknown> = {}) {
    const event = { type: name, target: this, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...values };
    for (const handler of this.events.get(name) || []) handler(event);
    return event;
  }
  querySelectorAll<T>(name: string): T[] {
    return this.children.flatMap(child => [
      ...(child.name === name || (name === "button:not(:disabled)" && child.name === "button" && !child.disabled)
        ? [child as unknown as T] : []), ...child.querySelectorAll<T>(name)
    ]);
  }
  closest(): Element | null { return this.parent; }
  contains(element: Element | null): boolean {
    return element === this || this.children.some(child => child.contains(element));
  }
  getBoundingClientRect() { return { x: 200, y: 100, width: 100, height: 20 }; }
  focus(_options?: unknown) { this.ownerDocument.activeElement = this; }
  select = vi.fn();
  remove() {
    if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    this.removed = true;
    this.isConnected = false;
  }
  hidePopup = vi.fn(() => { this.emit("popuphiding"); this.emit("popuphidden"); });
  moveTo = vi.fn();
  openPopup = vi.fn();
  openPopupAtScreenRect = vi.fn();
}

function environment() {
  const doc: any = new Element("document", null);
  doc.activeElement = null;
  doc.createElement = (name: string) => new Element(name, doc);
  doc.createXULElement = doc.createElement;
  doc.documentElement = new Element("root", doc);
  doc.body = new Element("body", doc);
  const window: any = new Element("window", doc);
  window.windowRoot = new Element("windowRoot", doc);
  window.windowUtils = { toScreenRectInCSSUnits: vi.fn((x, y, width, height) => ({ x: x - 1400, y: y + 30, width, height })) };
  doc.defaultView = window;
  const tree = new Element("tree", doc);
  const anchor = new Element("cell", doc) as unknown as HTMLElement;
  tree.append(anchor as unknown as Element);
  tree.focus();
  return { doc, window, tree, anchor, panel: () => doc.documentElement.children[0] as Element };
}

describe("popovers", () => {
  beforeEach(() => { (globalThis as any).Zotero = { locale: "en-US" }; });

  it("asks Gecko to center status and remark before display without a later move", () => {
    for (const open of [
      (anchor: HTMLElement) => openStatusPopover(anchor, [], vi.fn()),
      (anchor: HTMLElement) => openRemarkPopover(anchor, "remark", vi.fn())
    ]) {
      const ui = environment();
      open(ui.anchor);
      expect(ui.panel().openPopupAtScreenRect).toHaveBeenCalledWith(
        "bottomcenter topcenter", -1200, 132, 100, 20, false, false
      );
      ui.panel().emit("popupshown");
      expect(ui.panel().moveTo).not.toHaveBeenCalled();
      expect(ui.panel().attributes.get("consumeoutsideclicks")).toBe("false");
    }
  });

  it("loads, searches and selects one tag, preserving a literal second hash", async () => {
    const ui = environment();
    const onSelect = vi.fn();
    openHashTagPopover(ui.anchor, async () => [
      { tag: "#Alpha", color: "red" }, { tag: "##Other", color: "blue" }
    ], "#Alpha", onSelect);
    await vi.waitFor(() => expect(ui.panel().querySelectorAll<Element>("button")).toHaveLength(3));
    const panel = ui.panel();
    expect(panel.openPopupAtScreenRect).toHaveBeenCalledWith("bottomcenter topcenter", -1200, 132, 100, 20, false, false);
    const search = panel.querySelectorAll<Element>("input")[0];
    panel.emit("popupshown");
    expect(ui.doc.activeElement).toBe(ui.tree);
    search.focus();
    expect(ui.doc.activeElement).toBe(search);
    let buttons = panel.querySelectorAll<Element>("button");
    expect(buttons[0].attributes.get("aria-checked")).toBe("true");
    expect(buttons[1].children[1].textContent).toBe("#Other");
    search.value = "other";
    search.emit("input");
    buttons = panel.querySelectorAll<Element>("button");
    expect(buttons).toHaveLength(2);
    buttons[0].emit("click");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("##Other");
    expect(panel.hidePopup).toHaveBeenCalledOnce();
    expect(panel.removed).toBe(true);
    expect(ui.doc.activeElement).toBe(ui.tree);
  });

  it("shows mixed values without a checked option and keeps clear available with no matches", async () => {
    const ui = environment();
    const onSelect = vi.fn();
    openHashTagPopover(ui.anchor, async () => [{ tag: "#Alpha", color: "red" }], "mixed", onSelect);
    await vi.waitFor(() => expect(ui.panel().querySelectorAll<Element>("button")).toHaveLength(2));
    const form = ui.panel().children[0];
    expect(form.children[1].hidden).toBe(false);
    expect(ui.panel().querySelectorAll<Element>("button")[0].attributes.get("aria-checked")).toBe("false");
    const search = form.children[0];
    search.value = "missing";
    search.emit("input");
    expect(form.children[3].textContent).toBe("No matching # tags.");
    ui.panel().querySelectorAll<Element>("button")[0].emit("click");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("handles an empty library, arrow navigation and Escape without writing", async () => {
    const ui = environment();
    const onSelect = vi.fn();
    openHashTagPopover(ui.anchor, async () => [], null, onSelect);
    const form = ui.panel().children[0];
    const clear = form.children[5];
    await vi.waitFor(() => expect(clear.disabled).toBe(false));
    expect(form.children[3].textContent).toContain("library has no # tags");
    form.emit("keydown", { key: "ArrowDown" });
    expect(ui.doc.activeElement).toBe(clear);
    form.emit("keydown", { key: "Escape" });
    expect(ui.panel().removed).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("reports load failure and does not update a dismissed popup", async () => {
    const ui = environment();
    openHashTagPopover(ui.anchor, async () => { throw new Error("query failed"); }, null, vi.fn());
    await vi.waitFor(() => expect(ui.panel().children[0].children[3].textContent).toContain("Could not load"));
    expect(ui.panel().querySelectorAll<Element>("button")[0].disabled).toBe(true);

    const dismissed = environment();
    let resolve!: (choices: Array<{ tag: string; color: string }>) => void;
    openHashTagPopover(dismissed.anchor, () => new Promise(done => { resolve = done; }), null, vi.fn());
    dismissed.panel().hidePopup();
    resolve([{ tag: "#late", color: "red" }]);
    await Promise.resolve();
    expect(dismissed.panel().querySelectorAll<Element>("button")).toHaveLength(1);
    expect(dismissed.panel().querySelectorAll<Element>("button")[0].disabled).toBe(true);
  });

  it("retains the popup across anchor replacement and restores focus after Escape", async () => {
    const ui = environment();
    openHashTagPopover(ui.anchor, async () => [], null, vi.fn());
    const search = ui.panel().querySelectorAll<Element>("input")[0];
    (ui.anchor as unknown as Element).remove();
    expect(ui.panel().openPopup).not.toHaveBeenCalled();
    expect(ui.panel().hidePopup).not.toHaveBeenCalled();
    search.focus();
    const event = ui.doc.emit("keydown", { target: search, key: "Escape" });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(ui.doc.activeElement).toBe(ui.tree);
    expect(ui.doc.events.get("keydown")).toHaveLength(0);
    expect(ui.window.events.get("scroll")).toHaveLength(0);
  });

  it("does not steal focus from an outside click or a different window", () => {
    const ui = environment();
    openRemarkPopover(ui.anchor, "", vi.fn());
    ui.panel().querySelectorAll<Element>("input")[0].focus();
    const external = new Element("input", ui.doc);
    ui.doc.emit("pointerdown", { target: external });
    ui.panel().hidePopup();
    expect(ui.doc.activeElement).toBe(ui.doc.body);
    external.focus();
    expect(ui.doc.activeElement).toBe(external);

    const blurred = environment();
    openRemarkPopover(blurred.anchor, "", vi.fn());
    blurred.panel().querySelectorAll<Element>("input")[0].focus();
    blurred.window.emit("blur");
    expect(blurred.panel().hidePopup).toHaveBeenCalledOnce();
    expect(blurred.doc.activeElement).toBe(blurred.doc.body);
  });

  it("allows option scrolling but closes on table scroll, resize or window movement", () => {
    const ui = environment();
    openStatusPopover(ui.anchor, [], vi.fn());
    ui.window.emit("scroll", { target: ui.panel().children[0] });
    expect(ui.panel().hidePopup).not.toHaveBeenCalled();
    ui.window.emit("scroll", { target: ui.tree });
    expect(ui.panel().hidePopup).toHaveBeenCalledOnce();
    const resized = environment();
    openStatusPopover(resized.anchor, [], vi.fn());
    resized.window.emit("resize");
    expect(resized.panel().hidePopup).toHaveBeenCalledOnce();
    const moved = environment();
    openStatusPopover(moved.anchor, [], vi.fn());
    moved.window.windowRoot.emit("MozUpdateWindowPos");
    expect(moved.panel().hidePopup).toHaveBeenCalledOnce();
    expect(moved.window.windowRoot.events.get("MozUpdateWindowPos")).toHaveLength(0);
  });

  it("routes initial arrow navigation to the menu instead of changing the selected row", async () => {
    const ui = environment();
    openHashTagPopover(ui.anchor, async () => [{ tag: "#A", color: "red" }], null, vi.fn());
    await vi.waitFor(() => expect(ui.panel().querySelectorAll<Element>("button")).toHaveLength(2));
    const event = ui.doc.emit("keydown", { target: ui.tree, key: "ArrowDown" });
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(ui.doc.activeElement).toBe(ui.panel().querySelectorAll<Element>("button")[0]);
  });
});

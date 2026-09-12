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
  constructor(readonly name: string, readonly ownerDocument: any) {}
  append(...elements: Element[]) { this.children.push(...elements); }
  appendChild(element: Element) { this.append(element); }
  replaceChildren(...elements: Element[]) { this.children = elements; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addEventListener(name: string, handler: (event: any) => void) {
    this.events.set(name, [...this.events.get(name) || [], handler]);
  }
  emit(name: string, values: Record<string, unknown> = {}) {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), ...values };
    for (const handler of this.events.get(name) || []) handler(event);
  }
  querySelectorAll<T>(name: string): T[] {
    return this.children.flatMap(child => [
      ...(child.name === name ? [child as unknown as T] : []), ...child.querySelectorAll<T>(name)
    ]);
  }
  focus() { this.ownerDocument.activeElement = this; }
  select = vi.fn();
  remove() { this.removed = true; }
  hidePopup = vi.fn(() => this.emit("popuphidden"));
  moveTo = vi.fn();
  openPopup = vi.fn();
}

function environment() {
  const doc: any = { activeElement: null };
  doc.createElement = (name: string) => new Element(name, doc);
  doc.createXULElement = doc.createElement;
  doc.documentElement = new Element("root", doc);
  const anchor = new Element("cell", doc) as unknown as HTMLElement;
  return { doc, anchor, panel: () => doc.documentElement.children[0] as Element };
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
      expect(ui.panel().openPopup).toHaveBeenCalledWith(
        ui.anchor, "bottomcenter topcenter", 0, 2, false, false
      );
      ui.panel().emit("popupshown");
      expect(ui.panel().moveTo).not.toHaveBeenCalled();
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
    expect(panel.openPopup).toHaveBeenCalledWith(ui.anchor, "bottomcenter topcenter", 0, 2, false, false);
    const search = panel.querySelectorAll<Element>("input")[0];
    panel.emit("popupshown");
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
});

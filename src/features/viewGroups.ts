import { mergeViewGroupColumns, type ViewGroup } from "../domain/viewGroups";
import { tr } from "../i18n";
import {
  readViewGroups, writeViewGroups, readViewGroupLocalState, writeViewGroupLocalState
} from "../services/viewGroupStore";
import { applyViewLayout, captureViewLayout, canUseViewLayout } from "./viewGroupLayout";

const BUTTON_ID = "focus-columns-view-groups";

export class ViewGroupController {
  private readonly windows = new Map<any, { button: any; popup: any }>();
  private busy = false;

  load(window: any): void {
    if (this.windows.has(window)) return;
    const doc = window.document;
    const toolbar = doc.getElementById("zotero-items-toolbar");
    if (!toolbar) return;
    const button = doc.createXULElement("toolbarbutton");
    button.id = BUTTON_ID;
    button.setAttribute("type", "menu");
    button.setAttribute("wantdropmarker", "true");
    button.setAttribute("image", "chrome://focus-columns/content/icons/view-layout.svg");
    const popup = doc.createXULElement("menupopup");
    popup.addEventListener("popupshowing", (event: any) => {
      if (event.target === popup) this.fillMenu(window, popup);
    });
    button.appendChild(popup);
    this.windows.set(window, { button, popup });
    this.refresh();
    toolbar.insertBefore(button, toolbar.querySelector("spacer") || null);
  }

  unload(window: any): void {
    this.windows.get(window)?.button.remove();
    this.windows.delete(window);
  }

  shutdown(): void {
    for (const window of this.windows.keys()) this.unload(window);
  }

  refresh(): void {
    let label = tr("viewGroups");
    try {
      const active = readViewGroupLocalState().activeID;
      const group = readViewGroups().find(candidate => candidate.id === active);
      if (group) label = tr("viewGroupCurrent", { name: group.name });
    } catch {
      // Leave malformed saved data intact. Opening the menu explains the error.
    }
    for (const { button } of this.windows.values()) {
      // Do not create visible text and then hide it with asynchronously loaded CSS.
      button.setAttribute("aria-label", label);
      button.setAttribute("tooltiptext", `${label}\n${tr("viewGroupsHint")}`);
      button.setAttribute("disabled", String(this.busy));
    }
  }

  private fillMenu(window: any, popup: any): void {
    popup.replaceChildren();
    const item = (label: string, action?: () => Promise<void> | void, enabled = true) => {
      const node = window.document.createXULElement("menuitem");
      node.setAttribute("label", label);
      node.setAttribute("disabled", String(!action || !enabled || this.busy));
      if (action) node.addEventListener("command", () => void this.run(window, action));
      popup.appendChild(node);
      return node;
    };
    const separator = () => popup.appendChild(window.document.createXULElement("menuseparator"));
    try {
      const groups = readViewGroups();
      const local = readViewGroupLocalState();
      const activeIndex = groups.findIndex(group => group.id === local.activeID);
      const active = groups[activeIndex];
      const usable = canUseViewLayout(window);
      if (!usable) item(tr("viewGroupsUnavailable"));
      for (const group of groups) {
        const node = item(group.name, () => this.select(window, group.id), usable);
        node.setAttribute("type", "radio");
        node.setAttribute("name", "focus-columns-view-group");
        node.setAttribute("autocheck", "false");
        node.setAttribute("checked", String(group.id === local.activeID));
      }
      if (groups.length || !usable) separator();
      item(tr("viewGroupSaveAs"), () => this.save(window), usable);
      item(tr("viewGroupUpdate"), () => this.save(window, active?.id), usable && Boolean(active));
      separator();
      item(tr("viewGroupRename"), () => this.rename(window, active?.id), Boolean(active));
      item(tr("viewGroupDelete"), () => this.remove(window, active?.id), Boolean(active));
      item(tr("viewGroupMoveUp"), () => this.move(active?.id, -1), activeIndex > 0);
      item(tr("viewGroupMoveDown"), () => this.move(active?.id, 1), activeIndex >= 0 && activeIndex < groups.length - 1);
    } catch (error) {
      Zotero.logError(error);
      popup.replaceChildren();
      item(tr("viewGroupsInvalid"));
    }
  }

  private async run(window: any, action: () => Promise<void> | void): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.refresh();
    try {
      await action();
    } catch (error) {
      Zotero.logError(error);
      Services.prompt.alert(window, tr("pluginName"), tr("viewGroupFailed"));
    } finally {
      this.busy = false;
      this.refresh();
    }
  }

  private askName(window: any, groups: ViewGroup[], current?: ViewGroup): string | null {
    const input = { value: current?.name || "" };
    while (Services.prompt.prompt(window, tr("pluginName"), tr("viewGroupName"), input, null, { value: false })) {
      const name = input.value.trim();
      if (name && name.length <= 80 && !groups.some(group => group.id !== current?.id && group.name.trim() === name)) return name;
      Services.prompt.alert(window, tr("pluginName"), tr("viewGroupInvalidName"));
    }
    return null;
  }

  private async select(window: any, id: string): Promise<void> {
    const group = readViewGroups().find(candidate => candidate.id === id);
    if (!group) return;
    const local = readViewGroupLocalState();
    await applyViewLayout(window, group.columns, local.widthsByGroup[id] || {});
    // Re-read after the asynchronous redraw so other preference changes survive.
    writeViewGroupLocalState({ ...readViewGroupLocalState(), activeID: id });
  }

  private save(window: any, id?: string): void {
    let groups = readViewGroups();
    let existing = groups.find(group => group.id === id);
    if (id && !existing) return;
    if (!existing && groups.length >= 50) {
      Services.prompt.alert(window, tr("pluginName"), tr("viewGroupLimit"));
      return;
    }
    const name = existing?.name ?? this.askName(window, groups);
    if (!name) return;
    // Native prompts run a nested event loop; synchronization may have changed
    // definitions while the name dialog was open.
    groups = readViewGroups();
    const local = readViewGroupLocalState();
    existing = groups.find(group => group.id === id);
    if (id && !existing) return;
    if (!existing && (groups.length >= 50 || groups.some(group => group.name.trim() === name))) {
      Services.prompt.alert(window, tr("pluginName"), tr(groups.length >= 50 ? "viewGroupLimit" : "viewGroupInvalidName"));
      return;
    }
    const snapshot = captureViewLayout(window);
    let groupID = existing?.id;
    if (!groupID) {
      do { groupID = `view-${Zotero.Utilities.randomString(16)}`; }
      while (groups.some(group => group.id === groupID));
    }
    const group: ViewGroup = {
      id: groupID,
      name,
      columns: existing ? mergeViewGroupColumns(snapshot.columns, existing.columns) : snapshot.columns
    };
    const nextGroups = existing ? groups.map(candidate => candidate.id === groupID ? group : candidate) : [...groups, group];
    const widthsByGroup = Object.fromEntries(nextGroups.map(candidate => [candidate.id, {
      ...local.widthsByGroup[candidate.id],
      ...(candidate.id === groupID ? snapshot.widths : {})
    }]));
    writeViewGroups(nextGroups);
    writeViewGroupLocalState({ activeID: groupID, widthsByGroup });
  }

  private rename(window: any, id?: string): void {
    const groups = readViewGroups();
    const existing = groups.find(group => group.id === id);
    if (!existing) return;
    const name = this.askName(window, groups, existing);
    if (!name) return;
    const fresh = readViewGroups();
    if (fresh.some(group => group.id !== id && group.name.trim() === name)) {
      Services.prompt.alert(window, tr("pluginName"), tr("viewGroupInvalidName"));
      return;
    }
    if (fresh.some(group => group.id === id && group.name !== name)) {
      writeViewGroups(fresh.map(group => group.id === id ? { ...group, name } : group));
    }
  }

  private remove(window: any, id?: string): void {
    const groups = readViewGroups();
    const existing = groups.find(group => group.id === id);
    if (!existing || !Services.prompt.confirm(window, tr("pluginName"), tr("viewGroupConfirmDelete", { name: existing.name }))) return;
    const fresh = readViewGroups();
    const local = readViewGroupLocalState();
    if (!fresh.some(group => group.id === id)) return;
    const widthsByGroup = { ...local.widthsByGroup };
    delete widthsByGroup[existing.id];
    writeViewGroups(fresh.filter(group => group.id !== id));
    writeViewGroupLocalState({ activeID: local.activeID === id ? null : local.activeID, widthsByGroup });
  }

  private move(id: string | undefined, direction: number): void {
    const groups = readViewGroups();
    const index = groups.findIndex(group => group.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= groups.length) return;
    [groups[index], groups[target]] = [groups[target], groups[index]];
    writeViewGroups(groups);
  }
}

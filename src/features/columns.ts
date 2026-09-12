import { PLUGIN_ID } from "../constants";
import {
  currentStatus,
  hashTagBadges,
  hashTagsAfterSelection,
  statusCandidates,
  statusTagsAfterSelection
} from "../domain/tags";
import { publicationBadges, publicationSortKey } from "../domain/publication";
import { readRemark, writeRemark } from "../domain/remark";
import { tr } from "../i18n";
import type { SettingsSnapshot } from "../settings";
import type { NativeTag, TagColor } from "../types";
import { PublicationService, publicationTitle } from "../services/publicationService";
import { openHashTagPopover, openRemarkPopover, openStatusPopover } from "./popovers";
import {
  renderBadges,
  renderStatus,
  renderText
} from "./render";

type FeatureName = "publicationColumn" | "hashTagsColumn" | "statusColumn" | "remarkColumn";

function regularItem(item: any): boolean {
  return Boolean(item?.isRegularItem?.());
}

function itemAtRow(index: number, doc: Document): any | null {
  const window = doc.defaultView as any;
  return window?.ZoteroPane?.itemsView?.getRow?.(index)?.ref || null;
}

function colorMap(libraryID: number): Map<string, TagColor> {
  return Zotero.Tags.getColors(libraryID) as Map<string, TagColor>;
}

function selectedItemsFor(clickedItem: any, doc: Document): any[] {
  const window = doc.defaultView as any;
  const selected = window?.ZoteroPane?.getSelectedItems?.() || [];
  if (selected.some((item: any) => item.id === clickedItem.id)) {
    return selected.filter((item: any) => regularItem(item) && item.libraryID === clickedItem.libraryID);
  }
  return [clickedItem];
}

function sameTags(left: NativeTag[], right: NativeTag[]): boolean {
  if (left.length !== right.length) return false;
  const normalize = (values: NativeTag[]) => values
    .map(({ tag, type = 0 }) => `${tag}\u001f${type}`)
    .sort();
  return normalize(left).every((value, index) => value === normalize(right)[index]);
}

export class ColumnController {
  private readonly registered = new Map<FeatureName, string>();

  constructor(
    private readonly getSettings: () => SettingsSnapshot,
    private readonly publications: PublicationService,
    private readonly onDataChanged: () => void
  ) {}

  sync(): void {
    const settings = this.getSettings();
    const desired: Record<FeatureName, boolean> = {
      publicationColumn: settings.publicationColumn,
      hashTagsColumn: settings.hashTagsColumn,
      statusColumn: settings.statusColumn,
      remarkColumn: settings.remarkColumn
    };
    for (const [feature, enabled] of Object.entries(desired) as Array<[FeatureName, boolean]>) {
      if (enabled && !this.registered.has(feature)) this.register(feature);
      if (!enabled && this.registered.has(feature)) this.unregister(feature);
    }
  }

  shutdown(): void {
    for (const feature of [...this.registered.keys()]) this.unregister(feature);
  }

  refresh(): void {
    Zotero.ItemTreeManager.refreshColumns();
  }

  async saveRemark(item: any, value: string): Promise<void> {
    if (!regularItem(item)) return;
    const currentExtra = String(item.getField("extra") || "");
    const nextExtra = writeRemark(currentExtra, value);
    if (nextExtra === currentExtra) return;
    item.setField("extra", nextExtra);
    await item.saveTx({
      undoAction: "focus-columns-undo-edit-remark",
      undoActionArgs: { count: 1 }
    });
    this.onDataChanged();
  }

  private register(feature: FeatureName): void {
    const common = {
      enabledTreeIDs: ["main"],
      pluginID: PLUGIN_ID,
      zoteroPersist: ["width", "hidden", "sortDirection"]
    };
    let id: string | false = false;
    if (feature === "publicationColumn") {
      id = Zotero.ItemTreeManager.registerColumn({
        ...common,
        dataKey: "publication-tags",
        label: tr("publicationColumn"),
        width: "240",
        noPadding: true,
        dataProvider: (item: any) => {
          if (!regularItem(item)) return "";
          const publication = publicationTitle(item);
          if (!publication) return "";
          const entry = this.publications.get(publication);
          return entry ? publicationSortKey(entry.rank, this.getSettings().sort) : "";
        },
        renderCell: (index: number, _data: string, column: any, _first: boolean, doc: Document) => {
          const item = itemAtRow(index, doc);
          if (!regularItem(item)) return renderBadges(doc, column, []);
          const publication = publicationTitle(item);
          if (!publication) return renderBadges(doc, column, []);
          const entry = this.publications.get(publication);
          if (!entry) this.publications.queueMissing(publication);
          const settings = this.getSettings();
          const badges = entry ? publicationBadges(
            entry.rank,
            settings.fields,
            settings.mapRules,
            settings.rankColors,
            settings.publicationDefaultColor
          ) : [];
          return renderBadges(doc, column, badges);
        }
      });
    }
    else if (feature === "hashTagsColumn") {
      id = Zotero.ItemTreeManager.registerColumn({
        ...common,
        dataKey: "hash-tags",
        label: tr("hashTagsColumn"),
        width: "150",
        noPadding: true,
        dataProvider: (item: any) => {
          if (!regularItem(item)) return "";
          const badges = hashTagBadges(
            item.getTags(),
            colorMap(item.libraryID),
            this.getSettings().hashTagsDefaultColor
          );
          return badges.map(({ text }) => text).join("\u001e");
        },
        renderCell: (index: number, _data: string, column: any, _first: boolean, doc: Document) => {
          const item = itemAtRow(index, doc);
          const badges = regularItem(item) ? hashTagBadges(
            item.getTags(),
            colorMap(item.libraryID),
            this.getSettings().hashTagsDefaultColor
          ) : [];
          const cell = renderBadges(doc, column, badges);
          cell.classList.add("focus-columns-cell-centered");
          if (regularItem(item)) {
            // Zotero guards clickable cells before its row mousedown/mouseup handlers.
            cell.classList.add("focus-columns-interactive", "clickable");
            cell.addEventListener("click", event => {
              event.stopPropagation();
              this.showHashTags(cell, item.id);
            });
          }
          return cell;
        }
      });
    }
    else if (feature === "statusColumn") {
      id = Zotero.ItemTreeManager.registerColumn({
        ...common,
        dataKey: "reading-status",
        label: tr("statusColumn"),
        width: "92",
        noPadding: true,
        dataProvider: (item: any) => {
          if (!regularItem(item)) return "";
          const status = currentStatus(item.getTags(), colorMap(item.libraryID));
          return status?.tag || "";
        },
        renderCell: (index: number, _data: string, column: any, _first: boolean, doc: Document) => {
          const item = itemAtRow(index, doc);
          const status = regularItem(item)
            ? currentStatus(item.getTags(), colorMap(item.libraryID))
            : null;
          const cell = renderStatus(doc, column, status);
          cell.classList.add("focus-columns-cell-centered");
          if (regularItem(item)) {
            cell.classList.add("focus-columns-interactive", "clickable");
            cell.addEventListener("click", event => {
              event.stopPropagation();
              this.showStatus(cell, item.id);
            });
          }
          return cell;
        }
      });
    }
    else if (feature === "remarkColumn") {
      id = Zotero.ItemTreeManager.registerColumn({
        ...common,
        dataKey: "remark",
        label: tr("remarkColumn"),
        width: "250",
        dataProvider: (item: any) => {
          if (!regularItem(item)) return "";
          return readRemark(String(item.getField("extra") || ""));
        },
        renderCell: (index: number, data: string, column: any, _first: boolean, doc: Document) => {
          const item = itemAtRow(index, doc);
          const cell = renderText(doc, column, data);
          if (regularItem(item)) {
            cell.classList.add("focus-columns-interactive", "clickable");
            cell.addEventListener("click", event => {
              event.stopPropagation();
              openRemarkPopover(cell, data, value => this.saveRemark(item, value));
            });
          }
          return cell;
        }
      });
    }
    if (id) this.registered.set(feature, id);
  }

  private unregister(feature: FeatureName): void {
    const id = this.registered.get(feature);
    if (id) Zotero.ItemTreeManager.unregisterColumn(id);
    this.registered.delete(feature);
  }

  private showHashTags(anchor: HTMLElement, itemID: number): void {
    const item = Zotero.Items.get(itemID);
    if (!regularItem(item)) return;
    // Capture the target items before the asynchronous candidate query.
    const items = selectedItemsFor(item, anchor.ownerDocument);
    const states = items.map(target => target.getTags()
      .filter(({ tag }: NativeTag) => tag.startsWith("#"))
      .map(({ tag }: NativeTag) => tag) as string[]);
    const first = states[0] || [];
    const selected = first.length <= 1 && states.every(tags =>
      tags.length === first.length && tags[0] === first[0])
      ? first[0] ?? null : "mixed";
    openHashTagPopover(anchor, async () => {
      const tags = await Zotero.Tags.getAll(item.libraryID) as NativeTag[];
      const unique = [...new Set(tags.map(({ tag }) => tag))].map(tag => ({ tag }));
      return hashTagBadges(unique, colorMap(item.libraryID), this.getSettings().hashTagsDefaultColor)
        .map(badge => ({ tag: badge.key, color: badge.background }));
    }, selected, value => this.applyHashTags(items, anchor.ownerDocument, value));
  }

  private async applyHashTags(items: any[], doc: Document, selected: string | null): Promise<void> {
    try {
      if (items.some(item => !item.isEditable())) throw new Error("Items are not editable");
      await Zotero.DB.executeTransaction(async () => {
        const changes = items.map(item => {
          const before = item.getTags() as NativeTag[];
          const after = hashTagsAfterSelection(before, selected);
          return { item, before, after };
        }).filter(({ before, after }) => !sameTags(before, after));
        if (!changes.length) return;
        Zotero.UndoHistory.stageAction("focus-columns-undo-change-hash-tags", { count: changes.length });
        for (const { item, after } of changes) {
          item.setTags(after);
          await item.save({ skipSelect: true });
        }
      });
      this.onDataChanged();
    }
    catch {
      Services.prompt.alert(doc.defaultView, tr("pluginName"), tr("saveHashTagsFailed"));
    }
  }

  private showStatus(anchor: HTMLElement, itemID: number): void {
    const item = Zotero.Items.get(itemID);
    if (!item) return;
    const colors = colorMap(item.libraryID);
    const current = currentStatus(item.getTags(), colors)?.tag || null;
    const choices = statusCandidates(colors).map(({ tag, color }) => ({
      tag,
      color,
      selected: tag === current
    }));
    const items = selectedItemsFor(item, anchor.ownerDocument);
    openStatusPopover(anchor, choices, value => this.applyStatus(items, colors, value));
  }

  private async applyStatus(items: any[], colors: Map<string, TagColor>, selected: string | null): Promise<void> {
    await Zotero.DB.executeTransaction(async () => {
      Zotero.UndoHistory.stageAction("focus-columns-undo-change-status", { count: items.length });
      for (const item of items) {
        const before = item.getTags() as NativeTag[];
        const after = statusTagsAfterSelection(before, colors, selected);
        if (sameTags(before, after)) continue;
        item.setTags(after);
        await item.save({ skipSelect: true });
      }
    });
    this.onDataChanged();
  }
}

import { PLUGIN_ID } from "../constants";
import { publicationBadges } from "../domain/publication";
import { readRemark } from "../domain/remark";
import type { SettingsSnapshot } from "../settings";
import { PublicationService, publicationTitle } from "../services/publicationService";
import type { ColumnController } from "./columns";

type RowFeature = "publicationInfoRow" | "remarkInfoRow";

export class InfoRowController {
  private readonly registered = new Map<RowFeature, string>();

  constructor(
    private readonly getSettings: () => SettingsSnapshot,
    private readonly publications: PublicationService,
    private readonly columns: ColumnController
  ) {}

  sync(): void {
    const settings = this.getSettings();
    const desired: Record<RowFeature, boolean> = {
      publicationInfoRow: settings.publicationInfoRow,
      remarkInfoRow: settings.remarkInfoRow
    };
    for (const [feature, enabled] of Object.entries(desired) as Array<[RowFeature, boolean]>) {
      if (enabled && !this.registered.has(feature)) this.register(feature);
      if (!enabled && this.registered.has(feature)) this.unregister(feature);
    }
  }

  shutdown(): void {
    for (const feature of [...this.registered.keys()]) this.unregister(feature);
  }

  refresh(): void {
    for (const id of this.registered.values()) Zotero.ItemPaneManager.refreshInfoRow(id);
  }

  private register(feature: RowFeature): void {
    let id: string | false = false;
    if (feature === "publicationInfoRow") {
      id = Zotero.ItemPaneManager.registerInfoRow({
        rowID: "publication-tags",
        pluginID: PLUGIN_ID,
        label: { l10nID: "focus-columns-publication-info-label" },
        position: "afterCreators",
        multiline: true,
        nowrap: false,
        editable: false,
        onGetData: ({ item }: any) => {
          const publication = publicationTitle(item);
          if (!publication) return "";
          const entry = this.publications.get(publication);
          if (!entry) this.publications.queueMissing(publication);
          if (!entry) return "";
          const settings = this.getSettings();
          return publicationBadges(
            entry.rank,
            settings.fields,
            settings.mapRules,
            settings.rankColors,
            settings.publicationDefaultColor
          ).map(({ text }) => text).join("  ");
        },
        onItemChange: ({ item, setEnabled }: any) => setEnabled(Boolean(item?.isRegularItem?.()))
      });
    }
    else {
      id = Zotero.ItemPaneManager.registerInfoRow({
        rowID: "remark",
        pluginID: PLUGIN_ID,
        label: { l10nID: "focus-columns-remark-info-label" },
        position: "start",
        multiline: true,
        nowrap: false,
        editable: true,
        onGetData: ({ item }: any) => readRemark(String(item.getField("extra") || "")),
        onSetData: ({ item, value }: any) => {
          void this.columns.saveRemark(item, String(value)).catch((error: unknown) => Zotero.logError(error));
        },
        onItemChange: ({ item, editable, setEnabled, setEditable }: any) => {
          const regular = Boolean(item?.isRegularItem?.());
          setEnabled(regular);
          setEditable(regular && editable);
        }
      });
    }
    if (id) this.registered.set(feature, id);
  }

  private unregister(feature: RowFeature): void {
    const id = this.registered.get(feature);
    if (id) Zotero.ItemPaneManager.unregisterInfoRow(id);
    this.registered.delete(feature);
  }
}

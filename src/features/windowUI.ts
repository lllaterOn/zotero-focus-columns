import { PLUGIN_ID } from "../constants";
import { tr } from "../i18n";
import type { EasyScholarError } from "../services/easyScholar";
import type { PublicationService } from "../services/publicationService";

const STYLE_ID = "focus-columns-stylesheet";
const MENU_ID = "focus-columns-update-publication";
const MENU_ICON = "chrome://focus-columns/content/icons/focus-columns.svg";

export function easyScholarErrorText(error: EasyScholarError): string {
  const values = { code: error.code || "" };
  switch (error.kind) {
    case "missing-key": return tr("missingKey");
    case "invalid-endpoint": return tr("invalidEndpoint");
    case "invalid-key": return tr("invalidKey", values);
    case "rate-limited": return tr("rateLimited");
    case "http-client": return tr("httpClient", values);
    case "http-server": return tr("httpServer", values);
    case "timeout": return tr("requestTimeout");
    case "network": return tr("networkFailure");
    case "invalid-response": return tr("invalidResponse");
    case "business": return tr("businessError", values);
    case "cache": return tr("cacheFailure");
  }
}

export function createPublicationMenuDefinition(
  runUpdate: (window: any) => void
): any {
  return {
    menuType: "menuitem",
    l10nID: "focus-columns-update-publication",
    icon: MENU_ICON,
    darkIcon: MENU_ICON,
    onShowing: (_event: any, context: any) => {
      const items = Array.isArray(context?.items) ? context.items : [];
      context?.setEnabled?.(items.some((item: any) => item?.isRegularItem?.()));
    },
    onCommand: (_event: any, context: any) => {
      const window = context?.menuElem?.ownerDocument?.defaultView;
      if (window) runUpdate(window);
    }
  };
}

export function createDeletePublicationMenuDefinition(
  runDelete: (window: any) => void
): any {
  return {
    menuType: "menuitem",
    l10nID: "focus-columns-delete-publication",
    icon: MENU_ICON,
    darkIcon: MENU_ICON,
    onShowing: (_event: any, context: any) => {
      const items = Array.isArray(context?.items) ? context.items : [];
      context?.setEnabled?.(items.some((item: any) => item?.isRegularItem?.()));
    },
    onCommand: (_event: any, context: any) => {
      const window = context?.menuElem?.ownerDocument?.defaultView;
      if (window) runDelete(window);
    }
  };
}

export class WindowUI {
  private readonly windows = new Set<any>();
  private menuRegistrationID: string | false | null = null;

  constructor(private readonly publications: PublicationService) {}

  load(window: any): void {
    if (this.windows.has(window)) return;
    this.windows.add(window);
    window.MozXULElement?.insertFTLIfNeeded("focus-columns.ftl");
    this.addStylesheet(window.document);
    this.registerMenu();
  }

  unload(window: any): void {
    window.document.getElementById(STYLE_ID)?.remove();
    this.windows.delete(window);
  }

  shutdown(): void {
    for (const window of [...this.windows]) this.unload(window);
    if (this.menuRegistrationID) {
      Zotero.MenuManager?.unregisterMenu?.(this.menuRegistrationID);
    }
    this.menuRegistrationID = null;
  }

  private addStylesheet(doc: Document): void {
    if (doc.getElementById(STYLE_ID)) return;
    const link = doc.createElementNS("http://www.w3.org/1999/xhtml", "link");
    link.id = STYLE_ID;
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", "chrome://focus-columns/content/style.css");
    doc.documentElement.appendChild(link);
  }

  private registerMenu(): void {
    if (this.menuRegistrationID !== null || !Zotero.MenuManager?.registerMenu) return;
    this.menuRegistrationID = Zotero.MenuManager.registerMenu({
      menuID: MENU_ID,
      pluginID: PLUGIN_ID,
      target: "main/library/item",
      menus: [
        createPublicationMenuDefinition((window: any) => {
          void this.updateSelected(window);
        }),
        createDeletePublicationMenuDefinition((window: any) => {
          void this.deleteSelected(window);
        })
      ]
    });
  }

  private selectedRegularItems(window: any): any[] {
    return (window.ZoteroPane?.getSelectedItems?.() || [])
      .filter((item: any) => item?.isRegularItem?.());
  }

  private async updateSelected(window: any): Promise<void> {
    if (!this.publications.client.hasKey()) {
      Services.prompt.alert(window, tr("pluginName"), tr("missingKey"));
      return;
    }
    const items = this.selectedRegularItems(window);
    if (!items.some((item: any) => Boolean(
      String(item.getField("publicationTitle") || item.getField("proceedingsTitle") || "").trim()
    ))) {
      Services.prompt.alert(window, tr("pluginName"), tr("noPublication"));
      return;
    }
    const result = await this.publications.updateItems(items);
    const values = {
      success: result.success,
      empty: result.empty,
      failed: result.failed
    };
    const message = result.error
      ? tr("updateStopped", { ...values, reason: easyScholarErrorText(result.error) })
      : tr("updateFinished", values);
    Services.prompt.alert(window, tr("pluginName"), message);
  }

  private async deleteSelected(window: any): Promise<void> {
    const plan = this.publications.planClearItems(this.selectedRegularItems(window));
    if (!plan.publications.length) {
      Services.prompt.alert(window, tr("pluginName"), tr("noDeletablePublication"));
      return;
    }
    const confirmed = Services.prompt.confirm(
      window,
      tr("pluginName"),
      tr("confirmDeletePublication", { count: plan.publications.length })
    );
    if (!confirmed) return;

    const result = await this.publications.clearItems(plan);
    const message = result.error
      ? tr("deletePublicationFailed", { reason: easyScholarErrorText(result.error) })
      : tr("deletePublicationFinished", {
        deleted: result.deleted,
        skipped: result.skipped
      });
    Services.prompt.alert(window, tr("pluginName"), message);
  }
}

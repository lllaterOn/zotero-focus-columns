import { PLUGIN_ID, PREF_BRANCH } from "./constants";
import { ColumnController } from "./features/columns";
import { InfoRowController } from "./features/infoRows";
import { WindowUI } from "./features/windowUI";
import { tr } from "./i18n";
import {
  readSettings,
  validateAdvancedSettings,
  type SettingsSnapshot
} from "./settings";
import { EasyScholarClient } from "./services/easyScholar";
import { PublicationCache } from "./services/publicationCache";
import { PublicationService } from "./services/publicationService";
import { SyncService } from "./services/syncService";
import type { SyncChannelName } from "./domain/sync";
import type { SyncPreferences } from "./settings";

export class FocusColumnsPlugin {
  private rootURI = "";
  private settings!: SettingsSnapshot;
  private publications!: PublicationService;
  private columns!: ColumnController;
  private infoRows!: InfoRowController;
  private windowUI!: WindowUI;
  private sync!: SyncService;
  private preferencePaneID: string | null = null;
  private notifierID: string | null = null;
  private reconfigureTimer: number | null = null;
  private refreshTimer: number | null = null;

  private readonly prefObserver = {
    observe: (_subject: unknown, _topic: string, data: string) => {
      const name = String(data || "");
      const displaySetting = name.startsWith(`${PREF_BRANCH}feature.`)
        || name.startsWith(`${PREF_BRANCH}easyscholar.`)
        || name.startsWith(`${PREF_BRANCH}publication.`)
        || name.startsWith(`${PREF_BRANCH}hashTags.`);
      if (displaySetting) {
        if (this.reconfigureTimer !== null) clearTimeout(this.reconfigureTimer);
        this.reconfigureTimer = setTimeout(() => {
          this.reconfigureTimer = null;
          this.reconfigure();
        }, 75) as unknown as number;
      }
      const syncableSetting = name.startsWith(`${PREF_BRANCH}feature.`)
        || name === `${PREF_BRANCH}easyscholar.autoFetchMissing`
        || name === `${PREF_BRANCH}easyscholar.endpoint`
        || name.startsWith(`${PREF_BRANCH}publication.`)
        || name.startsWith(`${PREF_BRANCH}hashTags.`);
      if (syncableSetting) {
        this.sync?.localSettingsChanged();
      }
    }
  };

  private readonly notifier = {
    notify: (event: string, type: string, ids: Array<number | string>) => {
      if (type === "item" || type === "setting") this.refreshDataViews();
      this.sync?.handleNotifier(event, type, ids || []);
    }
  };

  async startup({ rootURI, version }: { rootURI: string; version: string }): Promise<void> {
    this.rootURI = rootURI;
    this.settings = readSettings();
    const cache = new PublicationCache();
    await cache.load();
    const client = new EasyScholarClient(
      () => this.settings.secretKey,
      () => this.settings.endpoint
    );
    this.publications = new PublicationService(
      cache,
      client,
      () => this.settings,
      () => this.refreshDataViews()
    );
    this.sync = new SyncService(cache, version, () => this.reconfigure());
    this.columns = new ColumnController(
      () => this.settings,
      this.publications,
      () => this.refreshDataViews()
    );
    this.infoRows = new InfoRowController(
      () => this.settings,
      this.publications,
      this.columns
    );
    this.windowUI = new WindowUI(this.publications);

    this.columns.sync();
    this.infoRows.sync();
    this.preferencePaneID = await Zotero.PreferencePanes.register({
      pluginID: PLUGIN_ID,
      id: "focus-columns-preferences",
      label: tr("pluginName"),
      image: rootURI + "content/icons/focus-columns.svg",
      src: rootURI + "content/preferences.xhtml",
      scripts: [rootURI + "content/preferences.js"],
      stylesheets: [rootURI + "content/preferences.css"]
    });
    this.notifierID = Zotero.Notifier.registerObserver(
      this.notifier,
      ["item", "setting", "sync"],
      "focus-columns"
    );
    Services.prefs.addObserver(PREF_BRANCH, this.prefObserver);
    await this.sync.start();
  }

  async onMainWindowLoad(window: any): Promise<void> {
    this.windowUI.load(window);
  }

  async onMainWindowUnload(window: any): Promise<void> {
    this.windowUI.unload(window);
  }

  reconfigure(): void {
    this.settings = readSettings();
    this.columns.sync();
    this.infoRows.sync();
  }

  validateAdvancedSettings = validateAdvancedSettings;

  getSyncStatus = () => this.sync.getStatus();

  configureSync = (preferences: SyncPreferences, window: any) => (
    this.sync.configure(preferences, window)
  );

  checkSync = (window: any) => this.sync.check(window, true);

  restoreSyncBackup = (channel: SyncChannelName, window: any) => (
    this.sync.restoreLatest(channel, window)
  );

  prepareShutdown = () => this.sync.stop();

  async shutdown(): Promise<void> {
    if (this.reconfigureTimer !== null) clearTimeout(this.reconfigureTimer);
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    Services.prefs.removeObserver(PREF_BRANCH, this.prefObserver);
    if (this.notifierID) Zotero.Notifier.unregisterObserver(this.notifierID);
    if (this.preferencePaneID) Zotero.PreferencePanes.unregister(this.preferencePaneID);
    await this.prepareShutdown();
    this.publications.stop();
    this.infoRows.shutdown();
    this.columns.shutdown();
    this.windowUI.shutdown();
    this.preferencePaneID = null;
    this.notifierID = null;
  }

  private refreshDataViews(): void {
    if (this.refreshTimer !== null) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.columns?.refresh();
      this.infoRows?.refresh();
    }, 50) as unknown as number;
  }
}

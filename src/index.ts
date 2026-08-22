import { FocusColumnsPlugin } from "./plugin";

const plugin = new FocusColumnsPlugin();

Zotero.FocusColumns = {
  startup: (data: { rootURI: string; version: string }) => plugin.startup(data),
  shutdown: () => plugin.shutdown(),
  onMainWindowLoad: (window: any) => plugin.onMainWindowLoad(window),
  onMainWindowUnload: (window: any) => plugin.onMainWindowUnload(window),
  reconfigure: () => plugin.reconfigure(),
  validateAdvancedSettings: plugin.validateAdvancedSettings,
  getSyncStatus: plugin.getSyncStatus,
  configureSync: plugin.configureSync,
  checkSync: plugin.checkSync,
  restoreSyncBackup: plugin.restoreSyncBackup,
  prepareShutdown: plugin.prepareShutdown
};

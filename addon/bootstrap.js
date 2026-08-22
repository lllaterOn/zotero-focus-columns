var chromeHandle;

Components.utils.importGlobalProperties(["AbortController"]);

function install() {}

async function startup({ rootURI, version }) {
  await Zotero.initializationPromise;

  const addonManagerStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  chromeHandle = addonManagerStartup.registerChrome(
    Services.io.newURI(rootURI + "manifest.json"),
    [
      ["content", "focus-columns", rootURI + "content/"],
      ["locale", "focus-columns", "en-US", rootURI + "locale/en-US/"],
      ["locale", "focus-columns", "zh-CN", rootURI + "locale/zh-CN/"]
    ]
  );

  Services.scriptloader.loadSubScript(rootURI + "content/focus-columns.js");
  await Zotero.FocusColumns.startup({ rootURI, version });

  for (const window of Zotero.getMainWindows()) {
    await Zotero.FocusColumns.onMainWindowLoad(window);
  }
}

async function onMainWindowLoad({ window }) {
  await Zotero.FocusColumns?.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }) {
  await Zotero.FocusColumns?.onMainWindowUnload(window);
}

async function shutdown(_data, reason) {
  if (reason === APP_SHUTDOWN) {
    await Zotero.FocusColumns?.prepareShutdown();
    return;
  }

  await Zotero.FocusColumns?.shutdown();
  delete Zotero.FocusColumns;
  chromeHandle?.destruct();
  chromeHandle = undefined;
  Services.obs.notifyObservers(null, "startupcache-invalidate");
}

function uninstall() {
  Services.obs.notifyObservers(null, "startupcache-invalidate");
}

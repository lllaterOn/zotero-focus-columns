var FocusColumnsPreferences = {
  branch: "extensions.zotero.lllateron.focusColumns.",
  initialized: false,
  strings: {
    "zh-CN": {
      featuresHeading: "功能",
      columnsHeading: "条目列表列",
      itemPaneHeading: "条目面板",
      publicationColumn: "期刊标签列",
      hashTagsColumn: "#标签列",
      statusColumn: "状态列",
      remarkColumn: "简记列",
      publicationInfoRow: "期刊标签",
      remarkInfoRow: "简记",
      secretKey: "密钥",
      autoFetch: "自动补全缓存缺失项",
      syncHeading: "跨电脑同步",
      syncEnabled: "启用 Focus Columns 同步",
      syncPublications: "同步期刊标签",
      syncSettings: "同步插件设置",
      syncNotice: "同步数据保存在个人文献库的可见笔记中，并由 Zotero 负责网络同步；期刊名称和插件设置可能出现在 Zotero 网页端及备份中，EasyScholar 密钥仅保存在本机。",
      syncCheck: "立即检查同步数据",
      restorePublications: "恢复期刊标签备份",
      restoreSettings: "恢复设置备份",
      localPublications: "本机",
      syncNotePublications: "同步笔记",
      publicationChannel: "期刊标签",
      settingsChannel: "设置",
      syncDataUpdated: "同步笔记更新",
      lastChecked: "最近检查",
      never: "尚未",
      advancedHeading: "高级设置",
      fields: "字段",
      sort: "排序",
      map: "映射",
      rankColors: "分级颜色",
      defaultColor: "默认颜色",
      hashColor: "#标签默认颜色",
      endpoint: "接口",
      apply: "应用",
      saved: "已应用",
      validationFailed: "设置未保存"
    },
    "en-US": {
      featuresHeading: "Features",
      columnsHeading: "Item list columns",
      itemPaneHeading: "Item pane",
      publicationColumn: "Publication tags column",
      hashTagsColumn: "# tags column",
      statusColumn: "Status column",
      remarkColumn: "Remark column",
      publicationInfoRow: "Publication tags",
      remarkInfoRow: "Remark",
      secretKey: "Secret key",
      autoFetch: "Fetch cache misses automatically",
      syncHeading: "Cross-computer synchronization",
      syncEnabled: "Enable Focus Columns synchronization",
      syncPublications: "Synchronize publication tags",
      syncSettings: "Synchronize plugin settings",
      syncNotice: "Synchronization data is stored in a visible note in My Library and synchronized over the network by Zotero; publication names and plugin settings may appear on the Zotero website and in backups, while the EasyScholar key remains only on this computer.",
      syncCheck: "Check synchronization data now",
      restorePublications: "Restore publication-tag backup",
      restoreSettings: "Restore settings backup",
      localPublications: "Local",
      syncNotePublications: "Synchronization note",
      publicationChannel: "Publication tags",
      settingsChannel: "Settings",
      syncDataUpdated: "Synchronization note updated",
      lastChecked: "Last checked",
      never: "Never",
      advancedHeading: "Advanced",
      fields: "Fields",
      sort: "Sort",
      map: "Map",
      rankColors: "Rank colors",
      defaultColor: "Default color",
      hashColor: "Default # tag color",
      endpoint: "Endpoint",
      apply: "Apply",
      saved: "Applied",
      validationFailed: "Settings were not saved"
    }
  },

  locale() {
    return String(Zotero.locale || "en-US").toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
  },

  text(key) {
    return this.strings[this.locale()][key] || this.strings["en-US"][key] || key;
  },

  pref(name, fallback) {
    const value = Zotero.Prefs.get(this.branch + name, true);
    return value === undefined || value === null ? fallback : value;
  },

  init() {
    const root = document.getElementById("focus-columns-preferences-root");
    if (!root || root.getAttribute("data-initialized") === "true") return;
    root.setAttribute("data-initialized", "true");
    document.querySelectorAll("[data-focus-i18n]").forEach(element => {
      element.textContent = this.text(element.dataset.focusI18n);
    });
    document.querySelectorAll("input[type='checkbox'][data-pref]").forEach(input => {
      input.checked = Boolean(this.pref(input.dataset.pref, true));
    });
    document.getElementById("focus-secret-key").value = this.pref("easyscholar.secretKey", "");
    document.getElementById("focus-fields").value = this.pref("publication.fields", "sci,ssci,sciUp,pku,sciwarn,eii,sciif");
    document.getElementById("focus-sort").value = this.pref("publication.sort", "sci,-sciif");
    document.getElementById("focus-map").value = this.pref("publication.map", "");
    const colors = String(this.pref("publication.rankColors", "#ffe2dd,#e8deee,#dbeddb,#fadec9,#e9e8e7")).split(",");
    document.querySelectorAll("#focus-rank-colors input").forEach((input, index) => {
      input.value = colors[index] || "#e9e8e7";
    });
    document.getElementById("focus-default-color").value = this.pref("publication.defaultColor", "#86dad1");
    document.getElementById("focus-hash-color").value = this.pref("hashTags.defaultColor", "#8e44ad");
    document.getElementById("focus-endpoint").value = this.pref("easyscholar.endpoint", "https://easyscholar.cc/open/getPublicationRank");
    document.getElementById("focus-sync-enabled").checked = Boolean(this.pref("sync.enabled", false));
    document.getElementById("focus-sync-publications").checked = Boolean(this.pref("sync.publications", true));
    document.getElementById("focus-sync-settings").checked = Boolean(this.pref("sync.settings", false));
    document.getElementById("focus-sync-enabled").addEventListener("change", () => this.updateSyncControls());
    document.getElementById("focus-sync-check").addEventListener("click", () => this.checkSync());
    document.getElementById("focus-sync-restore-publications").addEventListener("click", () => this.restoreBackup("publications"));
    document.getElementById("focus-sync-restore-settings").addEventListener("click", () => this.restoreBackup("settings"));
    document.getElementById("focus-apply").addEventListener("click", () => this.apply());
    this.updateSyncControls();
    this.renderSyncStatus(Zotero.FocusColumns.getSyncStatus());
  },

  async apply() {
    const rankColors = [...document.querySelectorAll("#focus-rank-colors input")]
      .map(input => input.value.toLowerCase()).join(",");
    const values = {
      fields: document.getElementById("focus-fields").value.trim(),
      sort: document.getElementById("focus-sort").value.trim(),
      map: document.getElementById("focus-map").value,
      rankColors,
      publicationDefaultColor: document.getElementById("focus-default-color").value,
      hashTagsDefaultColor: document.getElementById("focus-hash-color").value,
      endpoint: document.getElementById("focus-endpoint").value.trim()
    };
    const errors = Zotero.FocusColumns.validateAdvancedSettings(values);
    const status = document.getElementById("focus-preferences-status");
    if (errors.length) {
      status.className = "focus-status-error";
      status.textContent = `${this.text("validationFailed")}: ${errors.join("; ")}`;
      return;
    }

    document.querySelectorAll("input[type='checkbox'][data-pref]").forEach(input => {
      Zotero.Prefs.set(this.branch + input.dataset.pref, input.checked, true);
    });
    Zotero.Prefs.set(this.branch + "easyscholar.secretKey", document.getElementById("focus-secret-key").value.trim(), true);
    Zotero.Prefs.set(this.branch + "easyscholar.endpoint", values.endpoint, true);
    Zotero.Prefs.set(this.branch + "publication.fields", values.fields, true);
    Zotero.Prefs.set(this.branch + "publication.sort", values.sort, true);
    Zotero.Prefs.set(this.branch + "publication.map", values.map, true);
    Zotero.Prefs.set(this.branch + "publication.rankColors", values.rankColors, true);
    Zotero.Prefs.set(this.branch + "publication.defaultColor", values.publicationDefaultColor, true);
    Zotero.Prefs.set(this.branch + "hashTags.defaultColor", values.hashTagsDefaultColor, true);
    const syncStatus = await Zotero.FocusColumns.configureSync({
      enabled: document.getElementById("focus-sync-enabled").checked,
      publications: document.getElementById("focus-sync-publications").checked,
      settings: document.getElementById("focus-sync-settings").checked
    }, document.defaultView);
    this.renderSyncStatus(syncStatus);
    status.className = "focus-status-ok";
    status.textContent = this.text("saved");
  },

  updateSyncControls() {
    const enabled = document.getElementById("focus-sync-enabled").checked;
    document.querySelectorAll("#focus-sync-channels input").forEach(input => {
      input.disabled = !enabled;
    });
    document.getElementById("focus-sync-check").disabled = !enabled;
  },

  async checkSync() {
    const button = document.getElementById("focus-sync-check");
    button.disabled = true;
    try {
      this.renderSyncStatus(await Zotero.FocusColumns.checkSync(document.defaultView));
    }
    finally {
      button.disabled = !document.getElementById("focus-sync-enabled").checked;
    }
  },

  async restoreBackup(channel) {
    this.renderSyncStatus(await Zotero.FocusColumns.restoreSyncBackup(channel, document.defaultView));
  },

  formatSyncTime(value) {
    if (!value) return this.text("never");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return this.text("never");
    return date.toLocaleString(this.locale(), {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  },

  renderSyncStatus(syncStatus) {
    const element = document.getElementById("focus-sync-status");
    if (!element || !syncStatus) return;
    const stateLabels = this.locale() === "zh-CN" ? {
      disabled: "本机未启用",
      ready: "已连接",
      "no-channels": "当前未选择同步内容",
      "needs-setup": "待连接",
      "needs-choice": "需要选择保留哪一方",
      "missing-container": "共享条目已缺失",
      "missing-note": "Focus Columns 同步笔记已缺失",
      "duplicate-container": "发现多个共享条目",
      "duplicate-note": "发现多个 Focus Columns 同步笔记",
      conflict: "同步数据冲突",
      "invalid-data": "同步笔记内容已损坏",
      "newer-data": "需要更新 Focus Columns",
      "too-large": "同步数据超过容量限制",
      error: "同步检查失败"
    } : {
      disabled: "Disabled on this computer",
      ready: "Connected",
      "no-channels": "No synchronization channel selected",
      "needs-setup": "Connection required",
      "needs-choice": "Choose which version to keep",
      "missing-container": "Shared item is missing",
      "missing-note": "Focus Columns synchronization note is missing",
      "duplicate-container": "Multiple shared items found",
      "duplicate-note": "Multiple Focus Columns synchronization notes found",
      conflict: "Synchronization data conflict",
      "invalid-data": "Synchronization note is damaged",
      "newer-data": "Update Focus Columns",
      "too-large": "Synchronization data exceeds the size limit",
      error: "Synchronization check failed"
    };
    const remoteCount = syncStatus.syncedPublicationCount === null
      ? this.text("never")
      : syncStatus.syncedPublicationCount;
    const checked = this.formatSyncTime(syncStatus.checkedAt);
    const updated = this.formatSyncTime(syncStatus.syncDataUpdatedAt);
    const channelLabels = this.locale() === "zh-CN" ? {
      ready: "已就绪", disabled: "未启用", idle: "待检查", conflict: "需要选择", error: "已暂停"
    } : {
      ready: "Ready", disabled: "Not enabled", idle: "Not checked", conflict: "Choice required", error: "Paused"
    };
    element.dataset.state = syncStatus.state === "ready" ? "ready"
      : syncStatus.state === "disabled" || syncStatus.state === "no-channels" ? "idle" : "error";
    document.getElementById("focus-sync-state").textContent = stateLabels[syncStatus.state] || syncStatus.state;
    document.getElementById("focus-sync-publications-summary").textContent =
      `${this.text("publicationChannel")}：${channelLabels[syncStatus.publicationsState] || syncStatus.publicationsState}`
      + `（${this.text("localPublications")} ${syncStatus.publicationCount} · `
      + `${this.text("syncNotePublications")} ${remoteCount}）`;
    document.getElementById("focus-sync-settings-summary").textContent =
      `${this.text("settingsChannel")}：${channelLabels[syncStatus.settingsState] || syncStatus.settingsState}`;
    document.getElementById("focus-sync-updated").textContent = `${this.text("syncDataUpdated")}：${updated}`;
    document.getElementById("focus-sync-checked").textContent = `${this.text("lastChecked")}：${checked}`;
    const detail = document.getElementById("focus-sync-detail");
    const detailText = syncStatus.state === "ready" ? "" : String(syncStatus.detail || "");
    detail.textContent = detailText;
    detail.hidden = !detailText;
  }
};

(function waitForPane(attempt) {
  if (document.getElementById("focus-columns-preferences-root")) {
    FocusColumnsPreferences.init();
    return;
  }
  if (attempt < 20) setTimeout(() => waitForPane(attempt + 1), 25);
})(0);

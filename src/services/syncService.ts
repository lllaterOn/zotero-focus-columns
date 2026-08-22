import {
  PLUGIN_ID,
  PREF_BRANCH,
  SYNC_CONTAINER_MARKER,
  SYNC_CONTAINER_TITLE,
  SYNC_NOTE_MARKER,
  SYNC_NOTE_TITLE
} from "../constants";
import {
  contentHash,
  createSyncedChannel,
  createSyncData,
  parseSyncNote,
  reconcileChannel,
  renderSyncNote,
  SyncDataError,
  type FocusColumnsSyncData,
  type ReconcileAction,
  type SyncChannelData,
  type SyncChannelName,
  type SyncedChannel
} from "../domain/sync";
import {
  defaultSyncableSettings,
  readSyncableSettings,
  readSyncPreferences,
  writeSyncableSettings,
  writeSyncPreferences,
  type SyncPreferences,
  type SyncableSettings
} from "../settings";
import type { PublicationCacheFile } from "../types";
import { PublicationCache } from "./publicationCache";
import { SyncBackupStore } from "./syncBackup";

export type SyncState =
  | "disabled"
  | "ready"
  | "no-channels"
  | "needs-setup"
  | "needs-choice"
  | "missing-container"
  | "missing-note"
  | "duplicate-container"
  | "duplicate-note"
  | "conflict"
  | "invalid-data"
  | "newer-data"
  | "too-large"
  | "error";

export interface SyncStatus {
  state: SyncState;
  enabled: boolean;
  publicationsEnabled: boolean;
  settingsEnabled: boolean;
  publicationsState: string;
  settingsState: string;
  publicationCount: number;
  syncedPublicationCount: number | null;
  syncDataUpdatedAt: string | null;
  checkedAt: string | null;
  containerKey: string | null;
  noteKey: string | null;
  detail: string;
}

interface SyncObjects {
  container: any;
  note: any;
  data: FocusColumnsSyncData;
  containerStatus: "found" | "created";
  noteStatus: "found" | "created";
}

interface ChannelDecision<T extends SyncChannelData> {
  channel: SyncChannelName;
  action: ReconcileAction;
  local: T;
  remote?: SyncedChannel<T>;
}

const RUNTIME = `${PREF_BRANCH}sync.runtime.`;

function runtimePref(name: string, fallback = ""): string {
  const value = Zotero.Prefs.get(RUNTIME + name, true);
  return value === undefined || value === null ? fallback : String(value);
}

function setRuntimePref(name: string, value: string | boolean): void {
  Zotero.Prefs.set(RUNTIME + name, value, true);
}

function itemKey(item: any): string {
  return String(item?.key || "");
}

function exactExtraMarker(item: any): boolean {
  return String(item?.getField?.("extra") || "")
    .split(/\r?\n/)
    .some(line => line.trim() === SYNC_CONTAINER_MARKER);
}

function noteHasMarker(note: any): boolean {
  return String(note?.getNote?.() || "").includes(SYNC_NOTE_MARKER);
}

function channelLabel(channel: SyncChannelName): string {
  return channel === "publications"
    ? syncText("期刊标签数据", "publication tags")
    : syncText("插件设置", "plugin settings");
}

function syncText(chinese: string, english: string): string {
  return String(Zotero.locale || "en-US").toLowerCase().startsWith("zh") ? chinese : english;
}

function channelHead(channel: SyncChannelName): string | null {
  return runtimePref(`${channel}Head`) || null;
}

function setChannelHead(channel: SyncChannelName, hash: string): void {
  setRuntimePref(`${channel}Head`, hash);
}

function channelEnabled(preferences: SyncPreferences, channel: SyncChannelName): boolean {
  return channel === "publications" ? preferences.publications : preferences.settings;
}

function personalLibraryID(): number {
  return Number(Zotero.Libraries.userLibraryID);
}

export class SyncService {
  private readonly backupStore: SyncBackupStore;
  private pluginVersion: string;
  private status: SyncStatus;
  private operationChain: Promise<void> = Promise.resolve();
  private writeTimer: number | null = null;
  private writingNote = false;
  private applyingRemote = false;
  private unsubscribeCache: (() => void) | null = null;
  private stopped = false;

  constructor(
    private readonly cache: PublicationCache,
    pluginVersion: string,
    private readonly onSettingsImported: () => void,
    backupStore = new SyncBackupStore()
  ) {
    this.pluginVersion = pluginVersion;
    this.backupStore = backupStore;
    this.status = this.initialStatus();
  }

  async start(): Promise<void> {
    this.unsubscribeCache = this.cache.onChange(() => {
      const preferences = readSyncPreferences();
      if (!this.applyingRemote && preferences.publications) this.scheduleCheck(2_000);
    });
    if (readSyncPreferences().enabled) await this.check(null, false);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.unsubscribeCache?.();
    this.unsubscribeCache = null;
    if (this.writeTimer !== null) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
      await this.check(null, false);
    }
    await this.operationChain;
  }

  getStatus(): SyncStatus {
    const preferences = readSyncPreferences();
    return {
      ...this.status,
      enabled: preferences.enabled,
      publicationsEnabled: preferences.publications,
      settingsEnabled: preferences.settings,
      publicationCount: Object.keys(this.cache.snapshot().entries).length
    };
  }

  async configure(preferences: SyncPreferences, window: any = null): Promise<SyncStatus> {
    const previous = readSyncPreferences();
    writeSyncPreferences(preferences);
    if (!preferences.enabled) {
      this.status = this.initialStatus("disabled");
      return this.getStatus();
    }
    const newlyEnabled = !previous.enabled
      || (!previous.publications && preferences.publications)
      || (!previous.settings && preferences.settings);
    await this.check(window, newlyEnabled);
    return this.getStatus();
  }

  async check(window: any = null, interactive = true): Promise<SyncStatus> {
    await this.enqueue(async () => this.checkNow(window, interactive));
    return this.getStatus();
  }

  localSettingsChanged(): void {
    const preferences = readSyncPreferences();
    if (!this.applyingRemote && preferences.settings) this.scheduleCheck(50);
  }

  handleNotifier(event: string, type: string, ids: Array<number | string>): void {
    if (!readSyncPreferences().enabled || this.writingNote) return;
    const noteKey = runtimePref("noteKey");
    const containerKey = runtimePref("containerKey");
    const noteID = runtimePref("noteID");
    const containerID = runtimePref("containerID");
    if (type === "sync" && event === "finish") {
      this.scheduleCheck(250);
      return;
    }
    if (type !== "item") return;
    const relevant = ids.some(id => {
      const item = typeof id === "number" ? Zotero.Items.get(id) : null;
      const key = itemKey(item) || String(id);
      return key === noteKey
        || key === containerKey
        || String(id) === noteID
        || String(id) === containerID;
    });
    if (relevant || event === "add") this.scheduleCheck(250);
  }

  async restoreLatest(channel: SyncChannelName, window: any = null): Promise<SyncStatus> {
    const backup = await this.backupStore.latest(channel);
    if (!backup) {
      Services.prompt.alert(window, "Focus Columns", syncText(
        "该同步内容没有可用的本地备份。",
        "No local backup is available for this channel."
      ));
      return this.getStatus();
    }
    const confirmed = Services.prompt.confirm(
      window,
      "Focus Columns",
      syncText(
        `是否恢复 ${backup.createdAt} 的${channelLabel(channel)}本地备份？`,
        `Restore the ${channelLabel(channel)} backup from ${backup.createdAt}?`
      )
    );
    if (!confirmed) return this.getStatus();
    await this.applyLocal(channel, backup.data);
    this.status = {
      ...this.status,
      state: "needs-choice",
      detail: syncText(
        "已恢复本地备份。请检查同步数据并选择保留哪一方。",
        "Local backup restored; check synchronization data to choose a direction."
      )
    };
    return this.getStatus();
  }

  private async checkNow(window: any, interactive: boolean): Promise<void> {
    const preferences = readSyncPreferences();
    if (!preferences.enabled) {
      this.status = this.initialStatus("disabled");
      return;
    }
    if (!preferences.publications && !preferences.settings) {
      this.status = this.initialStatus("no-channels");
      return;
    }

    let objects: SyncObjects | null;
    try {
      objects = await this.findSyncObjects();
      if (!objects) {
        const everConnected = runtimePref("everConnected") === "true";
        if (everConnected) {
          this.setBlocked("missing-container", syncText(
            "共享同步条目已缺失或位于回收站。",
            "The shared synchronization item is missing or in the trash."
          ));
          return;
        }
        if (!interactive) {
          this.setBlocked("needs-setup", syncText("尚未连接同步数据。", "Synchronization has not been connected."));
          return;
        }
        objects = {
          container: null,
          note: null,
          data: createSyncData(this.pluginVersion),
          containerStatus: "created",
          noteStatus: "created"
        };
      }
    }
    catch (error) {
      const message = String(error);
      if (message.includes("uninitialized-note:")) {
        const containerID = Number(message.split("uninitialized-note:")[1]);
        const container = Zotero.Items.get(containerID);
        if (!container || !interactive) {
          this.setBlocked("needs-setup", syncText(
            "已找到共享条目，但尚未创建 Focus Columns 同步笔记。",
            "The shared item exists, but the Focus Columns synchronization note has not been created."
          ));
          return;
        }
        objects = {
          container,
          note: null,
          data: createSyncData(this.pluginVersion),
          containerStatus: "found",
          noteStatus: "created"
        };
      }
      else {
        this.handleObjectError(error);
        return;
      }
    }

    const decisions = this.decisions(objects.data, preferences);
    const unresolved = new Set<SyncChannelName>();
    if (interactive) {
      for (const decision of decisions) {
        if (decision.action === "conflict") {
          const direction = this.chooseDirection(window, decision.channel);
          if (!direction) {
            unresolved.add(decision.channel);
            continue;
          }
          decision.action = direction;
        }
      }
      const changes = decisions.filter(decision => decision.action === "pull" || decision.action === "push");
      const firstConnection = runtimePref("everConnected") !== "true";
      if (changes.length || firstConnection) {
        const publicationDecision = decisions.find(decision => decision.channel === "publications");
        const objectStatus = (status: "found" | "created") => syncText(
          status === "found" ? "已找到" : "将新建",
          status === "found" ? "found" : "newly created"
        );
        const summary = [
          syncText(
            `共享条目：${objectStatus(objects.containerStatus)}`,
            `Shared item: ${objectStatus(objects.containerStatus)}`
          ),
          syncText(
            `Focus Columns 笔记：${objectStatus(objects.noteStatus)}`,
            `Focus Columns note: ${objectStatus(objects.noteStatus)}`
          ),
          publicationDecision
            ? syncText(
              `期刊标签：本机 ${Object.keys((publicationDecision.local as PublicationCacheFile).entries).length} 种，Zotero 中 ${publicationDecision.remote ? Object.keys((publicationDecision.remote.data as PublicationCacheFile).entries).length : 0} 种`,
              `Publication tags: local ${Object.keys((publicationDecision.local as PublicationCacheFile).entries).length}, Zotero ${publicationDecision.remote ? Object.keys((publicationDecision.remote.data as PublicationCacheFile).entries).length : 0}`
            )
            : syncText("期刊标签：本机已关闭该同步内容", "Publication tags: disabled on this computer"),
          ...decisions.map(decision => (
            `${channelLabel(decision.channel)}: ${decision.action === "pull"
              ? syncText("使用 Zotero 中的数据", "use Zotero data")
              : decision.action === "push"
                ? syncText("使用本机数据", "use local data")
                : syncText("已一致", "already the same")}`
          ))
        ].join("\n");
        if (!Services.prompt.confirm(
          window,
          "Focus Columns",
          syncText(
            `同步计划：\n${summary}\n\nEasyScholar 密钥永远不包含在同步数据中。是否继续？`,
            `Synchronization plan:\n${summary}\n\nEasyScholar keys are never included. Continue?`
          )
        )) {
          this.setBlocked("needs-choice", syncText("已取消同步更改。", "Synchronization changes were cancelled."));
          return;
        }
      }
    }
    else {
      for (const decision of decisions) {
        if (decision.action === "conflict") unresolved.add(decision.channel);
      }
    }

    if (!objects.note) {
      try {
        objects = objects.container
          ? await this.createNoteFor(objects.container)
          : await this.createSyncObjects();
      }
      catch (error) {
        Zotero.logError(error);
        this.setBlocked("error", syncText("无法创建同步条目或笔记。", "Could not create the synchronization item or note."));
        return;
      }
    }

    const failures = new Map<SyncChannelName, unknown>();
    for (const decision of decisions) {
      if (unresolved.has(decision.channel)) continue;
      try {
        await this.executeDecision(objects, decision);
      }
      catch (error) {
        Zotero.logError(error);
        failures.set(decision.channel, error);
      }
    }
    if (unresolved.size || failures.size) {
      this.setChannelIssues(objects, preferences, unresolved, failures);
      return;
    }

    setRuntimePref("everConnected", true);
    setRuntimePref("containerKey", itemKey(objects.container));
    setRuntimePref("noteKey", itemKey(objects.note));
    setRuntimePref("containerID", String(objects.container.id));
    setRuntimePref("noteID", String(objects.note.id));
    const publicationChannel = objects.data.channels.publications;
    this.status = {
      state: "ready",
      enabled: true,
      publicationsEnabled: preferences.publications,
      settingsEnabled: preferences.settings,
      publicationsState: preferences.publications ? "ready" : "disabled",
      settingsState: preferences.settings ? "ready" : "disabled",
      publicationCount: Object.keys(this.cache.snapshot().entries).length,
      syncedPublicationCount: publicationChannel
        ? Object.keys(publicationChannel.data.entries).length
        : null,
      syncDataUpdatedAt: objects.data.updatedAt,
      checkedAt: new Date().toISOString(),
      containerKey: itemKey(objects.container),
      noteKey: itemKey(objects.note),
      detail: syncText(
        "Focus Columns 同步数据已连接。网络同步由 Zotero 负责。",
        "Focus Columns synchronization data is connected. Zotero handles network synchronization."
      )
    };
  }

  private decisions(data: FocusColumnsSyncData, preferences: SyncPreferences): Array<ChannelDecision<any>> {
    const output: Array<ChannelDecision<any>> = [];
    if (preferences.publications) {
      const local = this.cache.snapshot();
      const remote = data.channels.publications;
      output.push({
        channel: "publications",
        local,
        remote,
        action: reconcileChannel(local, channelHead("publications"), remote, this.cache.isEmpty())
      });
    }
    if (preferences.settings) {
      const local = readSyncableSettings();
      const remote = data.channels.settings;
      output.push({
        channel: "settings",
        local,
        remote,
        action: reconcileChannel(
          local,
          channelHead("settings"),
          remote,
          contentHash(local) === contentHash(defaultSyncableSettings())
        )
      });
    }
    return output;
  }

  private async executeDecision(objects: SyncObjects, decision: ChannelDecision<any>): Promise<void> {
    if (decision.action === "equal") {
      if (decision.remote) setChannelHead(decision.channel, decision.remote.contentHash);
      return;
    }
    if (decision.action === "pull") {
      if (!decision.remote) throw new Error("Missing synchronization channel");
      await this.backupStore.create(decision.channel, decision.local);
      await this.applyLocal(decision.channel, decision.remote.data);
      setChannelHead(decision.channel, decision.remote.contentHash);
      return;
    }
    if (decision.action === "push") {
      const channel = createSyncedChannel(decision.local, decision.remote);
      (objects.data.channels as any)[decision.channel] = channel;
      objects.data.pluginVersion = this.pluginVersion;
      objects.data.updatedAt = new Date().toISOString();
      await this.saveNote(objects.note, objects.data);
      setChannelHead(decision.channel, channel.contentHash);
      decision.remote = channel;
      return;
    }
    throw new Error(`Unresolved ${decision.channel} conflict`);
  }

  private async applyLocal(channel: SyncChannelName, data: SyncChannelData): Promise<void> {
    this.applyingRemote = true;
    try {
      if (channel === "publications") {
        await this.cache.replace(data as PublicationCacheFile);
      }
      else {
        writeSyncableSettings(data as SyncableSettings);
        this.onSettingsImported();
      }
    }
    finally {
      this.applyingRemote = false;
    }
  }

  private chooseDirection(window: any, channel: SyncChannelName): "pull" | "push" | null {
    const choice = Services.prompt.confirmEx(
      window,
      "Focus Columns",
      syncText(
        `本机和 Zotero 中的${channelLabel(channel)}都已更改。请选择保留哪一方。`,
        `The local and Zotero ${channelLabel(channel)} data both changed. Choose which version to keep.`
      ),
      Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING
        + Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_IS_STRING
        + Services.prompt.BUTTON_POS_2 * Services.prompt.BUTTON_TITLE_CANCEL,
      syncText("使用 Zotero 中的数据", "Use Zotero data"),
      syncText("使用本机数据", "Use local data"),
      null,
      null,
      {}
    );
    return choice === 0 ? "pull" : choice === 1 ? "push" : null;
  }

  private async findSyncObjects(): Promise<SyncObjects | null> {
    const search = new Zotero.Search();
    search.libraryID = personalLibraryID();
    search.addCondition("itemType", "is", "computerProgram");
    search.addCondition("extra", "contains", SYNC_CONTAINER_MARKER);
    const ids = await search.search();
    const candidates = (await Zotero.Items.getAsync(ids))
      .filter((item: any) => !item.deleted && exactExtraMarker(item));
    if (candidates.length > 1) throw new Error("duplicate-container");
    if (!candidates.length) return null;
    const container = candidates[0];
    const connectedContainerKey = runtimePref("containerKey");
    if (runtimePref("everConnected") === "true"
      && connectedContainerKey
      && itemKey(container) !== connectedContainerKey) {
      throw new Error("missing-container");
    }
    const titledNotes = (await Zotero.Items.getAsync(container.getNotes()))
      .filter((note: any) => !note.deleted && String(note.getNoteTitle?.() || "").trim() === SYNC_NOTE_TITLE);
    const notes = titledNotes.filter((note: any) => noteHasMarker(note));
    if (notes.length > 1) throw new Error("duplicate-note");
    if (!notes.length) {
      if (titledNotes.length === 1) parseSyncNote(titledNotes[0].getNote());
      if (runtimePref("everConnected") === "true") throw new Error("missing-note");
      throw new Error(`uninitialized-note:${container.id}`);
    }
    const note = notes[0];
    const connectedNoteKey = runtimePref("noteKey");
    if (runtimePref("everConnected") === "true"
      && connectedNoteKey
      && itemKey(note) !== connectedNoteKey) {
      throw new Error("missing-note");
    }
    const data = parseSyncNote(note.getNote());
    return {
      container,
      note,
      data,
      containerStatus: "found",
      noteStatus: "found"
    };
  }

  private async createSyncObjects(): Promise<SyncObjects> {
    const container = new Zotero.Item("computerProgram");
    container.libraryID = personalLibraryID();
    container.setField("title", SYNC_CONTAINER_TITLE);
    container.setField("extra", SYNC_CONTAINER_MARKER);
    await container.saveTx();
    return this.createNoteFor(container, "created");
  }

  private async createNoteFor(
    container: any,
    containerStatus: "found" | "created" = "found"
  ): Promise<SyncObjects> {
    const note = new Zotero.Item("note");
    note.libraryID = personalLibraryID();
    note.parentID = container.id;
    const data = createSyncData(this.pluginVersion);
    note.setNote(renderSyncNote(data));
    await note.saveTx();
    return { container, note, data, containerStatus, noteStatus: "created" };
  }

  private async saveNote(note: any, data: FocusColumnsSyncData): Promise<void> {
    this.writingNote = true;
    try {
      note.setNote(renderSyncNote(data));
      await note.saveTx();
    }
    finally {
      this.writingNote = false;
    }
  }

  private handleObjectError(error: unknown): void {
    if (error instanceof SyncDataError) {
      const states: Record<SyncDataError["kind"], SyncState> = {
        missing: "invalid-data",
        invalid: "invalid-data",
        "newer-schema": "newer-data",
        "too-large": "too-large"
      };
      const details: Record<SyncDataError["kind"], string> = {
        missing: syncText("同步笔记缺少 Focus Columns 数据标记。", "The synchronization note is missing its Focus Columns data marker."),
        invalid: syncText("同步笔记内容已损坏或校验不通过。", "The synchronization note is damaged or failed validation."),
        "newer-schema": syncText("同步笔记由更新的 Focus Columns 版本写入，请先升级插件。", "The synchronization note was written by a newer Focus Columns data format. Update the plugin first."),
        "too-large": syncText("同步数据超过 350,000 字符限制，已停止写入。", "Synchronization data exceeds the 350,000-character limit, so writing stopped.")
      };
      this.setBlocked(states[error.kind], details[error.kind]);
      return;
    }
    const message = String(error);
    if (message.includes("duplicate-container")) this.setBlocked("duplicate-container", syncText(
      "发现多个共享同步条目，请手工保留一个。",
      "More than one shared container was found. Keep one manually."
    ));
    else if (message.includes("duplicate-note")) this.setBlocked("duplicate-note", syncText(
      "发现多个 Focus Columns 同步笔记，请手工保留一个。",
      "More than one Focus Columns synchronization note was found. Keep one manually."
    ));
    else if (message.includes("missing-container")) this.setBlocked("missing-container", syncText(
      "已连接的共享同步条目已缺失或已被另一个条目替代。",
      "The connected shared synchronization item is missing or has been replaced by a different item."
    ));
    else if (message.includes("missing-note")) this.setBlocked("missing-note", syncText(
      "已连接的 Focus Columns 同步笔记已缺失或位于回收站。",
      "The connected Focus Columns synchronization note is missing or in the trash."
    ));
    else {
      Zotero.logError(error);
      this.setBlocked("error", message);
    }
  }

  private setChannelIssues(
    objects: SyncObjects,
    preferences: SyncPreferences,
    conflicts: Set<SyncChannelName>,
    failures: Map<SyncChannelName, unknown>
  ): void {
    const failedChannels = [...failures.keys()];
    const state: SyncState = [...failures.values()].some(error => (
      error instanceof SyncDataError && error.kind === "too-large"
    )) ? "too-large" : conflicts.size ? "conflict" : "error";
    const channelState = (channel: SyncChannelName): string => {
      if (!channelEnabled(preferences, channel)) return "disabled";
      if (conflicts.has(channel)) return "conflict";
      if (failures.has(channel)) return "error";
      return "ready";
    };
    this.status = {
      state,
      enabled: true,
      publicationsEnabled: preferences.publications,
      settingsEnabled: preferences.settings,
      publicationsState: channelState("publications"),
      settingsState: channelState("settings"),
      publicationCount: Object.keys(this.cache.snapshot().entries).length,
      syncedPublicationCount: objects.data.channels.publications
        ? Object.keys(objects.data.channels.publications.data.entries).length
        : null,
      syncDataUpdatedAt: objects.data.updatedAt,
      checkedAt: new Date().toISOString(),
      containerKey: itemKey(objects.container),
      noteKey: itemKey(objects.note),
      detail: [
        conflicts.size ? syncText(
          `请选择保留哪一方的${[...conflicts].map(channelLabel).join("、")}。`,
          `Choose which data to keep for: ${[...conflicts].map(channelLabel).join(", ")}.`
        ) : "",
        failures.size ? syncText(
          `无法更新：${failedChannels.map(channelLabel).join("、")}。`,
          `Could not update: ${failedChannels.map(channelLabel).join(", ")}.`
        ) : ""
      ].filter(Boolean).join(" ")
    };
  }

  private setBlocked(state: SyncState, detail: string): void {
    const preferences = readSyncPreferences();
    this.status = {
      ...this.initialStatus(state),
      enabled: preferences.enabled,
      publicationsEnabled: preferences.publications,
      settingsEnabled: preferences.settings,
      detail,
      checkedAt: new Date().toISOString()
    };
  }

  private initialStatus(state: SyncState = "disabled"): SyncStatus {
    const preferences = readSyncPreferences();
    return {
      state,
      enabled: preferences.enabled,
      publicationsEnabled: preferences.publications,
      settingsEnabled: preferences.settings,
      publicationsState: preferences.publications ? "idle" : "disabled",
      settingsState: preferences.settings ? "idle" : "disabled",
      publicationCount: Object.keys(this.cache.snapshot().entries).length,
      syncedPublicationCount: null,
      syncDataUpdatedAt: null,
      checkedAt: null,
      containerKey: runtimePref("containerKey") || null,
      noteKey: runtimePref("noteKey") || null,
      detail: state === "disabled"
        ? syncText("本机已关闭跨电脑同步。", "Cross-computer synchronization is disabled on this computer.")
        : ""
    };
  }

  private scheduleCheck(delay: number): void {
    if (this.stopped || !readSyncPreferences().enabled) return;
    if (this.writeTimer !== null) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.check(null, false);
    }, delay) as unknown as number;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const task = this.operationChain.then(operation);
    this.operationChain = task.catch(error => Zotero.logError(error));
    return task;
  }

}

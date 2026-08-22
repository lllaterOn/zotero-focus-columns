import { BACKUP_DIRECTORY_NAME } from "../constants";
import { contentHash, type SyncChannelData, type SyncChannelName } from "../domain/sync";

interface BackupFile<T extends SyncChannelData> {
  schemaVersion: 1;
  channel: SyncChannelName;
  createdAt: string;
  contentHash: string;
  data: T;
}

export interface BackupRecord<T extends SyncChannelData = SyncChannelData> {
  path: string;
  channel: SyncChannelName;
  createdAt: string;
  data: T;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) || path;
}

export class SyncBackupStore {
  readonly directory: string;
  private sequence = 0;

  constructor(directory = PathUtils.join(Zotero.DataDirectory.dir, BACKUP_DIRECTORY_NAME)) {
    this.directory = directory;
  }

  async create<T extends SyncChannelData>(channel: SyncChannelName, data: T): Promise<BackupRecord<T>> {
    await this.ensureDirectory();
    const createdAt = new Date().toISOString();
    const safeTime = createdAt.replace(/[:.]/g, "-");
    this.sequence += 1;
    const path = PathUtils.join(
      this.directory,
      `${channel}-${safeTime}-${String(this.sequence).padStart(4, "0")}.json`
    );
    const backup: BackupFile<T> = {
      schemaVersion: 1,
      channel,
      createdAt,
      contentHash: contentHash(data),
      data: JSON.parse(JSON.stringify(data)) as T
    };
    await IOUtils.writeUTF8(path, JSON.stringify(backup, null, 2) + "\n", {
      tmpPath: `${path}.tmp`
    });
    await this.prune(channel);
    return { path, channel, createdAt, data: backup.data };
  }

  async latest<T extends SyncChannelData>(channel: SyncChannelName): Promise<BackupRecord<T> | null> {
    if (!(await IOUtils.exists(this.directory))) return null;
    const paths = (await IOUtils.getChildren(this.directory))
      .filter((path: string) => fileName(path).startsWith(`${channel}-`))
      .sort()
      .reverse();
    for (const path of paths) {
      try {
        return await this.read<T>(path, channel);
      }
      catch (error) {
        Zotero.logError(error);
      }
    }
    return null;
  }

  private async read<T extends SyncChannelData>(
    path: string,
    expectedChannel: SyncChannelName
  ): Promise<BackupRecord<T>> {
    const parsed = JSON.parse(await IOUtils.readUTF8(path)) as BackupFile<T>;
    if (parsed.schemaVersion !== 1
      || parsed.channel !== expectedChannel
      || typeof parsed.createdAt !== "string"
      || parsed.contentHash !== contentHash(parsed.data)) {
      throw new Error("Invalid Focus Columns backup");
    }
    return {
      path,
      channel: parsed.channel,
      createdAt: parsed.createdAt,
      data: parsed.data
    };
  }

  private async ensureDirectory(): Promise<void> {
    if (!(await IOUtils.exists(this.directory))) {
      await IOUtils.makeDirectory(this.directory, { ignoreExisting: true });
    }
  }

  private async prune(channel: SyncChannelName): Promise<void> {
    const paths = (await IOUtils.getChildren(this.directory))
      .filter((path: string) => fileName(path).startsWith(`${channel}-`))
      .sort()
      .reverse();
    for (const path of paths.slice(3)) await IOUtils.remove(path);
  }
}

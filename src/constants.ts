export const PLUGIN_ID = "focus-columns@lllateron.github.io";
export const PREF_BRANCH = "extensions.zotero.focus-columns.";
export const CACHE_FILE_NAME = "focus-columns-publications.json";
export const BACKUP_DIRECTORY_NAME = "focus-columns-backups";
export const SYNC_CONTAINER_MARKER = "personal-zotero-addons-container: 1";
export const SYNC_CONTAINER_TITLE = "Personal Zotero Addons";
export const SYNC_NOTE_MARKER = "FOCUS_COLUMNS_SYNC_DATA_V1";
export const SYNC_NOTE_TITLE = "Focus Columns";
export const SYNC_DATA_MAX_CHARACTERS = 350_000;

export const FIELD_LABELS: Record<string, string> = {
  sci: "SCI",
  ssci: "SSCI",
  sciUp: "SCI升级版",
  pku: "北大中文核心",
  sciwarn: "SCIWARN",
  eii: "EI检索",
  sciif: "SCIIF"
};

export const MEMBERSHIP_FIELDS = new Set(["pku", "sciwarn", "eii"]);

export const DEFAULT_RANK_COLORS = [
  "#ffe2dd",
  "#e8deee",
  "#dbeddb",
  "#fadec9",
  "#e9e8e7"
];

export const DEFAULT_MAP = [
  "SCI升级版=中",
  "SCI=",
  "/SCIIF/=IF",
  "EI检索=EI",
  "/^(\\d+)\\.(\\d{1})\\d*$/=$1.$2",
  "北大中文核心=北核",
  "SCIWARN=🚫",
  "/医学(\\d+)区/=医$1",
  "/生物学(\\d+)区/=生$1",
  "/农林科学(\\d+)区/=农$1",
  "/环境科学与生态学(\\d+)区/=环$1",
  "/化学(\\d+)区/=化$1",
  "/工程技术(\\d+)区/=工$1",
  "/数学(\\d+)区/=数$1",
  "/物理(\\d+)区/=物$1",
  "/地球科学(\\d+)区/=地$1",
  "/材料科学(\\d+)区/=材$1",
  "/计算机科学(\\d+)区/=计$1",
  "/经济学(\\d+)区/=经$1",
  "/法学(\\d+)区/=法$1",
  "/管理科学(\\d+)区/=管$1",
  "/心理学(\\d+)区/=心$1",
  "/人文科学(\\d+)区/=人$1",
  "/教育学(\\d+)区/=教$1",
  "/综合性期刊(\\d+)区/=综$1"
].join("\n");

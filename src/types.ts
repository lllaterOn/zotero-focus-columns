export type RankScalar = string | number | boolean | null | undefined;
export type RankRecord = Record<string, RankScalar>;

export interface PublicationCacheEntry {
  publication: string;
  rank: RankRecord;
  source: "easyscholar" | "zotero-style-6.0.8-import" | "user-cleared";
  fetchedAt: string | null;
}

export interface PublicationCacheFile {
  schemaVersion: 1;
  generatedAt: string;
  entries: Record<string, PublicationCacheEntry>;
}

export interface Badge {
  key: string;
  text: string;
  background: string;
  foreground: string;
  title?: string;
}

export interface NativeTag {
  tag: string;
  type?: number;
}

export interface TagColor {
  color: string;
  position: number;
}

export interface MapRule {
  kind: "literal" | "regex";
  source: string;
  replacement: string;
  regex?: RegExp;
}

export interface ParseResult<T> {
  value: T;
  errors: string[];
}

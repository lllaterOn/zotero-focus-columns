# Architecture

## Runtime Structure

- `src/plugin.ts` owns startup, shutdown, preference registration, Zotero notifier integration, and controller lifecycles.
- `src/features/columns.ts` registers the four item-tree columns and preserves Zotero's secondary and fallback sorting.
- `src/features/infoRows.ts` registers the two official item-pane information rows.
- `src/features/popovers.ts` and `src/features/render.ts` implement item-tree interaction and presentation.
- `src/services/publicationCache.ts`, `publicationService.ts`, and `easyScholar.ts` own publication data and external cache-miss requests.
- `src/services/syncService.ts` and `src/domain/sync.ts` own local-note synchronization, validation, conflict decisions, and status reporting.
- `addon/` contains the Zotero manifest, defaults, preferences UI, locale resources, styles, and bootstrap entry point.

## Stable Identity

- Display name: `Focus Columns`
- Add-on ID: `focus-columns@lllateron.github.io`
- Preference branch: `extensions.zotero.lllateron.focusColumns.*`
- Persistent cache: `focus-columns-publications.json`
- Local backup directory: `focus-columns-backups`
- Shared container marker: `personal-zotero-addons-container: 1`
- Child-note title: `Focus Columns`
- Synchronization marker: `FOCUS_COLUMNS_SYNC_DATA`

These values are compatibility contracts after 1.0.0 and must not be renamed casually.

## Item Data Contracts

### Publication Tags

The publication cache is a schema-versioned JSON file under the Zotero data directory. Each entry stores a normalized publication key, display name, rank record, source, and fetch time. Supported sources are `easyscholar` and `user-cleared`.

A `user-cleared` entry intentionally contains no visible ranks. Automatic cache-miss fetching must not replace it; an explicit manual refresh may do so.

### Hash Tags and Status

Hash tags and status values are native Zotero tags. The hash-tag column displays tags beginning with `#` and hides only the first prefix character. Status uses colored tags beginning with `/`; `/yes`, `/ing`, and `/no` form one mutually exclusive group.

### Remark

The remark is one `remark:` line in the Zotero `Extra` field. Reads and writes must preserve every unrelated line.

## Sorting Contract

- Publication tags use the configured publication sort expression, defaulting to `sci,-sciif`.
- Hash tags use displayed text.
- Status uses the full native tag name.
- Remark uses the remark text.

Custom sort keys contain only the primary value. They never append a Zotero item ID, so equal values continue through Zotero's configured secondary and fallback fields.

## Item Pane Boundary

The item-pane rows use Zotero's official `ItemPaneInfoRow` API. Zotero 10 exposes only `start`, `afterCreators`, and `end`, and row renderers return strings. Exact placement after an arbitrary native field and colored inline badges would require private DOM integration and are intentionally outside the 1.0 contract.

## Synchronization Contract

Synchronization is opt-in and has independent publication and settings channels. Focus Columns reads and writes one visible child note under a marked software item in the personal library. Zotero itself performs network synchronization.

The note payload uses internal `schemaVersion: 1` and contains:

- the stable plugin ID and plugin version;
- an update time;
- independently versioned publication and settings channels;
- per-channel revision, update time, base content hash, current content hash, and full channel data.

It does not contain a device identifier, EasyScholar key, synchronization switch, runtime item key, or backup. Unknown fields, foreign plugin IDs, invalid hashes, newer schemas, damaged content, and oversized content are rejected before any write.

Conflict direction is determined from the local content hash, last-known channel head, and remote content hash. When both sides changed, the user chooses one complete version. Channels remain independent, so one conflict does not prevent a safe update in the other channel.

Disabling synchronization or uninstalling the plugin never deletes Zotero objects. A previously connected item or note that is missing or trashed blocks synchronization instead of triggering silent recreation.

## Secret Boundary

The EasyScholar key is a local Zotero preference and is masked in the UI. Repository and package verification scan for common credential forms. Local backups exclude the key because synchronized settings are produced by an explicit allowlist.

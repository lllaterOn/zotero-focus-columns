# Focus Columns

Focus Columns is an independent Zotero 10 plugin for a compact personal literature workflow. It does not contain code copied from Ethereal Style 6.0.8 or its obfuscated bundle.

## Included

- Publication tags from an on-disk cache and EasyScholar cache-miss requests
- All native Zotero tags whose names begin with `#`, with only the first `#` hidden in the column
- One mutually exclusive status chosen from the library's colored `/` tags
- A remark stored in the item's `Extra` field as `remark: <text>`
- Independent item-tree and item-pane switches for publication tags and remarks
- Manual publication refresh for selected items
- Confirmed removal of selected publications' cached tags, with manual refresh available to restore them
- Optional cross-computer synchronization through a user-visible note in the personal Zotero library
- An icon-bearing official Zotero item-menu command in its own custom menu group
- A shared SVG icon in the Zotero preferences sidebar

The six feature switches are registered independently. The item-pane rows use Zotero's official info-row API: the remark is placed at the start of the Info section, while publication ranks use the nearest supported position after creators. Info rows are plain text because this API accepts strings only; exact placement after an individual built-in field and colored inline badges would require unsupported DOM injection.

## Column Sorting

Clicking a custom column header uses these primary values:

- Publication tags: the advanced `Sort` specification, by default `sci,-sciif` (SCI rank ascending, then impact factor descending)
- `#` tags: the displayed tag texts in their displayed order
- Status: the full native `/` tag name
- Remark: the remark text

Empty cells follow Zotero's normal empty-value placement. Rows with the same primary value continue through Zotero's configured secondary and fallback fields; no hidden item ID is included in the sort key.

Zotero's native Added and Modified columns are intentionally unchanged. AI remarks, nested tags, rating, translation, views, and other Ethereal Style features are outside this project.

## Development

```powershell
npm install
npm run verify
```

The packaged extension is written to `dist/focus-columns-<version>.xpi`.

Version 0.1.5 uses Zotero's official `MenuManager` for the item context-menu command. Zotero
places the command in the custom-menu group and supplies the group separator. The icon is the
single-color `content/icons/focus-columns.svg` resource used by both the menu and preferences.

Version 0.1.6 restores EasyScholar requests in Zotero 10 by importing `AbortController`
into the plugin sandbox and using a cancellable 20-second timeout. EasyScholar business errors
are no longer treated as empty data. Manual updates stop on the first systemic failure, preserve
existing cache entries, and show a specific message without exposing the key or request URL.

Version 0.1.7 adds a second official item-menu command for deleting the publication tags of
selected items. The operation is confirmed once per batch, deduplicates publication names, and
atomically persists user-cleared markers so automatic cache-miss requests do not restore deleted
tags. A later manual update restores the current EasyScholar data.

Version 0.1.8 adds opt-in synchronization for publication tags and non-secret plugin settings.
The two channels are controlled independently on each computer; publication synchronization is
selected by default and settings synchronization is not. Focus Columns stores its data in a
visible child note under a shared item in the personal library. Zotero, not this plugin, performs
network synchronization. EasyScholar keys are never written to the note or local synchronization
backups.

Version 0.1.9 reorganizes the synchronization explanation and live status into a concise summary,
muted minute-level timestamps, and a separate error detail. Publication counts now explicitly
distinguish the local cache from the synchronization note; the synchronization data format is
unchanged.

## Cross-Computer Synchronization

Synchronization is off by default. Enabling it searches the personal library before creating
anything, so a new computer can connect to an item already downloaded by Zotero. The final
creation or import plan is shown before any new Zotero item is saved. Local changes are written to
the local Zotero note after a short delay; use Zotero's own Sync button when an immediate network
transfer is needed.

The shared container contract is intentionally small so later personal plugins can reuse it:

- Item type: Software (`computerProgram`)
- Default title: `Personal Zotero Addons` (the user may rename or move it)
- Exact `Extra` marker line: `personal-zotero-addons-container: 1`
- One child note per plugin; the visible title for this plugin is `Focus Columns`
- Stable plugin identifier inside the note: `focus-columns@lllateron.github.io`

Focus Columns only reads and writes its own child note. Duplicate containers or duplicate Focus
Columns notes pause synchronization for manual resolution. A connected item or note that is moved
to the trash is not silently recreated. Turning synchronization off or uninstalling the plugin
does not delete Zotero data.

Each synchronized channel has its own revision, last-known content hash, and conflict state.
When both the local and Zotero versions changed, the user chooses which complete version to keep;
the other channel continues independently. Before Zotero data replaces local data, a credential-
free backup is written under `<Zotero data directory>/focus-columns-backups/`. The newest three
backups per channel are retained and can be restored from preferences.

The note format is versioned and validated. Focus Columns stops rather than overwriting data from
a newer format, damaged content, or content above the conservative 350,000-character limit.
Settings synchronization excludes the EasyScholar key and all local synchronization controls.

## Cache Migration

Migration is an external command, not a plugin feature:

```powershell
npm run migrate:cache -- --input "C:\path\to\zoterostyle.json"
```

This creates a new cache and report under `migration-output/`. The input file is not changed. Copy the verified cache to the active Zotero data directory as `focus-columns-publications.json` only after testing with an isolated Zotero profile.

## Data Contracts

- Publication cache: `<Zotero data directory>/focus-columns-publications.json`
- User-cleared publication ranks remain as empty `user-cleared` cache entries until manually updated
- Remark: one `remark:` line in `Extra`; every non-remark line is preserved
- Status and `#` tags: native Zotero tags
- Secret key: local preference only; plaintext at rest, masked in the settings UI
- Synchronization controls, connected item IDs, and anonymous installation ID: local preferences only
- Local synchronization backups: `<Zotero data directory>/focus-columns-backups/`

Manual release acceptance for version 0.1.9 is documented in
[`docs/MANUAL_ACCEPTANCE_0.1.9.md`](docs/MANUAL_ACCEPTANCE_0.1.9.md).

This repository is private and unlicensed for redistribution.

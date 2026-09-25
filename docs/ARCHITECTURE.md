# Architecture

## Runtime Structure

- `src/plugin.ts` owns startup, shutdown, preference registration, Zotero notifier integration, and controller lifecycles.
- `src/features/columns.ts` registers the four item-tree columns and preserves Zotero's secondary and fallback sorting.
- `src/features/infoRows.ts` registers the two official item-pane information rows.
- `src/features/popovers.ts` and `src/features/render.ts` implement item-tree interaction and presentation.
- `src/features/viewGroups.ts` owns the toolbar menu and explicit group actions; `viewGroupLayout.ts` isolates native item-tree layout access. `src/domain/viewGroups.ts` validates group definitions, and `src/services/viewGroupStore.ts` separates shared definitions from local widths and active-group state.
- `src/services/publicationCache.ts`, `publicationService.ts`, and `easyScholar.ts` own publication data and external cache-miss requests.
- `src/services/syncService.ts` and `src/domain/sync.ts` own local-note synchronization, validation, conflict decisions, and status reporting.
- `addon/` contains the Zotero manifest, defaults, preferences UI, locale resources, styles, and bootstrap entry point.

### Stylesheet Loading

`WindowUI` receives the add-on version supplied to `startup` and loads `chrome://focus-columns/content/style.css?v=<encoded version>`. Changing the URI between releases prevents reuse of a previous version's parsed stylesheet during an upgrade without restarting Zotero. Removing the old link and sending `startupcache-invalidate` alone did not refresh that stylesheet in the controlled native test.

For a focused regression, use an isolated Zotero profile and disposable copies of the plugin assets. Load the old CSS through the unversioned chrome URL, replace the temporary CSS file with the current CSS, invalidate the startup cache, and remove/re-add the same link. Then change only its URL to include the new version. Compare the loaded CSS rules and native panel's visible border-box width. Never modify a published XPI or use a personal profile for this fixture.

In isolated headless Zotero `10.0.2`, this sequence retained the old 294 CSS-pixel visible panel and 280-pixel form at the unchanged URL; the versioned URL loaded the new `::part` rule and measured 190 and 176 CSS pixels respectively. The current CSS also produced a 190-pixel visible panel with short labels at font sizes 14, 16, and 20. These measurements verify the controlled cache reproduction, not the state of the user's profile or complete interactive acceptance.

The hash-tag search field resets native margins to zero: its full width plus the native horizontal margins otherwise overflowed the form by 8 CSS pixels. The isolated native measurement changed from a 184-pixel scroll width with a 176-pixel client width to 176 for both, without changing popup width limits, font size, or row height.

## Stable Identity

- Display name: `Zotero Focus Columns`
- Add-on ID: `focus-columns@lllateron.github.io`
- Preference branch: `extensions.zotero.lllateron.focusColumns.*`
- Persistent cache: `focus-columns-publications.json`
- Local backup directory: `focus-columns-backups`
- Shared container marker: `personal-zotero-addons-container: 1`
- Child-note title: `Focus Columns`
- Synchronization marker: `FOCUS_COLUMNS_SYNC_DATA`
- Update manifest: `https://raw.githubusercontent.com/lllaterOn/zotero-focus-columns/main/updates.json`

These values are compatibility contracts after 1.0.0 and must not be renamed casually.

## Distribution Boundary

Git tags identify the exact source commit for a version. GitHub Actions builds one Draft Release XPI from that tag. The accepted Draft asset is published without replacement. Only after formal publication is the version, public download URL, SHA-256, and Zotero compatibility range added to `updates.json`; drafts are never advertised to installed clients.

The update manifest and Release URLs are public and contain no credential. `package.json` remains marked `private` only to prevent accidental publication to the npm registry.

## Item Data Contracts

### Publication Tags

The publication cache is a schema-versioned JSON file under the Zotero data directory. Each entry stores a normalized publication key, display name, rank record, source, and fetch time. Supported sources are `easyscholar` and `user-cleared`.

A `user-cleared` entry intentionally contains no visible ranks. Automatic cache-miss fetching must not replace it; an explicit manual refresh may do so.

### Hash Tags and Status

Hash tags and status values are native Zotero tags. The hash-tag column displays tags beginning with `#` and hides only the first prefix character. Status uses colored tags beginning with `/`; `/yes`, `/ing`, and `/no` form one mutually exclusive group.

The hash-tag popup offers searchable single selection from all existing native tags beginning with `#` in the current library, including tags without colors. It does not create tags. Choosing a candidate replaces every hash tag on each target item with that exact native tag name; clearing removes all hash tags. Both actions preserve all non-hash tags, save, close the popup, and support undo. Opening the popup or upgrading the plugin never migrates existing multiple hash tags. Multiple or mixed values must not appear as a single shared selection.

Hash-tag editing follows the status selection scope: clicking a selected regular item targets selected regular items in the same library; clicking an unselected regular item targets only that item. Noneditable libraries must not accept edits.

Press and release handling in the hash-tag and status columns must preserve the selected item set before an edit is chosen. Batch scope must not collapse to the clicked row as a side effect of opening the popup.

An outside click on a different cell must dismiss the current popup and reach that cell in one interaction. Clicking the original anchor dismisses its popup without immediately reopening it.

### Popup Placement

Item-tree popovers must appear centered relative to the clicked cell on their first visible frame, with screen-edge adjustment. Background redraws of virtualized item rows must not invalidate an open popup's position or unexpectedly hide it. Window movement and item-list scrolling must dismiss a popup when its original position is no longer appropriate. Status and remark popovers share the placement contract and require regression checks at different column widths, screen edges, and display scales.

The hash-tag popup targets roughly 180–200 CSS pixels for short labels and may expand for longer labels up to 280 CSS pixels. Font size, row height, and search remain usable. Opening it must not automatically focus search; clicking the search field transfers focus. Dismissal should restore list focus when appropriate, while an explicit click on another control must retain the user's chosen focus. These are user-interface acceptance requirements; automated tests alone cannot verify the reported flicker, disappearance, or gray-to-blue selection behavior in real Zotero.

### Remark

The remark is one `remark:` line in the Zotero `Extra` field. Reads and writes must preserve every unrelated line.

## Sorting Contract

- Publication tags use the configured publication sort expression, defaulting to `sci,-sciif`.
- Hash tags use displayed text.
- Status uses the full native tag name.
- Remark uses the remark text.

Custom sort keys contain only the primary value. They never append a Zotero item ID, so equal values continue through Zotero's configured secondary and fallback fields.

## View Groups

### Data Refresh Boundary

Item and setting notifications, publication-cache changes, and imported display settings invalidate row data and redraw existing item trees through `invalidateRowCache(true)` and `tree.invalidate()`. They do not call `ItemTreeManager.refreshColumns()`: that emits a structural refresh, resets the native `Columns` object, and reinterprets persisted width bases after a user drag. Ordinary data updates must retain the current column objects, layout, and selection; they must not reapply the active view or save transient widths.

The plugin subscribes to publication-cache changes so remote replacements redraw even without another item notification. The subscription and pending redraw timer are removed during shutdown. Native column registration changes and explicit view selection still use structural layout operations when required.

### Saved Layouts

The toolbar uses an icon and Zotero's native dropdown arrow. The current group's name remains in the tooltip, accessible label, and checked menu entry, avoiding clipped text in Zotero's fixed-width toolbar menu buttons.

The toolbar button never receives a visible `label`; its accessible name, tooltip, and image are set before insertion. Startup therefore does not depend on an asynchronously loaded stylesheet to hide text. `view-layout.svg` has a native 20-pixel canvas and inherits the control color through `context-fill`. The add-on manager and preference entry use a separate, colored `focus-columns-app.svg`. These resource paths replace the old shared icon, without loading sibling plugins or adding runtime dependencies.

Each group contains a stable ID, a name, and an ordered array of column keys with visibility flags. The groups' array order determines menu order. Saving or explicitly updating a group captures the current layout; ordinary column adjustments do not automatically rewrite its definition. Updating preserves definitions for columns unavailable on the current computer. Switching applies available columns only; unavailable columns can be restored by switching again after their provider is enabled.

Definitions use the `viewGroups.definitions` preference. The separate `viewGroups.local` preference stores the active group ID and widths keyed by group ID and column key. These local values are excluded from synchronized settings and content hashes. A group without saved widths on this computer uses existing native widths. Renaming a group does not change its ID or associate it with another computer's widths.

The layout adapter uses Zotero 10 item-tree column preferences and a column reset; it must preserve the effective primary sort and all secondary/fallback preferences without sorting rows, changing search or filters, or replacing the selection. A hidden sort column remains the sort column. Widths use native preference units rather than rendered cell widths, avoiding accumulated padding changes. Native primary-column visibility requirements remain in force.

Saved widths are native layout bases, not fixed visible pixel widths. Zotero applies them as flexible column bases: opening a sidebar reduces available space and its normal layout shrinks eligible columns subject to minimum sizes; fixed/static columns do not participate. Sidebar and window resizing alone do not persist new group widths. Focus Columns does not intercept resize events or apply a different shrink policy.

This integration depends on native item-tree methods rather than a public layout-preset API. Capability checks restrict capture and apply to supported library views. Recheck the adapter when Zotero changes; user acceptance covers library/collection changes, missing third-party columns, and different screen widths. Group definitions and local active state belong to the Zotero profile and are not saved per library or per window; native layout persistence still follows Zotero's own view groups.

## Item Pane Boundary

The item-pane rows use Zotero's official `ItemPaneInfoRow` API. Zotero 10 exposes only `start`, `afterCreators`, and `end`, and row renderers return strings. Exact placement after an arbitrary native field and colored inline badges would require private DOM integration and are intentionally outside the 1.0 contract.

## Synchronization Contract

Synchronization is opt-in and has independent publication and settings channels. Focus Columns reads and writes one visible child note under a marked software item in the personal library. Zotero itself performs network synchronization.

The note payload supports internal `schemaVersion: 1` and `2` and contains:

- the stable plugin ID and plugin version;
- an update time;
- independently versioned publication and settings channels;
- per-channel revision, update time, base content hash, current content hash, and full channel data.

It does not contain a device identifier, EasyScholar key, synchronization switch, runtime item key, backup, view-group widths, or active view-group ID. Unknown fields, foreign plugin IDs, invalid hashes, newer schemas, damaged content, and oversized content are rejected before any write.

Schema 1 retains the exact legacy settings representation. Schema 2 permits an optional `viewGroups` field in the existing settings channel; it adds no channel. The envelope upgrades only when an actual settings write publishes group definitions, including an explicitly empty group list. Installing the new version, leaving groups unused, or using groups with settings synchronization disabled does not upgrade a legacy note. An upgraded envelope is never downgraded.

An absent `viewGroups` field describes no group state and must not erase existing local groups; an explicit empty list deletes the shared definitions. Absence is preserved in legacy hashes rather than normalized to an empty list. Schema-2 notes require Focus Columns 1.2.0 or later on both computers: older clients reject the whole newer envelope before channel selection and pause all Focus Columns synchronization with an upgrade message.

Conflict direction is determined from the local content hash, last-known channel head, and remote content hash. When both sides changed, the user chooses one complete version. Channels remain independent, so one conflict does not prevent a safe update in the other channel.

View groups participate in the existing whole-settings conflict and backup behavior. Changes on both sides require an explicit choice; groups are not silently merged. Applying legacy settings leaves undescribed groups intact, and a later settings write can publish those retained definitions. Restoring settings never replaces local widths or the active group.

Disabling synchronization or uninstalling the plugin never deletes Zotero objects. A previously connected item or note that is missing or trashed blocks synchronization instead of triggering silent recreation.

## Secret Boundary

The EasyScholar key is a local Zotero preference and is masked in the UI. Repository and package verification scan for common credential forms. Local backups exclude the key because synchronized settings are produced by an explicit allowlist.

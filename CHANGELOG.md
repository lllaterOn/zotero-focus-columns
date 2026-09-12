# Changelog

All notable changes are recorded here. Releases follow semantic versioning.

## 1.1.1 — Pending acceptance

- Make the hash-tag popup compact for short labels, with bounded expansion for long labels, while retaining search, font size, and row height.
- Keep focus in the item list when opening the hash-tag popup; focus search only when the user chooses it, and restore list focus on dismissal without overriding an explicit click elsewhere.
- Preserve the selected item set across press and release events in the hash-tag and status columns so batch edits retain their intended scope.
- Allow one click on another cell to dismiss the old popup and reach the newly clicked cell instead of consuming the first outside click.
- Keep popup placement stable when background updates redraw virtualized item rows; dismiss appropriately when window movement or list scrolling makes that position stale.
- Add real Zotero acceptance cases for repeated clicks, popup disappearance, focus changes, selection preservation, and shared remark-popup behavior. Automated verification does not establish that the reported GIF behavior is resolved.

The `1.1.0` candidate remains unpublished and is retained without replacing its assets. Formal publication of `1.1.1` remains pending acceptance of its exact Draft XPI.

## 1.1.0 — Unpublished candidate

- Use native centered popup positioning so status menus appear centered on their first visible frame instead of moving after opening; remark popovers share the positioning behavior.
- Add a searchable single-selection popup to the hash-tag column, listing all existing native `#` tags in the current library, including uncolored tags, and hiding only the first `#` in displayed names.
- Replace all hash tags on the target items when choosing a tag, or remove them with the clear action, while preserving non-hash tags and supporting undo. Existing multiple hash tags remain unchanged until an explicit edit.
- Apply hash-tag edits to selected regular items in the same library when clicking a selected item, or only to the clicked item otherwise. Mixed or multiple hash-tag values are not presented as one shared selection.
- Add a two-computer acceptance checklist for the exact Draft XPI, covering popup placement, tag editing, undo, and existing-feature regressions. Formal publication remains pending real Zotero acceptance.

## 1.0.1

- Added the `applications.zotero.update_url` required for Zotero 10 to accept the XPI.
- Added a public, credential-free update manifest that advertises only formally published releases.
- Added automatic update-manifest publication from the exact accepted Release checksum.
- Hardened GitHub Actions by separating read-only builds from the minimal release-write job and pinning third-party Actions.
- Published the project under the MIT License and documented the public release, update, security, and acceptance workflows.

## 1.0.0

- Established Focus Columns as an independent Zotero 10 plugin project.
- Assigned the stable add-on ID `focus-columns@lllateron.github.io` and the project preference namespace `extensions.zotero.lllateron.focusColumns.*`.
- Removed device-generated metadata from synchronization notes while preserving revision, content-hash, conflict, backup, and channel-isolation behavior.
- Started a clean synchronization schema under the final plugin identity; pre-1.0 notes and preferences are not migrated.
- Initially used authenticated, manual GitHub Release downloads without a public update manifest.
- Added deterministic XPI assembly, repository hygiene checks, version consistency checks, CI verification, and draft-release automation.
- Removed one-time migration utilities, runtime profiles, obsolete update metadata, source maps, and stale acceptance documents from the maintained project tree.

## 0.1.9

- Reorganized synchronization help and status presentation into summary, time, and error-detail layers.
- Distinguished local and synchronization-note publication counts and improved narrow-window wrapping.

## 0.1.8

- Added opt-in synchronization for publication tags and non-secret plugin settings through a visible Zotero child note.
- Added independent synchronization channels, conflict prompts, local backups, and missing-object safeguards.

## 0.1.7

- Added confirmed publication-tag deletion with persistent user-cleared cache entries and manual restoration through refresh.

## 0.1.6

- Restored cancellable EasyScholar requests in Zotero 10 and improved systemic error handling without exposing keys or request URLs.

## 0.1.5

- Registered item-menu commands through Zotero's official menu API and introduced the shared plugin icon.

## 0.1.2–0.1.4

- Early development versions preceding the sanitized repository baseline. No historical Git tags or Releases are reconstructed for these versions.

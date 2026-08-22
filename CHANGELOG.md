# Changelog

All notable changes are recorded here. Releases follow semantic versioning.

## 1.0.0

- Established Focus Columns as an independent Zotero 10 plugin project.
- Assigned the stable add-on ID `focus-columns@lllateron.github.io` and the project preference namespace `extensions.zotero.lllateron.focusColumns.*`.
- Removed device-generated metadata from synchronization notes while preserving revision, content-hash, conflict, backup, and channel-isolation behavior.
- Started a clean synchronization schema under the final plugin identity; pre-1.0 notes and preferences are not migrated.
- Replaced inaccessible private-repository automatic updates with authenticated, manual GitHub Release downloads.
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

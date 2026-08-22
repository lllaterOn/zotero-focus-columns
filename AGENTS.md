# Focus Columns Repository Instructions

## Source of Truth

- Treat the current files under `src/`, `addon/`, `tests/`, and `scripts/` as the maintained product.
- Read `README.md`, `docs/ARCHITECTURE.md`, and `docs/DEVELOPMENT.md` before broad changes.
- Do not infer product behavior from generated XPI files, local Zotero data, logs, or runtime profiles.

## Product Boundary

- Focus Columns is an independent Zotero 10 plugin. Do not copy, inspect, execute, or depend on unrelated plugin bundles or private upstream artifacts.
- Keep Zotero databases, profiles, item data, caches, backups, logs, credentials, and machine-specific paths outside Git.
- Never read, print, log, package, or commit an EasyScholar key, GitHub credential, cookie, or request URL containing a credential.
- Preserve the six independent feature switches and the official `ItemPaneInfoRow` API boundary unless a change is explicitly planned and tested.

## Stable Identity and Data Contracts

- Add-on ID: `focus-columns@lllateron.github.io`.
- Preference branch: `extensions.zotero.lllateron.focusColumns.*`.
- Release asset: `zotero-focus-columns-<version>.xpi`.
- Synchronization must not contain device identifiers or local connection state.
- EasyScholar keys, synchronization switches, runtime connection keys, and local backups never enter synchronized settings.
- Do not silently merge conflicts, recreate trashed synchronization objects, or delete shared objects when synchronization is disabled or the plugin is uninstalled.

## Verification and Releases

- Run `npm run verify` after every code change.
- Keep `package.json`, `package-lock.json`, and `addon/manifest.json` on the same version.
- Update `CHANGELOG.md` and the current manual acceptance checklist for each release.
- Private GitHub Releases are installed manually; do not add authenticated URLs or tokens to an update manifest.
- A release tag creates one draft release artifact. Publish that same artifact only after real Zotero acceptance; do not rebuild it after acceptance.

## Git Workflow

- Pull `main` before starting work and inspect the worktree before editing.
- Use a `codex/<task>` branch, verify, commit, push, and merge through a reviewed pull request.
- Do not rewrite shared history or commit generated output, dependencies, secrets, or unrelated user changes.

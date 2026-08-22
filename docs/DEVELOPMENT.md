# Development

## Environment

Focus Columns requires Node.js 22 or newer. From the repository root:

```powershell
npm ci
npm run verify
```

`npm run verify` performs TypeScript checking, unit tests, repository hygiene validation, deterministic XPI assembly, and package-contract validation.

Generated directories and local dependencies are not versioned:

```text
node_modules/
build/
dist/
.npm-cache/
test/
```

## Repository Hygiene

Before committing, inspect `git status`, review the staged diff, and confirm that no Zotero profile, database, item export, cache, backup, log, credential, absolute machine path, or generated package is staged. The repository verifier reports only the affected path and never echoes suspected secret content.

## Multi-Device Workflow

For a normal change:

```powershell
git switch main
git pull --ff-only
git switch -c codex/<task>
# edit
npm run verify
git add <intentional-paths>
git commit
git push -u origin codex/<task>
```

Open a pull request, review the changes and checks, and merge to `main`. Before switching computers, commit and push the first computer's work; on the next computer, pull before continuing. Do not edit the same branch concurrently on multiple computers.

## Versioning

Releases use semantic versioning and tags named `v<major>.<minor>.<patch>`. Keep these files on the same version:

- `package.json`
- `package-lock.json`
- `addon/manifest.json`

Update `CHANGELOG.md` and the current Chinese manual acceptance checklist in the same change.

## Private Release Workflow

1. Merge a verified release change to `main`.
2. Create and push the matching version tag.
3. The release workflow runs `npm ci` and `npm run verify` in GitHub Actions.
4. Actions creates a private draft release containing the XPI and `SHA256SUMS`.
5. Download that exact draft asset and perform real Zotero acceptance on both computers.
6. If acceptance passes, publish the existing draft without rebuilding its assets.
7. If acceptance fails, leave the draft unpublished, fix the defect under a new version, and generate a new candidate.

The repository is private, so Zotero cannot anonymously fetch release assets. Do not restore an automatic update URL or embed a GitHub token in the plugin.

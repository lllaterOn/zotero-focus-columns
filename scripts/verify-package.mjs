import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const staging = join(root, "build", "addon");
const manifest = JSON.parse(await readFile(join(staging, "manifest.json"), "utf8"));
const packageJSON = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const updateManifest = JSON.parse(await readFile(join(root, "updates.json"), "utf8"));
const latestUpdate = updateManifest.addons?.["focus-columns@lllateron.github.io"]?.updates?.at(-1);

if (manifest.version !== packageJSON.version || latestUpdate?.version !== packageJSON.version) {
  throw new Error("Package, plugin manifest, and update manifest versions differ");
}
if (latestUpdate.update_link !== `https://github.com/lllaterOn/zotero-focus-columns/releases/download/v${packageJSON.version}/focus-columns-${packageJSON.version}.xpi`) {
  throw new Error("Unexpected update download URL");
}

if (manifest.applications?.zotero?.id !== "focus-columns@lllateron.github.io") {
  throw new Error("Unexpected plugin ID");
}
if (manifest.homepage_url !== "https://github.com/lllaterOn/zotero-focus-columns") {
  throw new Error("Unexpected plugin homepage");
}
if (manifest.applications?.zotero?.update_url !== "https://raw.githubusercontent.com/lllaterOn/zotero-focus-columns/main/updates.json") {
  throw new Error("Missing or unexpected Zotero update URL");
}
if (manifest.applications?.zotero?.strict_min_version !== "10.0") {
  throw new Error("The package is not restricted to Zotero 10");
}
if (manifest.applications?.zotero?.strict_max_version !== "10.0.*") {
  throw new Error("Unexpected Zotero maximum version");
}
if (manifest.icons?.["48"] !== "content/icons/focus-columns.svg"
  || manifest.icons?.["96"] !== "content/icons/focus-columns.svg") {
  throw new Error("Missing Focus Columns plugin icons");
}

for (const required of [
  "bootstrap.js",
  "prefs.js",
  "content/focus-columns.js",
  "content/icons/focus-columns.svg",
  "content/preferences.xhtml",
  "locale/en-US/focus-columns.ftl",
  "locale/zh-CN/focus-columns.ftl"
]) {
  await access(join(staging, required));
}

const bootstrap = await readFile(join(staging, "bootstrap.js"), "utf8");
const bundle = await readFile(join(staging, "content/focus-columns.js"), "utf8");
if (!/Components\.utils\.importGlobalProperties\(\["AbortController"\]\)/.test(bootstrap)) {
  throw new Error("Missing Zotero 10 AbortController compatibility import");
}
if (/AbortSignal\.timeout/.test(bundle)) {
  throw new Error("The package still depends on unavailable AbortSignal.timeout");
}
if (!bundle.includes("focus-columns-delete-publication") || !bundle.includes("user-cleared")) {
  throw new Error("Missing publication-tag deletion support");
}
if (!bundle.includes("personal-zotero-addons-container: 1")
  || !bundle.includes("FOCUS_COLUMNS_SYNC_DATA_V1")
  || !bundle.includes("focus-columns-backups")) {
  throw new Error("Missing cross-computer synchronization support");
}
if (/Zotero\.Sync\.|syncRunner|syncRunner\.js/i.test(bundle)) {
  throw new Error("The package must not invoke Zotero's private network synchronization internals");
}

const preferences = await readFile(join(staging, "content/preferences.xhtml"), "utf8");
const defaults = await readFile(join(staging, "prefs.js"), "utf8");
for (const required of [
  "focus-sync-enabled",
  "focus-sync-publications",
  "focus-sync-settings",
  "focus-sync-check",
  "focus-sync-summary",
  "focus-sync-meta",
  "focus-sync-detail"
]) {
  if (!preferences.includes(required)) throw new Error(`Missing synchronization control: ${required}`);
}
if (!/sync\.enabled", false/.test(defaults)
  || !/sync\.publications", true/.test(defaults)
  || !/sync\.settings", false/.test(defaults)) {
  throw new Error("Unexpected synchronization defaults");
}

const icon = await readFile(join(staging, "content/icons/focus-columns.svg"), "utf8");
if (!/<svg\b[^>]*viewBox=["']0 0 24 24["']/i.test(icon)
  || !/context-fill/i.test(icon)
  || /(?:<image\b|@import|(?:href|xlink:href)\s*=|data:image)/i.test(icon)) {
  throw new Error("Focus Columns icon does not satisfy the SVG resource contract");
}

const forbidden = [
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  /secretKey\s*[=:]\s*["'][a-f0-9]{20,}/i,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/
];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

for (const path of await walk(staging)) {
  const content = await readFile(path, "utf8");
  if (forbidden.some(pattern => pattern.test(content))) {
    throw new Error(`Possible secret in ${relative(staging, path)}`);
  }
}

console.log(`Verified Focus Columns ${manifest.version}`);

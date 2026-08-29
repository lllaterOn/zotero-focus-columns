import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const staging = join(root, "build", "addon");
const packageJSON = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
const sourceManifest = JSON.parse(await readFile(join(root, "addon", "manifest.json"), "utf8"));
const updateManifest = JSON.parse(await readFile(join(root, "updates.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(staging, "manifest.json"), "utf8"));
const zotero = manifest.applications?.zotero;

const versions = [
  packageJSON.version,
  packageLock.version,
  packageLock.packages?.[""]?.version,
  sourceManifest.version,
  manifest.version
];
if (versions.some(version => version !== packageJSON.version)) {
  throw new Error(`Version metadata differs: ${versions.join(", ")}`);
}
if (packageJSON.name !== "zotero-focus-columns"
  || packageJSON.private !== true
  || packageJSON.license !== "MIT") {
  throw new Error("Unexpected package identity");
}
if (zotero?.id !== "focus-columns@lllateron.github.io") {
  throw new Error("Unexpected plugin ID");
}
if (zotero.update_url !== "https://raw.githubusercontent.com/lllaterOn/zotero-focus-columns/main/updates.json") {
  throw new Error("Unexpected plugin update URL");
}
if (!Array.isArray(updateManifest.addons?.[zotero.id]?.updates)) {
  throw new Error("Missing public update manifest for the plugin ID");
}
if (manifest.homepage_url !== "https://github.com/lllaterOn/zotero-focus-columns") {
  throw new Error("Unexpected plugin homepage");
}
if (zotero.strict_min_version !== "10.0" || zotero.strict_max_version !== "10.0.*") {
  throw new Error("Unexpected Zotero compatibility range");
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
await access(join(root, "dist", `zotero-focus-columns-${packageJSON.version}.xpi`));

const stagedFiles = await walk(staging);
if (stagedFiles.some(path => path.endsWith(".map"))) {
  throw new Error("Source maps must not be included in the release package");
}

const bootstrap = await readFile(join(staging, "bootstrap.js"), "utf8");
const bundle = await readFile(join(staging, "content", "focus-columns.js"), "utf8");
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
  || !bundle.includes("FOCUS_COLUMNS_SYNC_DATA")
  || !bundle.includes("focus-columns-backups")) {
  throw new Error("Missing cross-computer synchronization support");
}
const obsoleteSyncMarkers = [
  "FOCUS_COLUMNS_SYNC_DATA_" + "V1",
  "installation" + "ID",
  "writer" + "ID"
];
if (obsoleteSyncMarkers.some(marker => bundle.includes(marker))) {
  throw new Error("The package contains obsolete synchronization identity fields");
}
if (/Zotero\.Sync\.|syncRunner|syncRunner\.js/i.test(bundle)) {
  throw new Error("The package must not invoke Zotero's private network synchronization internals");
}

const preferences = await readFile(join(staging, "content", "preferences.xhtml"), "utf8");
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
  || !/sync\.settings", false/.test(defaults)
  || !defaults.includes("extensions.zotero.lllateron.focusColumns.")) {
  throw new Error("Unexpected preference defaults");
}

const icon = await readFile(join(staging, "content", "icons", "focus-columns.svg"), "utf8");
if (!/<svg\b[^>]*viewBox=["']0 0 24 24["']/i.test(icon)
  || !/context-fill/i.test(icon)
  || /(?:<image\b|@import|(?:href|xlink:href)\s*=|data:image)/i.test(icon)) {
  throw new Error("Focus Columns icon does not satisfy the SVG resource contract");
}

const githubTokenPattern = new RegExp(
  `\\b(?:${["gh" + "p_", "gh" + "o_", "gh" + "u_", "gh" + "s_", "gh" + "r_"].join("|")}`
  + `|${"github" + "_pat_"})[A-Za-z0-9_]{20,}\\b`
);
const forbidden = [
  githubTokenPattern,
  /secretKey\s*[=:]\s*["'][a-f0-9]{20,}/i,
  new RegExp("BEGIN " + "(?:RSA |EC |OPENSSH )?" + "PRIVATE KEY")
];

for (const path of stagedFiles) {
  const content = await readFile(path, "utf8");
  if (forbidden.some(pattern => pattern.test(content))) {
    throw new Error(`Possible secret in ${relative(staging, path)}`);
  }
}

console.log(`Verified Focus Columns ${manifest.version}`);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

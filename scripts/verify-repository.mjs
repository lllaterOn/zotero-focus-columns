import { access, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const excludedDirectories = new Set([
  ".git",
  ".npm-cache",
  "build",
  "dist",
  "migration-output",
  "node_modules",
  "test"
]);

for (const required of [
  "AGENTS.md",
  "CHANGELOG.md",
  "README.md",
  "docs/ARCHITECTURE.md",
  "docs/DEVELOPMENT.md",
  "docs/MANUAL_ACCEPTANCE_1.0.0.md"
]) {
  await access(join(root, required));
}

for (const forbiddenPath of [
  ["updates" + ".json"],
  ["scripts", "migrate-style-" + "cache.mjs"]
]) {
  try {
    await access(join(root, ...forbiddenPath));
    throw new Error(`Obsolete repository file remains: ${forbiddenPath.join("/")}`);
  }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const githubTokenPattern = new RegExp(
  `\\b(?:${["gh" + "p_", "gh" + "o_", "gh" + "u_", "gh" + "s_", "gh" + "r_"].join("|")}`
  + `|${"github" + "_pat_"})[A-Za-z0-9_]{20,}\\b`
);
const secretPatterns = [
  githubTokenPattern,
  /secretKey\s*[=:]\s*["'][a-f0-9]{20,}/i,
  new RegExp("BEGIN " + "(?:RSA |EC |OPENSSH )?" + "PRIVATE KEY"),
  /(?:[A-Za-z]:\\Users\\[^\s"'<>]+|\/Users\/[^/\s"'<>]+|\/home\/[^/\s"'<>]+)/
];
const obsoleteMarkers = [
  "extensions.zotero." + "focus-columns.",
  "FOCUS_COLUMNS_SYNC_DATA_" + "V1",
  "zotero-style-" + "6.0.8-import",
  "installation" + "ID",
  "writer" + "ID"
];

const failures = [];
for (const path of await walk(root)) {
  const metadata = await stat(path);
  if (metadata.size > 2_000_000) {
    failures.push(`${relative(root, path)} exceeds the 2 MB source-file limit`);
    continue;
  }
  const buffer = await readFile(path);
  if (buffer.includes(0)) continue;
  const content = buffer.toString("utf8");
  if (secretPatterns.some(pattern => pattern.test(content))) {
    failures.push(`${relative(root, path)} may contain a credential or machine-specific path`);
  }
  if (obsoleteMarkers.some(marker => content.includes(marker))) {
    failures.push(`${relative(root, path)} contains an obsolete project identity marker`);
  }
}

if (failures.length) throw new Error(failures.join("\n"));
console.log("Verified repository hygiene");

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

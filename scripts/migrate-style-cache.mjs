import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);

function option(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const inputArg = option("--input");
const outputPath = resolve(option("--output", join(root, "migration-output", "focus-columns-publications.json")));
const reportPath = resolve(option("--report", join(root, "migration-output", "migration-report.json")));
const force = args.includes("--force");

if (!inputArg) {
  throw new Error("Usage: npm run migrate:cache -- --input <zoterostyle.json> [--output <file>] [--report <file>] [--force]");
}

const inputPath = resolve(inputArg);
if (inputPath === outputPath || inputPath === reportPath) {
  throw new Error("Input and output paths must be different");
}
if (!force) {
  for (const path of [outputPath, reportPath]) {
    try {
      await access(path, constants.F_OK);
      throw new Error(`Refusing to overwrite ${path}; pass --force to replace derived output`);
    }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

const raw = await readFile(inputPath, "utf8");
const source = JSON.parse(raw);
if (!source || typeof source !== "object" || Array.isArray(source)) {
  throw new Error("The Style cache root must be an object");
}

const normalize = value => value.trim().replace(/\s+/g, " ").normalize("NFC").toLocaleLowerCase("en-US");
const entries = {};
const stats = {
  sourceEntries: 0,
  objectRanks: 0,
  emptyStringRanks: 0,
  skippedEntries: 0,
  duplicateNormalizedNames: 0,
  outputEntries: 0
};

for (const [publication, wrapper] of Object.entries(source)) {
  stats.sourceEntries += 1;
  const key = normalize(publication);
  if (!key || !wrapper || typeof wrapper !== "object" || !("rank" in wrapper)) {
    stats.skippedEntries += 1;
    continue;
  }
  let rank;
  if (wrapper.rank && typeof wrapper.rank === "object" && !Array.isArray(wrapper.rank)) {
    rank = Object.fromEntries(Object.entries(wrapper.rank).filter(([, value]) =>
      ["string", "number", "boolean"].includes(typeof value) || value === null
    ));
    stats.objectRanks += 1;
  }
  else if (typeof wrapper.rank === "string" && !wrapper.rank.trim()) {
    rank = {};
    stats.emptyStringRanks += 1;
  }
  else {
    stats.skippedEntries += 1;
    continue;
  }
  if (entries[key]) stats.duplicateNormalizedNames += 1;
  entries[key] = {
    publication: publication.trim(),
    rank,
    source: "zotero-style-6.0.8-import",
    fetchedAt: null
  };
}

stats.outputEntries = Object.keys(entries).length;
const cache = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  entries
};
const serialized = JSON.stringify(cache, null, 2) + "\n";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const report = {
  schemaVersion: 1,
  generatedAt: cache.generatedAt,
  sourceFile: basename(inputPath),
  outputFile: basename(outputPath),
  sourceSHA256: sha256(raw),
  outputSHA256: sha256(serialized),
  stats,
  sourceModified: false,
  secretMigrated: false
};

await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(outputPath, serialized, "utf8");
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));

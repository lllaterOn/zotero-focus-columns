import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import typescript from "@rollup/plugin-typescript";
import { ZipArchive } from "archiver";
import { rollup } from "rollup";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const staging = join(root, "build", "addon");
const dist = join(root, "dist");

await rm(join(root, "build"), { recursive: true, force: true });
await rm(dist, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await mkdir(dist, { recursive: true });
await cp(join(root, "addon"), staging, { recursive: true });

const bundle = await rollup({
  input: join(root, "src", "index.ts"),
  plugins: [typescript({
    tsconfig: join(root, "tsconfig.json"),
    compilerOptions: {
      declaration: false,
      noEmit: false,
      sourceMap: false
    }
  })]
});
await bundle.write({
  file: join(staging, "content", "focus-columns.js"),
  format: "iife",
  sourcemap: false
});
await bundle.close();

const packageJSON = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const manifestPath = join(staging, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.version = packageJSON.version;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

async function filesUnder(directory) {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
}

const xpiPath = join(dist, `zotero-focus-columns-${packageJSON.version}.xpi`);
await new Promise((resolve, reject) => {
  const output = createWriteStream(xpiPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("error", reject);
  archive.pipe(output);
  void (async () => {
    for (const path of await filesUnder(staging)) {
      archive.append(await readFile(path), {
        date: new Date("2000-01-01T00:00:00.000Z"),
        mode: 0o644,
        name: relative(staging, path).replaceAll("\\", "/")
      });
    }
    await archive.finalize();
  })().catch(reject);
});

console.log(xpiPath);

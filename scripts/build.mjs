import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import typescript from "@rollup/plugin-typescript";
import archiver from "archiver";
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
      sourceMap: true
    }
  })]
});
await bundle.write({
  file: join(staging, "content", "focus-columns.js"),
  format: "iife",
  sourcemap: true
});
await bundle.close();

const packageJSON = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const manifestPath = join(staging, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.version = packageJSON.version;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

const xpiPath = join(dist, `focus-columns-${packageJSON.version}.xpi`);
await new Promise((resolve, reject) => {
  const output = createWriteStream(xpiPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("error", reject);
  archive.pipe(output);
  archive.directory(staging, false);
  archive.finalize();
});

console.log(xpiPath);

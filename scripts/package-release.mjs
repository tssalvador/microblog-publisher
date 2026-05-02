import { copyFile, mkdir, rm } from "fs/promises";
import { join } from "path";

const pluginId = "microblog-publisher";
const outputDir = join("dist", pluginId);
const releaseFiles = ["main.js", "manifest.json", "versions.json"];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const file of releaseFiles) {
  await copyFile(file, join(outputDir, file));
}

console.log(`Release files written to ${outputDir}`);

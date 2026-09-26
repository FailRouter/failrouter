// File I/O only: writes what scripts/site.js generates into public/.
//   pnpm build        regenerate index.html, exhibit pages, sitemap.xml, robots.txt
//   pnpm build --og   also re-render public/og.png and og-zh.png from scripts/og*.svg (needs rsvg-convert
//                     and a Simplified Chinese system font for og-zh)
// Generated files are committed; test/site.test.js fails when they are stale.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXHIBITS, ROOM_NAMES } from "../public/exhibits.js";
import { buildSite } from "./site.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

for (const dir of ["exhibits", "zh"]) rmSync(join(pub, dir), { recursive: true, force: true });
const files = buildSite(EXHIBITS, ROOM_NAMES);
for (const [rel, content] of Object.entries(files)) {
  mkdirSync(dirname(join(pub, rel)), { recursive: true });
  writeFileSync(join(pub, rel), content);
}
console.log(`wrote ${Object.keys(files).length} files`);

if (process.argv.includes("--og")) {
  for (const name of ["og", "og-zh"]) {
    execFileSync("rsvg-convert", ["-w", "1200", "-h", "630", join(root, `scripts/${name}.svg`), "-o", join(pub, `${name}.png`)]);
    console.log(`wrote ${name}.png`);
  }
}

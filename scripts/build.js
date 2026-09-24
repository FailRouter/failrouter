// File I/O only: writes what scripts/site.js generates into public/.
//   pnpm build        regenerate index.html, exhibit pages, sitemap.xml, robots.txt
//   pnpm build --og   also re-render public/og.png from scripts/og.svg (needs rsvg-convert)
// Generated files are committed; test/site.test.js fails when they are stale.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXHIBITS, ROOMS } from "../public/exhibits.js";
import { buildSite } from "./site.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

rmSync(join(pub, "exhibits"), { recursive: true, force: true });
const files = buildSite(EXHIBITS, ROOMS);
for (const [rel, content] of Object.entries(files)) {
  mkdirSync(dirname(join(pub, rel)), { recursive: true });
  writeFileSync(join(pub, rel), content);
}
console.log(`wrote ${Object.keys(files).length} files`);

if (process.argv.includes("--og")) {
  execFileSync("rsvg-convert", ["-w", "1200", "-h", "630", join(root, "scripts/og.svg"), "-o", join(pub, "og.png")]);
  console.log("wrote og.png");
}

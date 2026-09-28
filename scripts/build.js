// File I/O only: writes what scripts/site.js generates into public/.
//   pnpm build        regenerate index.html, exhibit pages, sitemap.xml, robots.txt
//   pnpm build --og   also re-render public/og.png and og-zh.png from scripts/og*.svg (needs rsvg-convert
//                     and a Simplified Chinese system font for og-zh)
//   pnpm build --vendor   re-bundle public/vendor/three.module.min.js from the pinned `three` devDependency,
//                         keeping only THREE_EXPORTS (public/hall.js)
//   pnpm build --posters  re-render public/posters/*.webp from the 3D hall in headless Chrome
//                         (runs scripts/viewport-run.js --posters; needs Chrome)
// Generated files are committed; test/site.test.js fails when they are stale.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXHIBITS, ROOM_NAMES } from "../public/exhibits.js";
import { THREE_EXPORTS } from "../public/hall.js";
import { buildSite } from "./site.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

for (const dir of ["exhibits", "impact", "hall", "zh"]) rmSync(join(pub, dir), { recursive: true, force: true });
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

if (process.argv.includes("--vendor")) {
  const { build } = await import("esbuild");
  const three = join(root, "node_modules/three");
  const { version } = JSON.parse(readFileSync(join(three, "package.json"), "utf8"));
  await build({
    stdin: { contents: `export { ${THREE_EXPORTS.join(", ")} } from "three";`, resolveDir: root },
    bundle: true,
    format: "esm",
    minify: true,
    legalComments: "none",
    banner: { js: `/* three.js ${version} (subset: public/hall.js THREE_EXPORTS), MIT License, see /vendor/three.LICENSE */` },
    outfile: join(pub, "vendor/three.module.min.js"),
    logLevel: "warning",
  });
  copyFileSync(join(three, "LICENSE"), join(pub, "vendor/three.LICENSE"));
  console.log(`wrote vendor/three.module.min.js (three ${version})`);
}

if (process.argv.includes("--posters")) {
  execFileSync(process.execPath, [join(root, "scripts/viewport-run.js"), "--posters"], { stdio: "inherit" });
}

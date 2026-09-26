// Pure parts of the narrow-screen check. scripts/viewport-run.js does the I/O:
// serves public/, drives headless Chrome over the DevTools protocol, feeds results to problems().

/** Phone widths every page must fit without sideways scrolling. */
export const WIDTHS = [320, 375, 430];
/** Minimum touch target height in CSS px. */
export const TARGET = 44;
/** Controls that must meet TARGET on narrow / touch screens. Inline text links are exempt (WCAG 2.5.8). */
export const TOUCH_SELECTOR = "button, .lang-switch, .walk a";
/** A path that doesn't exist, to check the 404 page too. */
export const MISSING = "/no-such-exhibit/";

/** URL paths to load: every generated HTML page plus the 404 page. */
export function pagesToCheck(files) {
  const pages = Object.keys(files)
    .filter((f) => f.endsWith(".html"))
    .map((f) => `/${f.replace(/index\.html$/, "")}`)
    .sort();
  return [...pages, MISSING];
}

/** JS expression evaluated in the page; returns { vw, sw, small: [{ h, html }] }. */
export function measureExpression(selector = TOUCH_SELECTOR, target = TARGET) {
  return `(() => {
  const small = [];
  for (const el of document.querySelectorAll(${JSON.stringify(selector)})) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height < ${target} - 0.5) small.push({ h: Math.round(r.height), html: el.outerHTML.slice(0, 80) });
  }
  return { vw: window.innerWidth, sw: document.documentElement.scrollWidth, small };
})()`;
}

/**
 * Human-readable failures from [{ path, width, vw, sw, small }]. Empty = pass.
 * Compares against the emulated device `width`, not `vw`: mobile Chrome zooms out to fit wide
 * content, so window.innerWidth grows with the overflow and would hide it.
 */
export function problems(results) {
  const out = [];
  for (const r of results) {
    const wide = Math.max(r.sw, r.vw);
    if (wide > r.width) out.push(`${r.path} @${r.width}px: page is ${wide}px wide (sideways scroll)`);
    for (const s of r.small) out.push(`${r.path} @${r.width}px: touch target ${s.h}px < ${TARGET}px: ${s.html}`);
  }
  return out;
}

const TYPES = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  xml: "application/xml",
  txt: "text/plain; charset=utf-8",
};
export const contentType = (file) => TYPES[file.split(".").pop()] ?? "application/octet-stream";

/** URL path → file under public/, the way Workers assets resolve it. null = outside public/. */
export function resolveFile(urlPath) {
  const p = decodeURIComponent(urlPath);
  if (p.split("/").includes("..")) return null;
  const rel = p.replace(/^\/+/, "");
  return rel === "" || rel.endsWith("/") ? `${rel}index.html` : rel;
}

/** First Chrome that exists: $CHROME_PATH, then the usual install locations for the platform. */
export function findChrome(platform, env, exists) {
  const dirs = (env.PATH ?? "").split(":").filter(Boolean);
  const onPath = (name) => dirs.map((d) => `${d}/${name}`);
  const candidates = [
    env.CHROME_PATH,
    ...(platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
      : []),
    ...["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].flatMap(onPath),
  ].filter(Boolean);
  return candidates.find(exists) ?? null;
}

/** Width used for review screenshots (`pnpm viewport --shots <dir>`). */
export const SHOT_WIDTH = 375;
/** Screenshot file name for a page: "/" → "home-375.png", "/zh/exhibits/a/" → "zh-exhibits-a-375.png". */
export const shotName = (path, width) => `${path.replace(/^\/|\/$/g, "").replace(/\//g, "-") || "home"}-${width}.png`;

/** Value after `--shots`, or null. */
export function shotsDir(argv) {
  const i = argv.indexOf("--shots");
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}

/** DevTools WebSocket URL from Chrome's stderr, once it has printed it. */
export const devtoolsUrl = (stderr) => stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1] ?? null;

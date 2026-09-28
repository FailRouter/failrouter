// I/O only: narrow-screen check in headless Chrome, no dependencies (Node's built-in WebSocket
// talks the DevTools protocol). Decisions live in scripts/viewport.js (unit-tested).
//   pnpm viewport                 every page at 320 / 375 / 430 px: no sideways scroll, touch targets >= 44px
//   pnpm viewport --shots <dir>   also save a 375 px full-page screenshot of every page for review
//   pnpm viewport --posters       only render public/posters/*.webp from the 3D hall (pnpm build --posters)
// The 3D hall is checked twice: as the floor-plan page, and again after pressing Enter.
//   CHROME_PATH=/path/to/chrome   if Chrome isn't in a usual place
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXHIBITS, ROOM_NAMES } from "../public/exhibits.js";
import { POSTER_HEIGHT, POSTER_WIDTHS, hallLayout, posterKeys, posterPath, walkOrder } from "../public/hall.js";
import { buildSite } from "./site.js";
import {
  HALL_ENTER,
  HALL_STATE,
  HALL_TIMEOUT_MS,
  SHOT_WIDTH,
  WIDTHS,
  chromeFlags,
  contentType,
  devtoolsUrl,
  findChrome,
  hallSettled,
  isHallPage,
  measureExpression,
  pagesToCheck,
  posterJobs,
  problems,
  resolveFile,
  shotName,
  shotsDir,
} from "./viewport.js";

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const server = createServer((req, res) => {
  const rel = resolveFile(new URL(req.url, "http://localhost").pathname);
  const file = rel && join(pub, rel);
  const found = file && existsSync(file) && statSync(file).isFile();
  res.writeHead(found ? 200 : 404, { "content-type": contentType(found ? rel : "404.html") });
  res.end(readFileSync(found ? file : join(pub, "404.html")));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const chrome = findChrome(process.platform, process.env, existsSync);
if (!chrome) {
  console.error("Chrome not found. Install Google Chrome or set CHROME_PATH.");
  process.exit(2);
}
const profile = mkdtempSync(join(tmpdir(), "failrouter-chrome-"));
const proc = spawn(chrome, [...chromeFlags(profile, Boolean(process.env.CI)), "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });

const wsUrl = await new Promise((resolve, reject) => {
  let err = "";
  proc.stderr.on("data", (d) => {
    err += d;
    const u = devtoolsUrl(err);
    if (u) resolve(u);
  });
  proc.on("exit", (code) => reject(new Error(`Chrome exited with ${code}\n${err}`)));
  setTimeout(() => reject(new Error(`Chrome did not start\n${err}`)), 20000).unref();
});

// Minimal DevTools protocol client.
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let seq = 0;
const pending = new Map();
const waiters = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
    return;
  }
  for (const w of [...waiters]) if (w.method === msg.method) w.done(msg.params);
};
const send = (method, params = {}, sessionId) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const once = (method) =>
  new Promise((resolve) => {
    const w = { method, done: (p) => (waiters.splice(waiters.indexOf(w), 1), resolve(p)) };
    waiters.push(w);
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);

const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true }, sessionId)).result.value;
const open = async (url) => {
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url: `${origin}${url}` }, sessionId);
  await loaded;
};
async function waitForHall() {
  const until = Date.now() + HALL_TIMEOUT_MS;
  let state = await evaluate(HALL_STATE);
  while (!hallSettled(state) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 250));
    state = await evaluate(HALL_STATE);
  }
  return state;
}

const paths = pagesToCheck(buildSite(EXHIBITS, ROOM_NAMES));
const expression = measureExpression();
const shots = shotsDir(process.argv);
if (shots) mkdirSync(shots, { recursive: true });
const results = [];
if (process.argv.includes("--posters")) {
  const layout = hallLayout(walkOrder(EXHIBITS, Object.keys(ROOM_NAMES.en)), Object.keys(ROOM_NAMES.en));
  await send("Emulation.setTouchEmulationEnabled", { enabled: false }, sessionId);
  mkdirSync(join(pub, "posters"), { recursive: true });
  for (const job of posterJobs(posterKeys(layout), POSTER_WIDTHS, POSTER_HEIGHT, posterPath)) {
    await send("Emulation.setDeviceMetricsOverride", { width: job.width, height: job.height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await open(job.url);
    const state = await waitForHall();
    if (state !== "ready") results.push({ path: job.url, width: job.width, error: `hall state "${state}"` });
    await new Promise((r) => setTimeout(r, 500));
    const { data } = await send("Page.captureScreenshot", { format: "webp", quality: 70 }, sessionId);
    writeFileSync(join(pub, job.file), Buffer.from(data, "base64"));
    console.log(`wrote ${job.file}`);
  }
} else {
  for (const width of WIDTHS) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: true }, sessionId);
    for (const path of paths) {
      await open(path);
      results.push({ path, width, ...(await evaluate(expression)) });
      if (shots && width === SHOT_WIDTH) {
        const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId);
        writeFileSync(join(shots, shotName(path, width)), Buffer.from(data, "base64"));
      }
      if (!isHallPage(path)) continue;
      const label = `${path} (3D)`;
      if (!(await evaluate(HALL_ENTER))) {
        results.push({ path: label, width, error: "no Enter button (is WebGL available?)" });
        continue;
      }
      const state = await waitForHall();
      if (state !== "ready") {
        results.push({ path: label, width, error: `hall state "${state}"` });
        continue;
      }
      results.push({ path: label, width, ...(await evaluate(expression)) });
      if (shots && width === SHOT_WIDTH) {
        await new Promise((r) => setTimeout(r, 300));
        const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
        writeFileSync(join(shots, shotName(path, width, "3d")), Buffer.from(data, "base64"));
      }
    }
  }
}

ws.close();
const exited = new Promise((r) => proc.once("exit", r));
proc.kill();
await exited;
server.close();
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

const found = problems(results);
if (!process.argv.includes("--posters")) console.log(`checked ${paths.length} pages at ${WIDTHS.join(" / ")} px, the 3D hall also after entering`);
for (const p of found) console.error(`  ✕ ${p}`);
if (found.length) process.exit(1);
console.log("no sideways scroll, all touch targets >= 44px");

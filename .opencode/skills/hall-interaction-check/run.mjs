// Drive the 3D hall in headless Chrome and save screenshots. See SKILL.md beside this file.
//   node run.mjs <outDir>                              interaction walk-through (floor tap, hover, drag, keys, touch)
//   node run.mjs <outDir> --shots <label> <id> [...]   one 1200x800 shot per exhibit viewpoint: <label>-<id>.png
//   node run.mjs <outDir> --back <label>               walk to the end of the hall, turn round, shot <label>-back.png
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const V = await import(join(repo, "scripts/viewport.js"));
const pub = join(repo, "public");
const out = process.argv[2];
const server = createServer((req, res) => {
  const rel = V.resolveFile(new URL(req.url, "http://x").pathname);
  const file = rel && join(pub, rel);
  const found = file && existsSync(file) && statSync(file).isFile();
  res.writeHead(found ? 200 : 404, { "content-type": V.contentType(found ? rel : "404.html") });
  res.end(readFileSync(found ? file : join(pub, "404.html")));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = mkdtempSync(join(tmpdir(), "hc-"));
const proc = spawn(V.findChrome(process.platform, process.env, existsSync), [...V.chromeFlags(profile), "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((res) => { let e = ""; proc.stderr.on("data", (d) => { e += d; const u = V.devtoolsUrl(e); if (u) res(u); }); });
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pend = new Map(); const waiters = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; } for (const w of [...waiters]) if (w.method === m.method) w.done(m.params); };
let sid;
const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params, sessionId: sid })); return new Promise((res, rej) => pend.set(id, { res, rej })); };
const once = (method) => new Promise((r) => { const w = { method, done: (p) => (waiters.splice(waiters.indexOf(w), 1), r(p)) }; waiters.push(w); });
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
sid = (await send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
await send("Page.enable");
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(out, name + ".png"), Buffer.from(data, "base64")); };
const dot = () => ev(`(() => { const d = document.querySelector('.hall-minimap .map-you') || document.querySelector('.map-you'); return [d.getAttribute('cx'), d.getAttribute('cy'), location.hash, document.getElementById('hall-caption').textContent]; })()`);
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
async function enter(hash = "") {
  const l = once("Page.loadEventFired");
  await send("Page.navigate", { url: `${origin}/hall/${hash}` });
  await l;
  await ev(V.HALL_ENTER);
  for (let i = 0; i < 180 && (await ev(V.HALL_STATE)) !== "ready"; i++) await sleep(250);
  await sleep(500);
}
const backAt = process.argv.indexOf("--back");
if (backAt > 0) {
  const label = process.argv[backAt + 1] ?? "hall";
  await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 600, deviceScaleFactor: 1, mobile: false });
  await enter("?t=back");
  // One tap near the horizon: over FADE_DISTANCE, so it fades straight to the end. A second tap would hit the empty frame.
  await mouse("mousePressed", 450, 330);
  await mouse("mouseReleased", 450, 330);
  await sleep(3500);
  console.log("at the end", await dot());
  // Hold ← for ~π / TURN_SPEED seconds to face the lobby.
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
  await sleep(1750);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
  await sleep(800);
  await shot(`${label}-back`);
  ws.close(); proc.kill(); server.close(); process.exit(0);
}
const shotsAt = process.argv.indexOf("--shots");
if (shotsAt > 0) {
  const [label, ...ids] = process.argv.slice(shotsAt + 1);
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  let n = 0;
  for (const id of ids) {
    await enter(`?t=${++n}#${id}`);
    await sleep(800);
    await shot(`${label}-${id}`);
    console.log("shot", `${label}-${id}`, await dot());
  }
  ws.close(); proc.kill(); server.close(); process.exit(0);
}
await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 600, deviceScaleFactor: 1, mobile: false });
await enter();
console.log("lobby", await dot());
await shot("1-lobby");
await mouse("mouseMoved", 450, 540, { button: "none" });
await sleep(300);
await shot("2-hover");
console.log("cursor over floor", await ev(`document.querySelector('#hall-canvas canvas').style.cursor`));
await mouse("mousePressed", 450, 540); await mouse("mouseReleased", 450, 540);
await sleep(2500);
console.log("after floor click", await dot());
await shot("3-walked");
// drag right 200px: grab = turn left
await mouse("mousePressed", 300, 300);
for (let x = 300; x <= 500; x += 20) { await mouse("mouseMoved", x, 300); await sleep(10); }
await mouse("mouseReleased", 500, 300);
await sleep(800);
await shot("4-dragged-right");
// keyboard: ArrowRight turns right
await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
await sleep(600);
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
await sleep(400);
await shot("5-key-right");
console.log("after drag+turn", await dot());
// touch: tap the floor in a room
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 780, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await enter("?t=2#room-routing");
console.log("room start", await dot());
await shot("6-room");
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 640 }] });
await shot("7a-after-start");
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await shot("7b-after-end");
await sleep(300); await shot("7c-300");
await sleep(2500);
console.log("after touch floor tap", await dot());
await shot("7-room-walked");
ws.close(); proc.kill(); server.close(); process.exit(0);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import * as V from "../scripts/viewport.js";

const css = readFileSync(new URL("../public/style.css", import.meta.url), "utf8");

describe("narrow-screen check, pure parts", () => {
  test("pagesToCheck lists every HTML page plus a missing path for the 404", () => {
    const files = { "index.html": "", "zh/index.html": "", "exhibits/a/index.html": "", "sitemap.xml": "" };
    assert.deepEqual(V.pagesToCheck(files), ["/", "/exhibits/a/", "/zh/", V.MISSING]);
  });

  test("measureExpression reports viewport, page width and small targets", () => {
    const el = (h, w = 10) => ({ getBoundingClientRect: () => ({ width: w, height: h }), outerHTML: `<button>${h}</button>` });
    const doc = {
      querySelectorAll: (sel) => {
        assert.equal(sel, V.TOUCH_SELECTOR);
        return [el(44), el(43.6), el(30), el(10, 0)];
      },
      documentElement: { scrollWidth: 400 },
    };
    const run = new Function("document", "window", `return ${V.measureExpression()}`);
    assert.deepEqual(run(doc, { innerWidth: 375 }), {
      vw: 375,
      sw: 400,
      small: [{ h: 30, html: "<button>30</button>" }],
    });
  });

  test("problems flags sideways scroll against the device width and every small target", () => {
    const ok = { path: "/", width: 375, vw: 375, sw: 375, small: [] };
    assert.deepEqual(V.problems([ok]), []);
    assert.deepEqual(V.problems([{ ...ok, sw: 380 }]), ["/ @375px: page is 380px wide (sideways scroll)"]);
    // Mobile Chrome zooms out to fit: innerWidth grows with the overflow.
    assert.deepEqual(V.problems([{ ...ok, vw: 540, sw: 540 }]), ["/ @375px: page is 540px wide (sideways scroll)"]);
    assert.deepEqual(V.problems([{ ...ok, small: [{ h: 30, html: "<a>" }] }]), ["/ @375px: touch target 30px < 44px: <a>"]);
  });

  test("resolveFile maps URLs to public/ files like Workers assets, and refuses to leave public/", () => {
    assert.equal(V.resolveFile("/"), "index.html");
    assert.equal(V.resolveFile("/zh/exhibits/a/"), "zh/exhibits/a/index.html");
    assert.equal(V.resolveFile("/style.css"), "style.css");
    assert.equal(V.resolveFile("/%2e%2e/secret"), null);
    assert.equal(V.resolveFile("/a/../b"), null);
  });

  test("contentType knows the site's file types", () => {
    assert.equal(V.contentType("index.html"), "text/html; charset=utf-8");
    assert.equal(V.contentType("og.png"), "image/png");
    assert.equal(V.contentType("posters/lobby-480.webp"), "image/webp");
    assert.equal(V.contentType("x.bin"), "application/octet-stream");
  });

  test("findChrome prefers CHROME_PATH, then platform locations, then PATH", () => {
    const has = (...paths) => (p) => paths.includes(p);
    assert.equal(V.findChrome("linux", { CHROME_PATH: "/c", PATH: "/usr/bin" }, has("/c", "/usr/bin/google-chrome")), "/c");
    const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    assert.equal(V.findChrome("darwin", {}, has(mac)), mac);
    assert.equal(V.findChrome("linux", { PATH: "/a:/usr/bin" }, has("/usr/bin/chromium")), "/usr/bin/chromium");
    assert.equal(V.findChrome("linux", {}, has()), null);
  });

  test("the 3D hall is re-checked after entering; the helpers that drive it", () => {
    assert.equal(V.isHallPage("/hall/"), true);
    assert.equal(V.isHallPage("/zh/hall/"), true);
    assert.equal(V.isHallPage("/exhibits/hall/"), true);
    assert.equal(V.isHallPage("/"), false);
    assert.equal(V.isHallPage("/hallway/"), false);
    assert.deepEqual(["ready", "failed", "off", "loading", ""].map(V.hallSettled), [true, true, true, false, false]);
    const click = (b) => new Function("document", `return ${V.HALL_ENTER}`)({ getElementById: () => b });
    let clicked = 0;
    assert.equal(click({ hidden: false, click: () => clicked++ }), true);
    assert.equal(clicked, 1);
    assert.equal(click({ hidden: true }), false);
    assert.equal(click(null), false);
    const state = (hall) => new Function("document", `return ${V.HALL_STATE}`)({ documentElement: { dataset: { hall } } });
    assert.equal(state("ready"), "ready");
    assert.equal(state(undefined), "");
  });

  test("problems reports a hall that never became ready", () => {
    assert.deepEqual(V.problems([{ path: "/hall/ (3D)", width: 320, error: 'hall state "loading"' }]), ['/hall/ (3D) @320px: hall state "loading"']);
  });

  test("chromeFlags renders WebGL in software and adds --no-sandbox only in CI", () => {
    const local = V.chromeFlags("/tmp/p");
    assert.ok(local.includes("--user-data-dir=/tmp/p"));
    assert.ok(local.includes("--enable-unsafe-swiftshader"));
    assert.ok(!local.includes("--no-sandbox"));
    assert.ok(V.chromeFlags("/tmp/p", true).includes("--no-sandbox"));
  });

  test("posterJobs: one screenshot per key and width", () => {
    const jobs = V.posterJobs(["lobby", "time"], [480, 960], (w) => w / 2, (k, w) => `/posters/${k}-${w}.webp`);
    assert.equal(jobs.length, 4);
    assert.deepEqual(jobs[1], { key: "lobby", width: 960, height: 480, url: "/hall/?poster=lobby", file: "posters/lobby-960.webp" });
  });

  test("shotName and shotsDir", () => {
    assert.equal(V.shotName("/zh/hall/", 375, "3d"), "zh-hall-3d-375.png");
    assert.equal(V.shotName("/", 375), "home-375.png");
    assert.equal(V.shotName("/zh/exhibits/a/", 375), "zh-exhibits-a-375.png");
    assert.equal(V.shotName(V.MISSING, 320), "no-such-exhibit-320.png");
    assert.equal(V.shotsDir(["node", "x", "--shots", "out"]), "out");
    assert.equal(V.shotsDir(["node", "x", "--shots"]), null);
    assert.equal(V.shotsDir(["node", "x"]), null);
  });
  test("devtoolsUrl reads the WebSocket URL from Chrome's stderr", () => {
    assert.equal(V.devtoolsUrl("x\nDevTools listening on ws://127.0.0.1:1/devtools/browser/abc\n"), "ws://127.0.0.1:1/devtools/browser/abc");
    assert.equal(V.devtoolsUrl("starting"), null);
  });
});

describe("style.css narrow-screen rules", () => {
  test("only the two agreed breakpoints are used", () => {
    const queries = [...css.matchAll(/@media\s*([^{]+)\{/g)].map((m) => m[1].trim()).sort();
    assert.deepEqual(queries, ["(max-width: 480px)", "(max-width: 480px), (hover: none)", "(prefers-reduced-motion: reduce)"]);
  });
  test("touch sizing covers every control the viewport check measures", () => {
    const block = css.match(/@media \(max-width: 480px\), \(hover: none\) \{([\s\S]*?)\n\}/)[1];
    for (const sel of V.TOUCH_SELECTOR.split(",").map((s) => s.trim())) {
      const name = sel === "button" ? ".rooms button" : sel;
      if (sel === "button") assert.ok(block.includes(".hall-stage button") && block.includes(".hall-enter"), "3D hall buttons");
      if (sel === ".map-room") continue; // sized by its 56-unit hit area in the SVG, noted in the block

      assert.ok(block.includes(name), `${name} missing from touch sizing`);
    }
    assert.match(block, /min-height: 44px/);
    assert.match(block, /\.keys-hint \{ display: none; \}/);
  });
  test("no web fonts, and Chinese falls back to system fonts", () => {
    assert.ok(!/@font-face|@import|fonts\.googleapis/.test(css));
    assert.match(css, /--serif-zh:[^;]*"Songti SC"/);
    assert.match(css, /:lang\(zh\)/);
  });
  test("the bare :lang(zh) rule only swaps the variable (setting font-family there overrode the mono trace)", () => {
    const bare = css.match(/^:lang\(zh\) \{([^}]*)\}/m)[1];
    assert.ok(!/font-family|font:/.test(bare), bare);
  });
});

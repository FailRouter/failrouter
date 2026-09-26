import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { EXHIBITS, ROOMS } from "../public/exhibits.js";
import * as M from "../public/museum.js";

const ROOMS2 = { a: "Room A", b: "Room <B>" };
const ex = (id, room, extra = {}) => ({
  id,
  room,
  title: `T ${id}`,
  date: "2020-01-02",
  duration: "1 hour",
  hops: ["one", "two", "three"],
  lesson: "L",
  source: "S",
  ...extra,
});
const LIST = [ex("x1", "a"), ex("x2", "b"), ex("x3", "a")];

describe("esc", () => {
  test("escapes all five HTML-significant characters", () => {
    assert.equal(M.esc(`<a href="x">Tom & Jerry's</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
  });
  test("coerces non-strings", () => {
    assert.equal(M.esc(42), "42");
  });
});

describe("trace", () => {
  test("timeouts wait longer than normal hops", () => {
    assert.equal(M.traceDelay(" 4  * * *"), 700);
    assert.equal(M.traceDelay(" 1  home-router"), 350);
  });
  test("ends at the museum", () => {
    assert.match(M.TRACE.at(-1), /arrived/);
  });
});

describe("rooms", () => {
  test("visibleIn filters by room, 'all' returns everything", () => {
    assert.equal(M.visibleIn(LIST, M.ALL), LIST);
    assert.deepEqual(
      M.visibleIn(LIST, "a").map((e) => e.id),
      ["x1", "x3"],
    );
    assert.deepEqual(M.visibleIn(LIST, "nope"), []);
  });
  test("roomButtons counts exhibits and lists empty rooms with 0", () => {
    assert.deepEqual(M.roomButtons(LIST, { ...ROOMS2, c: "Empty" }), [
      ["all", "All rooms", 3],
      ["a", "Room A", 2],
      ["b", "Room <B>", 1],
      ["c", "Empty", 0],
    ]);
  });
  test("roomButtons labels the 'all' button in the page language", () => {
    assert.deepEqual(M.roomButtons(LIST, ROOMS2, "zh")[0], ["all", "全部展厅", 3]);
  });
  test("roomsHtml marks only the current room pressed and escapes labels", () => {
    const html = M.roomsHtml(LIST, ROOMS2, "b");
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
    assert.match(html, /data-room="b" aria-pressed="true">Room &lt;B&gt; <span>1<\/span>/);
    assert.match(html, /data-room="all" aria-pressed="false">All rooms <span>3<\/span>/);
  });
});

describe("exhibit cards", () => {
  test("last hop is marked failed, others are not", () => {
    const html = M.exhibitHtml(ex("x1", "a"), { no: 7, i: 0, rooms: ROOMS2 });
    assert.equal((html.match(/class="fail"/g) ?? []).length, 1);
    assert.match(html, /three <b class="x" aria-label="failed">✕<\/b><\/li><\/ol>/);
    assert.match(html, /No\. 007 · Room A/);
    assert.match(html, /id="x1"/);
    assert.match(html, /<h2><a href="\/exhibits\/x1\/">T x1<\/a><\/h2>/);
    assert.match(html, /class="exhibit"/);
  });
  test("page mode renders a lit card with an h1 and no self-link", () => {
    const html = M.exhibitHtml(ex("x1", "a"), { no: 1, i: 0, rooms: ROOMS2, page: true });
    assert.match(html, /class="exhibit lit"/);
    assert.match(html, /<h1>T x1<\/h1>/);
    assert.ok(!html.includes("<h2"));
    assert.ok(!html.includes('href="/exhibits/x1/"'));
  });
  test("exhibitPath is the trailing-slash directory URL, prefixed for Chinese", () => {
    assert.equal(M.exhibitPath("abc"), "/exhibits/abc/");
    assert.equal(M.exhibitPath("abc", "zh"), "/zh/exhibits/abc/");
  });
  test("Chinese cards use Chinese labels, Chinese links, and mark the English source", () => {
    const html = M.exhibitHtml(ex("x1", "a"), { no: 7, i: 0, rooms: ROOMS2, lang: "zh" });
    assert.match(html, /展品 007 · Room A/);
    assert.match(html, /aria-label="失败"/);
    assert.match(html, /href="\/zh\/exhibits\/x1\/"/);
    assert.match(html, /<p class="source">来源：<span lang="en">S<\/span><\/p>/);
    assert.match(M.galleryHtml(LIST, ROOMS2, M.ALL, "zh"), /展品 003/);
  });
  test("user-visible fields are escaped", () => {
    const html = M.exhibitHtml(ex("x9", "b", { title: "<script>", hops: ["a", "b", "<c>"] }), {
      no: 1,
      i: 2,
      rooms: ROOMS2,
    });
    assert.ok(!html.includes("<script>"));
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /Room &lt;B&gt;/);
    assert.match(html, /--i:2/);
  });
  test("galleryHtml keeps catalogue numbers stable across room filters", () => {
    const html = M.galleryHtml(LIST, ROOMS2, "a");
    assert.match(html, /No\. 001/);
    assert.match(html, /No\. 003/);
    assert.ok(!html.includes('id="x2"'));
    assert.match(html, /--i:1/);
  });
  test("renders the real collection with one card per exhibit", () => {
    const html = M.galleryHtml(EXHIBITS, ROOMS, M.ALL);
    assert.equal((html.match(/<article /g) ?? []).length, EXHIBITS.length);
  });
});

describe("navigation", () => {
  test("wrongTurnId never returns the current exhibit when there is a choice", () => {
    for (const r of [0, 0.5, 0.999]) assert.notEqual(M.wrongTurnId(LIST, "x2", r), "x2");
    assert.equal(M.wrongTurnId(LIST, "x1", 0), "x2");
    assert.equal(M.wrongTurnId(LIST, "x1", 0.999), "x3");
  });
  test("wrongTurnId with one exhibit returns it; with none returns null", () => {
    assert.equal(M.wrongTurnId([LIST[0]], "x1", 0.5), "x1");
    assert.equal(M.wrongTurnId([], "x1", 0.5), null);
  });
  test("stepId walks j/k and clamps at both ends", () => {
    assert.equal(M.stepId(LIST, "x1", "j"), "x2");
    assert.equal(M.stepId(LIST, "x3", "j"), "x3");
    assert.equal(M.stepId(LIST, "x2", "k"), "x1");
    assert.equal(M.stepId(LIST, "x1", "k"), "x1");
  });
  test("stepId from no current exhibit starts at the first", () => {
    assert.equal(M.stepId(LIST, "", "j"), "x1");
    assert.equal(M.stepId(LIST, "", "k"), "x1");
  });
  test("stepId ignores other keys and empty lists", () => {
    assert.equal(M.stepId(LIST, "x1", "q"), null);
    assert.equal(M.stepId([], "x1", "j"), null);
  });
  test("isMuseumKey rejects modifiers and form fields", () => {
    const t = (tagName) => ({ tagName });
    assert.equal(M.isMuseumKey({ target: t("BODY") }), true);
    assert.equal(M.isMuseumKey({ target: undefined }), true);
    for (const mod of ["metaKey", "ctrlKey", "altKey"]) {
      assert.equal(M.isMuseumKey({ [mod]: true, target: t("BODY") }), false);
    }
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) assert.equal(M.isMuseumKey({ target: t(tag) }), false);
  });
});

test("app.js only imports names that museum.js exports", () => {
  const src = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const block = src.match(/import\s*\{([^}]+)\}\s*from\s*"\.\/museum\.js"/);
  assert.ok(block, "app.js must import from ./museum.js");
  for (const name of block[1].split(",").map((s) => s.trim()).filter(Boolean)) {
    assert.ok(name in M, `museum.js does not export ${name}`);
  }
});

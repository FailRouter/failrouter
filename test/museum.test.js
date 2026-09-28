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
  impact: { reach: 5, duration: 5, loss: 5, recovery: 5, cascade: 5 },
  ...extra,
});
const LIST = [ex("x1", "a"), ex("x2", "b"), ex("x3", "a")];
const imp = (reach, duration, loss, recovery, cascade) => ({ impact: { reach, duration, loss, recovery, cascade } });
// Dates and scores chosen so every sort order differs, with one impact tie (b, c) and one date tie (c, d).
const SORTABLE = [
  ex("a", "a", { date: "2001-01-01", ...imp(10, 10, 10, 10, 10) }),
  ex("b", "a", { date: "2010-01-01", ...imp(4, 4, 4, 4, 4) }),
  ex("c", "b", { date: "2020-01-01", ...imp(2, 4, 6, 4, 4) }),
  ex("d", "b", { date: "2020-01-01", ...imp(0, 0, 0, 0, 1) }),
];
const ids = (list) => list.map((e) => e.id);

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

describe("impact and sorting", () => {
  test("impactScore is the plain average of the five scores, one decimal place", () => {
    assert.equal(M.impactScore(SORTABLE[0]), 10);
    assert.equal(M.impactScore(SORTABLE[2]), 4);
    assert.equal(M.impactScore(SORTABLE[3]), 0.2);
    assert.equal(M.impactScore(ex("z", "a", imp(8, 6, 0, 8, 2))), 4.8);
  });
  test("every real exhibit scores within 0-10", () => {
    for (const e of EXHIBITS) assert.ok(M.impactScore(e) >= 0 && M.impactScore(e) <= 10, e.id);
  });
  test("default order is newest first; ties fall back to id", () => {
    assert.equal(M.DEFAULT_SORT, "date-desc");
    assert.equal(Object.keys(M.SORTS)[0], M.DEFAULT_SORT);
    assert.deepEqual(ids(M.sortExhibits(SORTABLE)), ["c", "d", "b", "a"]);
  });
  test("each sort order, with deterministic tie-breaks", () => {
    assert.deepEqual(ids(M.sortExhibits(SORTABLE, "date-asc")), ["a", "b", "c", "d"]);
    assert.deepEqual(ids(M.sortExhibits(SORTABLE, "impact-desc")), ["a", "c", "b", "d"]);
    assert.deepEqual(ids(M.sortExhibits(SORTABLE, "impact-asc")), ["d", "c", "b", "a"]);
  });
  test("sortExhibits returns a copy and ignores unknown keys", () => {
    const copy = M.sortExhibits(SORTABLE, "nope");
    assert.notEqual(copy, SORTABLE);
    assert.deepEqual(ids(copy), ["c", "d", "b", "a"]);
    assert.deepEqual(ids(SORTABLE), ["a", "b", "c", "d"]);
  });
  test("parseSort accepts known keys only", () => {
    for (const k of Object.keys(M.SORTS)) assert.equal(M.parseSort(k), k);
    for (const v of ["", undefined, "toString", "impact"]) assert.equal(M.parseSort(v), M.DEFAULT_SORT);
  });
  test("viewList filters by room, then sorts", () => {
    assert.deepEqual(ids(M.viewList(SORTABLE, "b", "impact-desc")), ["c", "d"]);
    assert.deepEqual(ids(M.viewList(SORTABLE, M.ALL, "date-asc")), ["a", "b", "c", "d"]);
  });
  test("sortOptionsHtml lists every order in the page language and selects the current one", () => {
    const html = M.sortOptionsHtml("impact-asc", "zh");
    assert.equal((html.match(/<option /g) ?? []).length, 4);
    assert.equal((html.match(/ selected/g) ?? []).length, 1);
    assert.match(html, /<option value="impact-asc" selected>影响，低到高<\/option>/);
    assert.match(M.sortOptionsHtml("date-desc"), /^<option value="date-desc" selected>Date, newest first<\/option>/);
  });
  test("impactHtml fills dots in proportion and states the number as text", () => {
    assert.equal(
      M.impactHtml(ex("z", "a", imp(8, 6, 0, 8, 2))),
      '<p class="impact"><span class="pips" aria-hidden="true" style="--v:48.6%"></span>Impact 4.8/10</p>',
    );
    assert.match(M.impactHtml(SORTABLE[0], "zh"), /--v:100%.*影响 10\.0\/10/);
    assert.match(M.impactHtml(ex("z", "a", imp(5, 5, 5, 5, 5))), /--v:50%.*Impact 5\.0\/10/);
  });
  test("pipsFill: half a dot is exactly half of a dot, whole numbers end in a gap, 0 and 10 are empty and full", () => {
    assert.equal(M.pipsFill(0), 0);
    assert.equal(M.pipsFill(10), 100);
    assert.equal(M.pipsFill(4), 40); // 2 dots: the gap after dot 2 starts at 28 of 70 px
    assert.equal(M.pipsFill(5), 50); // 2.5 dots: 28 + 2 + 5 = 35 of 70 px, the middle of dot 3
    assert.equal(M.pipsFill(1), 10); // 0.5 dots: 2 + 5 = 7 px
    assert.equal(M.pipsFill(7.6), 74.3); // 3.8 dots: 42 + 2 + 8 = 52 px
  });
  test("galleryHtml renders in the requested order, catalogue numbers unchanged", () => {
    const html = M.galleryHtml(SORTABLE, ROOMS2, M.ALL, "en", "impact-desc");
    assert.deepEqual([...html.matchAll(/id="(\w)"/g)].map((m) => m[1]), ["a", "c", "b", "d"]);
    assert.match(html, /No\. 003 · Room &lt;B&gt;/);
    assert.ok(html.indexOf("No. 001") < html.indexOf("No. 003"));
    assert.ok(html.indexOf("No. 003") < html.indexOf("No. 002"));
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
    const html = M.galleryHtml(LIST, ROOMS2, "a", "en", "date-asc");
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

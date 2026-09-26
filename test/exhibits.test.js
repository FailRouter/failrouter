import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { EXHIBITS, ROOM_NAMES, ROOMS, ROOMS_ZH } from "../public/exhibits.js";

test("every exhibit has the required fields", () => {
  for (const e of EXHIBITS) {
    for (const k of ["id", "subject", "added", "title", "room", "date", "duration", "lesson", "source"]) {
      assert.equal(typeof e[k], "string", `${e.id}: ${k}`);
      assert.ok(e[k].length > 0, `${e.id}: empty ${k}`);
    }
    assert.ok(Array.isArray(e.hops) && e.hops.length >= 3, `${e.id}: needs >= 3 hops`);
  }
});

test("ids are unique, url-safe, and dates are valid ISO dates", () => {
  const ids = new Set();
  for (const e of EXHIBITS) {
    assert.match(e.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    for (const k of ["date", "added"]) {
      assert.match(e[k], /^\d{4}-\d{2}-\d{2}$/, `${e.id}: ${k}`);
      assert.ok(!Number.isNaN(Date.parse(e[k])), `${e.id}: bad ${k}`);
    }
    assert.ok(e.added >= e.date, `${e.id}: added before the event`);
  }
});

test("every exhibit belongs to a known room and every room has an exhibit", () => {
  for (const e of EXHIBITS) assert.ok(e.room in ROOMS, `${e.id}: unknown room ${e.room}`);
  for (const r of Object.keys(ROOMS)) assert.ok(EXHIBITS.some((e) => e.room === r), `empty room ${r}`);
});

test("index.html references the assets that exist", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  for (const f of ["/style.css", "/app.js", "/favicon.svg"]) {
    assert.ok(html.includes(f), `index.html missing ${f}`);
    readFileSync(new URL(`../public${f}`, import.meta.url));
  }
  assert.match(html, /<link rel="canonical" href="https:\/\/failrouter\.com\/">/);
});

test("every exhibit has a complete Simplified Chinese version with the same number of hops", () => {
  const CJK = /[\u4e00-\u9fff]/;
  for (const e of EXHIBITS) {
    assert.equal(typeof e.zh, "object", `${e.id}: missing zh`);
    for (const k of ["subject", "title", "duration", "lesson"]) {
      assert.equal(typeof e.zh[k], "string", `${e.id}: zh.${k}`);
      assert.ok(e.zh[k].length > 0, `${e.id}: empty zh.${k}`);
    }
    assert.equal(e.zh.hops?.length, e.hops.length, `${e.id}: zh.hops must match hops one to one`);
    // Titles may be a proper name ("Channel File 291"); the rest must actually be Chinese.
    for (const s of [e.zh.subject, e.zh.duration, e.zh.lesson, ...e.zh.hops]) assert.match(s, CJK, `${e.id}: "${s}"`);
    assert.deepEqual(Object.keys(e.zh).sort(), ["duration", "hops", "lesson", "subject", "title"], `${e.id}: zh keys`);
  }
});

test("Chinese room names cover exactly the same rooms", () => {
  assert.deepEqual(Object.keys(ROOMS_ZH).sort(), Object.keys(ROOMS).sort());
  assert.deepEqual(ROOM_NAMES, { en: ROOMS, zh: ROOMS_ZH });
});

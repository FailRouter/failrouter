import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { EXHIBITS, ROOMS, ROOMS_ZH } from "../public/exhibits.js";
import * as I from "../public/i18n.js";

const CJK = /[\u4e00-\u9fff]/;
// Every string a visitor reads, per language.
const zhTexts = () => [
  ...Object.values(I.STRINGS.zh),
  ...Object.values(ROOMS_ZH),
  ...EXHIBITS.flatMap((e) => [e.zh.subject, e.zh.title, e.zh.duration, e.zh.lesson, ...e.zh.hops]),
];
const enTexts = () => [
  ...Object.values(I.STRINGS.en),
  ...Object.values(ROOMS),
  ...EXHIBITS.flatMap((e) => [e.subject, e.title, e.duration, e.lesson, e.source, ...e.hops]),
];
const plain = (s) => s.replace(/<[^>]+>/g, "");

describe("dictionaries", () => {
  test("en and zh have exactly the same keys", () => {
    assert.deepEqual(Object.keys(I.STRINGS.zh).sort(), Object.keys(I.STRINGS.en).sort());
  });
  test("every language has a locale entry and a dictionary", () => {
    assert.deepEqual(Object.keys(I.LOCALES).sort(), [...I.LANGS].sort());
    assert.deepEqual(Object.keys(I.STRINGS).sort(), [...I.LANGS].sort());
  });
  test("placeholders match between languages", () => {
    const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(I.STRINGS.en)) assert.deepEqual(names(I.STRINGS.zh[k]), names(I.STRINGS.en[k]), k);
  });
  test("every zh value is Chinese text or Chinese punctuation, never a leftover English string", () => {
    for (const [k, v] of Object.entries(I.STRINGS.zh)) assert.match(v, /[\u3000-\u9fff\uff00-\uffef]/, `zh.${k}`);
  });
});

describe("copy rules", () => {
  test("no exclamation marks in either language", () => {
    for (const s of [...enTexts(), ...zhTexts()]) assert.ok(!/[!！]/.test(plain(s)), s);
  });
  test("Chinese uses full-width punctuation next to Chinese characters", () => {
    for (const s of zhTexts().map(plain)) {
      assert.ok(!/[\u4e00-\u9fff][,;:?()]|[,;:?()][\u4e00-\u9fff]/.test(s), `half-width punctuation: ${s}`);
    }
  });
  test("Chinese puts a space between Chinese and Latin letters or digits", () => {
    for (const s of zhTexts().map(plain)) {
      assert.ok(!/[\u4e00-\u9fff][A-Za-z0-9]|[A-Za-z0-9][\u4e00-\u9fff]/.test(s), `missing space: ${s}`);
    }
  });
  test("Chinese uses corner brackets, not curly quotes", () => {
    for (const s of zhTexts()) assert.ok(!/[“”‘’"]/.test(s), s);
  });
});

describe("helpers", () => {
  test("fmt fills placeholders and leaves unknown ones visible", () => {
    assert.equal(I.fmt("{a} and {b}", { a: 1, b: "x" }), "1 and x");
    assert.equal(I.fmt("{a} {missing}", { a: 0 }), "0 {missing}");
  });
  test("langOf reads <html lang>", () => {
    assert.equal(I.langOf("zh-Hans"), "zh");
    assert.equal(I.langOf("zh"), "zh");
    assert.equal(I.langOf("en"), "en");
    assert.equal(I.langOf(""), "en");
    assert.equal(I.langOf(undefined), "en");
    assert.equal(I.langOf("zhx"), "en");
  });
  test("otherLang and localePath", () => {
    assert.equal(I.otherLang("en"), "zh");
    assert.equal(I.otherLang("zh"), "en");
    assert.equal(I.localePath("en", "/exhibits/a/"), "/exhibits/a/");
    assert.equal(I.localePath("zh", "/"), "/zh/");
  });
  test("switchHref keeps the path and swaps the anchor", () => {
    assert.equal(I.switchHref("/zh/", "gitlab-2017"), "/zh/#gitlab-2017");
    assert.equal(I.switchHref("/zh/#old", "new"), "/zh/#new");
    assert.equal(I.switchHref("/#old", ""), "/");
  });
  test("localizeExhibits overlays the zh fields and keeps ids, dates and sources", () => {
    assert.equal(I.localizeExhibits(EXHIBITS, "en"), EXHIBITS);
    const zh = I.localizeExhibits(EXHIBITS, "zh");
    for (const [i, e] of zh.entries()) {
      assert.equal(e.title, EXHIBITS[i].zh.title);
      assert.deepEqual(e.hops, EXHIBITS[i].zh.hops);
      for (const k of ["id", "date", "added", "room", "source"]) assert.equal(e[k], EXHIBITS[i][k]);
    }
  });
  test("weightedLength counts CJK and full-width punctuation double", () => {
    assert.equal(I.weightedLength("abc"), 3);
    assert.equal(I.weightedLength("失败"), 4);
    assert.equal(I.weightedLength("a，b"), 4);
    assert.equal(I.charWeight("…"), 1);
  });
});

test("app.js only imports names that i18n.js exports", () => {
  const src = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const block = src.match(/import\s*\{([^}]+)\}\s*from\s*"\.\/i18n\.js"/);
  assert.ok(block, "app.js must import from ./i18n.js");
  for (const name of block[1].split(",").map((s) => s.trim()).filter(Boolean)) {
    assert.ok(name in I, `i18n.js does not export ${name}`);
  }
});

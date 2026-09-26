import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, test } from "node:test";
import { gzipSync } from "node:zlib";
import { EXHIBITS, ROOM_NAMES } from "../public/exhibits.js";
import { LOCALES, STRINGS, localizeExhibits, weightedLength } from "../public/i18n.js";
import * as S from "../scripts/site.js";

const pub = (rel) => new URL(`../public/${rel}`, import.meta.url);
const read = (rel) => readFileSync(pub(rel), "utf8");
const FILES = S.buildSite(EXHIBITS, ROOM_NAMES);
const HTML_PAGES = Object.keys(FILES).filter((f) => f.endsWith(".html"));
// Lengths are measured on the text a user sees, not on HTML entities.
const unesc = (s) =>
  s?.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e]);
const pathOf = (file) => `/${file.replace(/index\.html$/, "")}`;
const langOfFile = (file) => (file.startsWith("zh/") ? "zh" : "en");
const neutral = (file) => pathOf(file).replace(/^\/zh\//, "/");
const CJK = /[\u4e00-\u9fff]/g;
const alternatesIn = (html) =>
  Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]));

const ex = (id, extra = {}) => ({
  id,
  subject: `Thing outage, 2020`,
  added: "2026-01-02",
  title: `Title ${id}`,
  room: "a",
  date: "2020-01-01",
  duration: "an hour",
  hops: ["Start here.", "Middle", "Everything falls over."],
  lesson: "Learn it.",
  source: "Report",
  zh: { subject: "某事故（2020 年）", title: `标题 ${id}`, duration: "一小时", hops: ["从这里开始。", "中间", "全部倒下。"], lesson: "记住。" },
  ...extra,
});

describe("generated files are committed and current", () => {
  test("every generated file matches public/ (run `pnpm build` if this fails)", () => {
    for (const [rel, content] of Object.entries(FILES)) {
      assert.ok(existsSync(pub(rel)), `missing public/${rel}`);
      assert.equal(read(rel), content, `public/${rel} is stale`);
    }
  });
  test("no stale exhibit pages for removed exhibits, in either language", () => {
    for (const dir of ["exhibits", "zh/exhibits"]) {
      assert.deepEqual(readdirSync(pub(dir)).sort(), EXHIBITS.map((e) => e.id).sort(), dir);
    }
  });
  test("share images exist and are 1200x630 PNG", () => {
    for (const lang of ["en", "zh"]) {
      const png = readFileSync(pub(LOCALES[lang].ogImage.slice(1)));
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      assert.equal(png.readUInt32BE(16), 1200);
      assert.equal(png.readUInt32BE(20), 630);
    }
  });
  test("both languages have the same set of pages", () => {
    const en = HTML_PAGES.filter((f) => langOfFile(f) === "en").map(neutral).sort();
    const zh = HTML_PAGES.filter((f) => langOfFile(f) === "zh").map(neutral).sort();
    assert.deepEqual(zh, en);
    assert.equal(en.length, EXHIBITS.length + 1);
  });
});

describe("SEO gate on every indexable page", () => {
  for (const file of HTML_PAGES) {
    test(file, () => {
      const html = FILES[file];
      const lang = langOfFile(file);
      const loc = LOCALES[lang];
      const self = `${S.SITE.origin}${pathOf(file)}`;
      const title = unesc(html.match(/<title>([^<]*)<\/title>/)?.[1]);
      const desc = unesc(html.match(/<meta name="description" content="([^"]*)">/)?.[1]);
      assert.ok(title && weightedLength(title) <= S.LIMITS.title, `title "${title}"`);
      const dl = weightedLength(desc ?? "");
      assert.ok(dl >= S.LIMITS.descriptionMin && dl <= S.LIMITS.description, `description ${dl}: ${desc}`);
      assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, "exactly one h1");
      assert.ok(html.includes(`<link rel="canonical" href="${self}">`), "canonical");
      assert.ok(html.includes(`<meta property="og:url" content="${self}">`), "og:url");
      assert.ok(html.includes(`<meta property="og:image" content="${S.SITE.origin}${loc.ogImage}">`), "og:image");
      assert.ok(html.includes(`<meta property="og:locale" content="${loc.og}">`), "og:locale");
      assert.match(html, /<meta property="og:locale:alternate" content="[a-z]{2}_[A-Z]{2}">/);
      assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
      assert.ok(html.includes(`<html lang="${loc.html}">`), "html lang matches the path");
      assert.ok(!/noindex/.test(html), "indexable pages must not be noindex");
      assert.ok(html.includes(S.SITE.repo), "links the GitHub repo");
      for (const [tag] of html.matchAll(/<script\b[^>]*\bsrc=[^>]*>/g)) {
        assert.match(tag, /type="module"|\bdefer\b|\basync\b/, `render-blocking ${tag}`);
      }
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
      assert.ok(blocks.length >= 2, "JSON-LD blocks");
      for (const b of blocks) assert.equal(b["@context"], "https://schema.org");
      const main = blocks.find((b) => b["@type"] !== "BreadcrumbList");
      assert.equal(main.inLanguage, loc.html, "JSON-LD inLanguage");
    });
  }

  test("hreflang: every page lists en + zh-Hans + x-default, and each pair points at each other", () => {
    for (const file of HTML_PAGES) {
      const alt = alternatesIn(FILES[file]);
      const p = neutral(file);
      assert.deepEqual(alt, {
        en: `${S.SITE.origin}${p}`,
        "zh-Hans": `${S.SITE.origin}/zh${p}`,
        "x-default": `${S.SITE.origin}${p}`,
      }, file);
      const twin = langOfFile(file) === "en" ? `zh${pathOf(file)}index.html` : `${p.slice(1)}index.html`;
      assert.deepEqual(alternatesIn(FILES[twin]), alt, `${file} ↔ ${twin}`);
    }
  });

  test("every page links to its twin in the other language", () => {
    for (const file of HTML_PAGES) {
      const p = neutral(file);
      const target = langOfFile(file) === "en" ? `/zh${p}` : p;
      assert.match(FILES[file], new RegExp(`<a class="lang-switch" id="lang-switch" href="${target}" hreflang="[^"]+" lang="[^"]+">`), file);
    }
  });

  test("Chinese pages are translated, not copies of the English page", () => {
    for (const file of HTML_PAGES.filter((f) => langOfFile(f) === "zh")) {
      const main = FILES[file].match(/<main[\s\S]*<\/main>/)[0];
      assert.ok((main.match(CJK) ?? []).length >= 60, `${file}: too little Chinese in <main>`);
      assert.ok(!main.includes(">Source: "), `${file}: English label left in`);
    }
  });

  test("home pages carry WebSite + CollectionPage listing every exhibit, prerendered", () => {
    for (const lang of ["en", "zh"]) {
      const file = lang === "en" ? "index.html" : "zh/index.html";
      const html = FILES[file];
      const prefix = lang === "en" ? "" : "/zh";
      const types = [...html.matchAll(/"@type":"(WebSite|CollectionPage)"/g)].map((m) => m[1]);
      assert.deepEqual([...new Set(types)].sort(), ["CollectionPage", "WebSite"]);
      for (const e of localizeExhibits(EXHIBITS, lang)) {
        assert.ok(html.includes(`href="${prefix}/exhibits/${e.id}/"`), `${file} links ${e.id}`);
        assert.ok(html.includes(`id="${e.id}"`), `${file} keeps #${e.id} anchor`);
        assert.ok(html.includes(e.title.replace(/&/g, "&amp;").replace(/'/g, "&#39;")), `${file} shows ${e.title}`);
      }
      assert.equal((html.match(/<article /g) ?? []).length, EXHIBITS.length, "gallery is in the HTML, not only in JS");
      assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
      assert.match(html, /<span class="keys-hint">/);
    }
  });

  test("exhibit pages carry Article + BreadcrumbList and walk to neighbours in the same language", () => {
    for (const prefix of ["", "zh/"]) {
      const first = FILES[`${prefix}exhibits/${EXHIBITS[0].id}/index.html`];
      const last = FILES[`${prefix}exhibits/${EXHIBITS.at(-1).id}/index.html`];
      const p = prefix ? "/zh" : "";
      assert.match(first, /"@type":"Article"/);
      assert.match(first, /"@type":"BreadcrumbList"/);
      assert.match(first, /<span class="walk-prev"><\/span>/);
      assert.match(first, new RegExp(`rel="next" href="${p}/exhibits/${EXHIBITS[1].id}/"`));
      assert.match(first, new RegExp(`class="walk-hall" href="${p}/#${EXHIBITS[0].id}"`));
      assert.match(last, /<span class="walk-next"><\/span>/);
      assert.match(last, new RegExp(`rel="prev" href="${p}/exhibits/${EXHIBITS.at(-2).id}/"`));
      assert.ok(!first.includes("/app.js"), "exhibit pages need no JS");
    }
  });
});

describe("page weight budget (gzip)", () => {
  const gz = (rel) => gzipSync(readFileSync(pub(rel))).length;
  test("home page: HTML + CSS + every JS module <= 50 KB", () => {
    for (const home of ["index.html", "zh/index.html"]) {
      const total = [home, "style.css", "app.js", "museum.js", "i18n.js", "exhibits.js"].reduce((n, f) => n + gz(f), 0);
      assert.ok(total <= S.BUDGET.home, `${home}: ${total} bytes`);
    }
  });
  test("exhibit pages: HTML + CSS <= 15 KB (no JS)", () => {
    for (const f of HTML_PAGES.filter((f) => f.includes("exhibits/"))) {
      const total = gz(f) + gz("style.css");
      assert.ok(total <= S.BUDGET.exhibit, `${f}: ${total} bytes`);
    }
  });
  test("app.js imports only modules counted in the budget", () => {
    const src = read("app.js");
    const imports = [...src.matchAll(/from "\.\/([^"]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(imports, ["exhibits.js", "i18n.js", "museum.js"]);
  });
});

describe("sitemap and robots", () => {
  test("sitemap lists exactly the indexable pages, both languages", () => {
    const locs = [...FILES["sitemap.xml"].matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    assert.deepEqual(locs, HTML_PAGES.map((f) => `${S.SITE.origin}${pathOf(f)}`).sort());
    assert.match(FILES["sitemap.xml"], /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    assert.match(FILES["sitemap.xml"], /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  });
  test("every sitemap entry carries the same three alternates as the page", () => {
    for (const block of FILES["sitemap.xml"].split("<url>").slice(1)) {
      const loc = block.match(/<loc>([^<]+)<\/loc>/)[1];
      const file = `${loc.slice(S.SITE.origin.length + 1)}index.html`;
      const links = Object.fromEntries([...block.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
      assert.deepEqual(links, alternatesIn(FILES[file]), loc);
    }
  });
  test("robots allows all and declares the sitemap", () => {
    assert.equal(FILES["robots.txt"], `User-agent: *\nAllow: /\n\nSitemap: ${S.SITE.origin}/sitemap.xml\n`);
  });
  test("404 page stays noindex, out of the sitemap, and offers both halls", () => {
    const html = read("404.html");
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.ok(!html.includes('rel="canonical"'));
    assert.ok(!FILES["sitemap.xml"].includes("404"));
    assert.match(html, /<a href="\/">/);
    assert.match(html, /<a href="\/zh\/">/);
    assert.match(html, /lang="zh-Hans"/);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
  });
});

describe("pure helpers", () => {
  test("clip keeps short strings, cuts long ones on a word boundary", () => {
    assert.equal(S.clip("short", 10), "short");
    assert.equal(S.clip("one two three four", 12), "one two…");
    assert.equal(S.clip("alpha, betagamma", 13), "alpha…");
    assert.equal(S.clip("abcdefghijklmnop", 6), "abcde…");
  });
  test("clip counts CJK double and may cut between any two Chinese characters", () => {
    assert.equal(S.clip("一二三四五六", 12), "一二三四五六");
    assert.equal(S.clip("一二三四五六", 9), "一二三四…");
    assert.equal(S.clip("一二，三四五", 7), "一二…");
    assert.ok(weightedLength(S.clip("Facebook 全球宕机，一二三四五六七八九十", 30)) <= 30);
  });
  test("exhibitMeta uses subject + title when it fits, a short fallback when not", () => {
    assert.equal(S.exhibitMeta(ex("a")).title, "Thing outage, 2020: Title a");
    const long = S.exhibitMeta(ex("b", { title: "A very long exhibit title that will not fit here" }));
    assert.equal(long.title, "Thing outage, 2020, hop by hop");
  });
  test("exhibitMeta in Chinese uses full-width punctuation and weighted limits", () => {
    const [zh] = localizeExhibits([ex("a")], "zh");
    assert.deepEqual(S.exhibitMeta(zh, "zh"), {
      title: "某事故（2020 年）：标题 a",
      description: "某事故（2020 年）。从这里开始；2 跳之后，全部倒下。记住。",
    });
    const [long] = localizeExhibits([ex("b", { zh: { ...ex("b").zh, title: "一个非常非常长的展品标题，放不进搜索结果里" } })], "zh");
    assert.equal(S.exhibitMeta(long, "zh").title, "某事故（2020 年），逐跳复盘");
  });
  test("exhibitMeta description reads subject, first hop, last hop, lesson", () => {
    assert.equal(
      S.exhibitMeta(ex("a")).description,
      "Thing outage, 2020. Start here; 2 hops later, everything falls over. Learn it.",
    );
    assert.match(S.exhibitMeta(ex("a", { hops: ["x", "y", "DNS stops."] })).description, /later, DNS stops\./);
  });
  test("ldJson escapes '<' so a string can't close the script tag", () => {
    assert.equal(S.ldJson({ a: "</script>" }), '{"a":"\\u003c/script>"}');
  });
  test("sitemap home lastmod is the newest exhibit date", () => {
    const xml = S.sitemapXml([ex("a"), ex("b", { added: "2026-05-05" })]);
    assert.match(xml, /<loc>https:\/\/failrouter\.com\/<\/loc>\n    <lastmod>2026-05-05<\/lastmod>/);
    assert.match(xml, /<loc>https:\/\/failrouter\.com\/zh\/<\/loc>\n    <lastmod>2026-05-05<\/lastmod>/);
  });
  test("footer shows keyboard hints only when asked, in the page language", () => {
    assert.ok(S.footerHtml({ keys: true }).includes("<kbd>j</kbd>"));
    assert.ok(!S.footerHtml().includes("<kbd>"));
    assert.ok(S.footerHtml().includes(S.REPO_ISSUE.replace(/&/g, "&amp;")));
    assert.ok(S.footerHtml({ lang: "zh" }).includes(STRINGS.zh.footerLead));
  });
  test("langSwitchHtml points at the other language and labels it in that language", () => {
    assert.match(S.langSwitchHtml("en", "/exhibits/x/"), /href="\/zh\/exhibits\/x\/" hreflang="zh-Hans" lang="zh-Hans">中文</);
    assert.match(S.langSwitchHtml("zh", "/"), /href="\/" hreflang="en" lang="en">English</);
  });
  test("home copy stays inside the limits in both languages", () => {
    for (const t of [STRINGS.en, STRINGS.zh]) {
      assert.ok(weightedLength(t.homeTitle) <= S.LIMITS.title, t.homeTitle);
      const d = weightedLength(t.homeDescription);
      assert.ok(d >= S.LIMITS.descriptionMin && d <= S.LIMITS.description, `${d}`);
    }
  });
});

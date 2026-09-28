import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, test } from "node:test";
import { gzipSync } from "node:zlib";
import { EXHIBITS, ROOM_NAMES } from "../public/exhibits.js";
import { LOCALES, RUBRIC, STRINGS, localizeExhibits, weightedLength } from "../public/i18n.js";
import { DEFAULT_SORT, DIMENSIONS, ICON, iconSvg, sortExhibits } from "../public/museum.js";
import * as H from "../public/hall.js";
import * as S from "../scripts/site.js";

const pub = (rel) => new URL(`../public/${rel}`, import.meta.url);
const read = (rel) => readFileSync(pub(rel), "utf8");
const FILES = S.buildSite(EXHIBITS, ROOM_NAMES);
const HTML_PAGES = Object.keys(FILES).filter((f) => f.endsWith(".html"));
const HALL_PAGES = ["hall/index.html", "zh/hall/index.html"];
// The 3D hall repeats the home page's list, so it is noindex and outside the sitemap; everything else is indexed.
const INDEXABLE = HTML_PAGES.filter((f) => !HALL_PAGES.includes(f));
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
  impact: { reach: 8, duration: 6, loss: 0, recovery: 8, cascade: 2 },
  impactNotes: { reach: "Everyone", duration: "Hours", loss: "None <stated>", recovery: "On site", cascade: "Tools" },
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
    assert.equal(en.length, EXHIBITS.length + 3, "home + impact rules + 3D hall + one page per exhibit");
  });
});

describe("SEO gate on every indexable page", () => {
  for (const file of INDEXABLE) {
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

  test("exhibit pages carry Article + BreadcrumbList and walk to neighbours in the hall's default order", () => {
    const order = sortExhibits(EXHIBITS, DEFAULT_SORT);
    for (const prefix of ["", "zh/"]) {
      const first = FILES[`${prefix}exhibits/${order[0].id}/index.html`];
      const last = FILES[`${prefix}exhibits/${order.at(-1).id}/index.html`];
      const p = prefix ? "/zh" : "";
      assert.match(first, /"@type":"Article"/);
      assert.match(first, /"@type":"BreadcrumbList"/);
      assert.match(first, /<span class="walk-prev"><\/span>/);
      assert.match(first, new RegExp(`rel="next" href="${p}/exhibits/${order[1].id}/"`));
      assert.match(first, new RegExp(`class="walk-hall" href="${p}/#${order[0].id}"`));
      assert.match(last, /<span class="walk-next"><\/span>/);
      assert.match(last, new RegExp(`rel="prev" href="${p}/exhibits/${order.at(-2).id}/"`));
      assert.ok(!first.includes("/app.js"), "exhibit pages need no JS");
    }
  });

  test("home pages list exhibits newest first, in the HTML and in the ItemList", () => {
    const expected = sortExhibits(EXHIBITS, DEFAULT_SORT).map((e) => e.id);
    for (const file of ["index.html", "zh/index.html"]) {
      const html = FILES[file];
      const cards = [...html.matchAll(/<article class="exhibit" id="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(cards, expected, file);
      const list = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"CollectionPage".*?)<\/script>/)[1]);
      assert.deepEqual(list.mainEntity.itemListElement.map((i) => i.url.split("/").at(-2)), expected, `${file} ItemList`);
    }
  });

  test("home pages offer the sort control and link the impact rules; no rating markup anywhere", () => {
    for (const [file, prefix] of [["index.html", ""], ["zh/index.html", "/zh"]]) {
      const html = FILES[file];
      assert.match(html, /<span class="sort-control"><label for="sort">[^<]+<\/label> <select id="sort"><option value="date-desc" selected>/);
      assert.ok(html.includes(`<a class="impact-how" href="${prefix}/impact/">`), file);
      assert.equal((html.match(/<p class="impact">/g) ?? []).length, EXHIBITS.length, `${file}: a score on every card`);
    }
    for (const file of HTML_PAGES) assert.ok(!/AggregateRating|"Review"|ratingValue/.test(FILES[file]), file);
  });

  test("every exhibit page shows the radar, the score table and a link to the rules, in its language", () => {
    for (const e of EXHIBITS) {
      for (const [prefix, lang] of [["", "en"], ["zh/", "zh"]]) {
        const html = FILES[`${prefix}exhibits/${e.id}/index.html`];
        const panel = html.match(/<section class="impact-panel"[\s\S]*?<\/section>/)?.[0];
        assert.ok(panel, `${prefix}${e.id}: impact panel`);
        assert.match(panel, /<svg class="radar" viewBox="0 0 320 250" role="img" aria-label="[^"]+">/);
        assert.equal((panel.match(/<tr><th scope="row">/g) ?? []).length, 5);
        assert.ok(panel.includes(`href="${prefix ? "/zh" : ""}/impact/"`), `${prefix}${e.id}: rules link`);
        for (const k of DIMENSIONS) assert.ok(panel.includes(`>${RUBRIC[lang][k].name}</th><td class="n">${e.impact[k]}</td>`), `${prefix}${e.id}: ${k}`);
        assert.ok(html.indexOf("<h1>") < html.indexOf('<h2 id="impact-h">'), "headings in order");
      }
    }
  });

  test("impact rules pages: one table per dimension, linked back to the hall", () => {
    for (const [file, lang, prefix] of [["impact/index.html", "en", ""], ["zh/impact/index.html", "zh", "/zh"]]) {
      const html = FILES[file];
      assert.equal((html.match(/<table class="rubric-table">/g) ?? []).length, DIMENSIONS.length, file);
      assert.equal((html.match(/<td class="n">/g) ?? []).length, DIMENSIONS.length * 6, file);
      assert.ok(html.includes(`<h1>${STRINGS[lang].impactHow}</h1>`));
      assert.ok(html.includes(`class="walk-hall" href="${prefix}/"`));
      assert.match(html, /"@type":"Article"/);
      assert.match(html, /"@type":"BreadcrumbList"/);
      for (const k of DIMENSIONS) assert.ok(html.includes(`<h2 id="${k}">${RUBRIC[lang][k].name}</h2>`), `${file}: ${k}`);
    }
  });
});


describe("3D hall pages", () => {
  const layout = H.hallLayout(H.walkOrder(EXHIBITS, Object.keys(ROOM_NAMES.en)), Object.keys(ROOM_NAMES.en));
  for (const [file, lang, prefix] of [["hall/index.html", "en", ""], ["zh/hall/index.html", "zh", "/zh"]]) {
    test(`${file}: noindex, outside the sitemap, with the same head rules as every page`, () => {
      const html = FILES[file];
      const loc = LOCALES[lang];
      const self = `${S.SITE.origin}${prefix}/hall/`;
      assert.match(html, /<meta name="robots" content="noindex">/);
      assert.ok(!FILES["sitemap.xml"].includes("/hall/"));
      assert.ok(html.includes(`<link rel="canonical" href="${self}">`));
      assert.ok(html.includes(`<html lang="${loc.html}">`));
      assert.ok(html.includes('content="width=device-width, initial-scale=1, viewport-fit=cover"'), "opts in to safe-area insets");
      const title = unesc(html.match(/<title>([^<]*)<\/title>/)[1]);
      const desc = unesc(html.match(/<meta name="description" content="([^"]*)">/)[1]);
      assert.ok(weightedLength(title) <= S.LIMITS.title, title);
      const dl = weightedLength(desc);
      assert.ok(dl >= S.LIMITS.descriptionMin && dl <= S.LIMITS.description, `${dl}`);
      assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
      assert.deepEqual(blocks.map((b) => b["@type"]), ["WebPage", "BreadcrumbList"]);
      assert.equal(blocks[0].inLanguage, loc.html);
      assert.ok(html.includes(S.SITE.repo));
    });
    test(`${file}: one entrance, the map and the room list are in the HTML; every exhibit linked and anchored`, () => {
      const html = FILES[file];
      const main = html.match(/<main[\s\S]*<\/main>/)[0];
      for (const e of EXHIBITS) {
        assert.ok(main.includes(`<li id="${e.id}"><a href="${prefix}/exhibits/${e.id}/">`), `${file}: ${e.id}`);
      }
      const posters = [...main.matchAll(/<img class="hall-poster" src="([^"]+)"[^>]*>/g)];
      assert.deepEqual(posters.map((m) => m[1]), [H.posterPath("hall", 960)], "a single poster");
      assert.match(posters[0][0], /fetchpriority="high" width="960" height="540"|width="960" height="540"[^>]*fetchpriority="high"/);
      assert.equal((main.match(/<button class="hall-enter"/g) ?? []).length, 1, "a single entrance");
      assert.equal((main.match(/<svg class="hall-map"/g) ?? []).length, 1);
      for (const r of layout.rooms) {
        assert.ok(main.includes(`href="#room-${r.key}"`), `map links ${r.key}`);
        assert.ok(main.includes(`<section class="hall-room" id="room-${r.key}"`), `list anchors ${r.key}`);
      }
    });
    test(`${file}: Enter states the download size; the 3D controls are prerendered and hidden`, () => {
      const html = FILES[file];
      assert.ok(html.includes(`>${STRINGS[lang].hallEnter.replace("{kb}", H.DOWNLOAD_KB)}</button>`));
      assert.match(html, /<div class="hall-stage" id="hall-stage" hidden>/);
      assert.equal((html.match(/data-spot="/g) ?? []).length, EXHIBITS.length);
      assert.match(html, /<script type="module" src="\/hall-app\.js"><\/script>/);
      const stage = html.match(/<div class="hall-stage"[\s\S]*<\/dialog>\s*<\/div>/)[0];
      assert.match(stage, /<div class="hall-minimap" aria-hidden="true"><svg class="hall-map mini"/);
      assert.match(stage, /<button id="hall-map-open" type="button">/);
      assert.match(stage, /<dialog class="hall-dialog panel" id="hall-suggest-dialog"[\s\S]*href="https:\/\/github\.com\/FailRouter\/failrouter\/issues\/new/);
      const heads = [...html.matchAll(/<h([1-3])[\s>]/g)].map((m) => Number(m[1]));
      assert.equal(heads[0], 1);
      assert.ok(heads.every((h, i) => i === 0 || h <= heads[i - 1] + 1), `headings in order: ${heads}`);
    });
  }
  test("every page's site bar links the 3D hall; exhibit pages also link their own spot in it", () => {
    for (const file of HTML_PAGES) {
      const p = langOfFile(file) === "zh" ? "/zh" : "";
      const current = neutral(file) === "/hall/" ? ' aria-current="page"' : "";
      assert.ok(FILES[file].includes(`<a class="hall-nav" href="${p}/hall/"${current}>`), file);
    }
    for (const [prefix, p] of [["", ""], ["zh/", "/zh"]]) {
      for (const e of EXHIBITS) assert.ok(FILES[`${prefix}exhibits/${e.id}/index.html`].includes(`<a class="hall-link" href="${p}/hall/#${e.id}">`), e.id);
    }
  });
  test("every poster exists as WebP, both widths, and stays small", () => {
    for (const key of H.posterKeys()) {
      for (const w of H.POSTER_WIDTHS) {
        const buf = readFileSync(pub(H.posterPath(key, w).slice(1)));
        assert.equal(buf.subarray(0, 4).toString(), "RIFF");
        assert.equal(buf.subarray(8, 12).toString(), "WEBP");
        assert.ok(buf.length <= 60_000, `${key}-${w}: ${buf.length} bytes`);
      }
    }
    assert.deepEqual(readdirSync(pub("posters")).sort(), H.posterKeys().flatMap((k) => H.POSTER_WIDTHS.map((w) => `${k}-${w}.webp`)).sort());
  });
});

describe("icon and slogan", () => {
  const png = (rel) => readFileSync(pub(rel));
  test("favicon.svg is generated from ICON; the rendered icons are square PNGs of the right size", () => {
    assert.equal(read("favicon.svg"), `${iconSvg()}\n`);
    for (const [file, px] of S.ICON_FILES) {
      const b = png(file);
      assert.equal(b.subarray(1, 4).toString(), "PNG", file);
      assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [px, px], file);
    }
    const ico = png("favicon.ico");
    assert.equal(ico.readUInt16LE(4), S.ICO_SIZES.length);
    S.ICO_SIZES.forEach((size, i) => assert.equal(ico[6 + 16 * i], size));
  });
  test("every page links the icons; the Organization carries the logo", () => {
    for (const file of HTML_PAGES) {
      const html = FILES[file];
      assert.ok(html.includes('<link rel="icon" href="/favicon.ico" sizes="48x48">'), file);
      assert.ok(html.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png">'), file);
    }
    assert.deepEqual(S.publisherLd().logo, { "@type": "ImageObject", url: `${S.SITE.origin}/logo.png`, width: 512, height: 512 });
  });
  test("share images use the same icon; the slogan is on the home pages, the share images and the 404", () => {
    for (const [svg, lang] of [["og.svg", "en"], ["og-zh.svg", "zh"]]) {
      const src = readFileSync(new URL(`../scripts/${svg}`, import.meta.url), "utf8");
      for (const p of ICON.slice(1)) assert.ok(src.includes(`d="${p.d}"`), `${svg}: ${p.d}`);
      assert.ok(src.includes(STRINGS[lang].slogan), svg);
      assert.ok(FILES[lang === "en" ? "index.html" : "zh/index.html"].includes(`<p class="slogan">${STRINGS[lang].slogan}</p>`));
      assert.ok(read("404.html").includes(STRINGS[lang].slogan), `404: ${lang}`);
    }
    assert.ok(read("404.html").includes(iconSvg('class="brand-icon" width="56" height="56" aria-hidden="true" focusable="false"')), "404 shows the icon");
  });
  test("home toolbar: sort and wrong turn together, the scoring rules link on its own line", () => {
    for (const file of ["index.html", "zh/index.html"]) {
      assert.match(FILES[file], /<div class="toolbar"><span class="sort-control">[\s\S]*?<\/span><button class="wrong-turn" id="wrong-turn" type="button">[^<]+<\/button><\/div>\s*<p class="impact-link"><a class="impact-how"/);
    }
  });
});

describe("vendored three.js", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const app = read("hall-scene.js");
  test("pinned, and the bundle names its version and license", () => {
    assert.match(pkg.devDependencies.three, /^\d+\.\d+\.\d+$/, "exact version");
    const head = read(H.VENDOR.slice(1)).slice(0, 200);
    assert.ok(head.startsWith(`/* three.js ${pkg.devDependencies.three} `), head);
    assert.match(read("vendor/three.LICENSE"), /The MIT License/);
  });
  test("hall-scene.js uses exactly the three.js names that are bundled", () => {
    const used = [...new Set([...app.matchAll(/THREE\.(\w+)/g)].map((m) => m[1]))].sort();
    assert.deepEqual(used, [...H.THREE_EXPORTS].sort());
    const bundle = read(H.VENDOR.slice(1));
    const exported = bundle.match(/export\{([^}]+)\}/)[1].split(",").map((s) => s.split(" as ").at(-1)).sort();
    assert.deepEqual(exported, [...H.THREE_EXPORTS].sort(), "run `pnpm build --vendor` after changing THREE_EXPORTS");
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
  test("3D hall before Enter: HTML + CSS + hall-app.js and its imports <= 35 KB", () => {
    for (const page of HALL_PAGES) {
      const total = [page, "style.css", "hall-app.js", "hall-mode.js", "i18n.js"].reduce((n, f) => n + gz(f), 0);
      assert.ok(total <= S.BUDGET.hall, `${page}: ${total} bytes`);
    }
  });
  test("3D hall after Enter: three.js + exhibits.js + hall-scene.js and its new imports <= 190 KB, and the size on the button is honest", () => {
    const total = [H.VENDOR.slice(1), "exhibits.js", "hall-scene.js", "hall.js", "museum.js"].reduce((n, f) => n + gz(f), 0);
    assert.ok(total <= S.BUDGET.hall3d, `${total} bytes`);
    assert.ok(Math.abs(total / 1000 - H.DOWNLOAD_KB) <= H.DOWNLOAD_KB * 0.1, `button says ${H.DOWNLOAD_KB} KB, download is ${total} bytes`);
  });
  test("hall-app.js loads only what the two hall budgets count", () => {
    const src = read("hall-app.js");
    assert.deepEqual([...src.matchAll(/from "\.\/([^"]+)"/g)].map((m) => m[1]).sort(), ["hall-mode.js", "i18n.js"]);
    assert.deepEqual([...src.matchAll(/import\(([^)]+)\)/g)].map((m) => m[1]).sort(), ['"./exhibits.js"', '"./hall-scene.js"', "VENDOR"]);
    assert.ok(!/\bimport\b/.test(read("hall-mode.js")), "hall-mode.js imports nothing");
    assert.ok(!read("hall.js").match(/from "\.\/exhibits\.js"/), "hall.js must not pull the exhibit data in");
    const scene = read("hall-scene.js");
    assert.deepEqual([...scene.matchAll(/from "\.\/([^"]+)"/g)].map((m) => m[1]).sort(), ["hall.js", "i18n.js", "museum.js"], "hall-scene.js reuses modules already loaded");
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
    assert.deepEqual(locs, INDEXABLE.map((f) => `${S.SITE.origin}${pathOf(f)}`).sort());
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
    assert.equal(S.exhibitMeta(long, "zh").title, "某事故（2020 年）：原因与经过");
  });
  test("exhibitMeta description reads subject, first hop, last hop, lesson", () => {
    assert.equal(
      S.exhibitMeta(ex("a")).description,
      "Thing outage, 2020. Start here; 2 hops later, everything falls over. Learn it.",
    );
    assert.match(S.exhibitMeta(ex("a", { hops: ["x", "y", "DNS stops."] })).description, /later, DNS stops\./);
  });
  test("radarPoint: axes clockwise from the top, 0 at the centre, 10 on the outer ring", () => {
    assert.deepEqual(S.radarPoint(0, 10), [160, 52]);
    assert.deepEqual(S.radarPoint(0, 0), [160, 130]);
    assert.deepEqual(S.radarPoint(3, 0), [160, 130]);
    assert.deepEqual(S.radarPoint(1, 10), [234.2, 105.9]);
    assert.deepEqual(S.radarPoint(4, 10), [85.8, 105.9]);
    assert.deepEqual(S.radarPoint(2, 5), [182.9, 161.6]);
  });
  test("radarLabel: centred on top, outward on the sides, below at the bottom", () => {
    assert.deepEqual(S.radarLabel(0), { x: 160, anchor: "middle", lines: [20, 36] });
    assert.deepEqual(S.radarLabel(1), { x: 247.5, anchor: "start", lines: [99.6, 115.6] });
    assert.deepEqual(S.radarLabel(2), { x: 214.1, anchor: "start", lines: [216.4, 232.4] });
    assert.equal(S.radarLabel(3).anchor, "end");
    assert.equal(S.radarLabel(4).anchor, "end");
    for (let i = 0; i < 5; i++) {
      const { lines } = S.radarLabel(i);
      assert.ok(lines[0] >= 16 && lines[1] <= 250 - 8, `label ${i} inside the viewBox`);
    }
  });
  test("radarSvg draws five rings, five axes, the data polygon and labelled scores", () => {
    const svg = S.radarSvg(ex("a"), "zh");
    assert.equal((svg.match(/<polygon class="grid"/g) ?? []).length, 5);
    assert.equal((svg.match(/<line class="grid"/g) ?? []).length, 5);
    assert.match(svg, /<polygon class="area" points="160,67.6 204.5,115.5 160,130 123.3,180.5 145.2,125.2"\/>/);
    assert.equal((svg.match(/<circle class="dot"/g) ?? []).length, 5);
    assert.match(svg, /<tspan x="160" y="20">范围<\/tspan><tspan class="v" x="160" y="36">8<\/tspan>/);
    assert.match(svg, new RegExp(`aria-label="${STRINGS.zh.radarLabel}"`));
  });
  test("impactPanelHtml: summary with the average, escaped notes, no stray space after Chinese punctuation", () => {
    const en = S.impactPanelHtml(ex("a"));
    assert.match(en, /Five dimensions, 0 to 10 each\. The overall 4\.8\/10 is their average\. <a href="\/impact\/">How impact is scored<\/a>/);
    assert.ok(en.includes("<td>None &lt;stated&gt;</td>"));
    const [zh] = localizeExhibits([ex("a", { zh: { ...ex("a").zh, impactNotes: { reach: "所有人", duration: "几小时", loss: "无", recovery: "现场", cascade: "工具" } } })], "zh");
    assert.match(S.impactPanelHtml(zh, "zh"), /总分 4\.8\/10 是它们的平均值。<a href="\/zh\/impact\/">影响分怎么算<\/a>/);
    assert.match(S.impactPanelHtml(zh, "zh"), /<td class="n">8<\/td><td>所有人<\/td>/);
  });
  test("sitemap lists the impact rules page with its own lastmod", () => {
    const xml = S.sitemapXml([ex("a")]);
    assert.match(xml, new RegExp(`<loc>https://failrouter\\.com/impact/</loc>\n    <lastmod>${S.IMPACT_UPDATED}</lastmod>`));
    assert.match(xml, /<loc>https:\/\/failrouter\.com\/zh\/impact\/<\/loc>/);
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
  test("siteBarHtml: icon + name (a link home except on the home page), the 3D hall, the other language", () => {
    const ex = S.siteBarHtml("en", "/exhibits/x/");
    assert.match(ex, /^<nav class="site-bar" aria-label="Site"><a class="brand" href="\/"><svg /);
    assert.match(ex, /<span class="brand-name">Museum of Failed Routes<\/span><\/a>/);
    assert.match(ex, /<a class="hall-nav" href="\/hall\/">3D hall<\/a><a class="lang-switch" id="lang-switch" href="\/zh\/exhibits\/x\/" hreflang="zh-Hans" lang="zh-Hans">中文</);
    const home = S.siteBarHtml("zh", "/");
    assert.match(home, /<span class="brand"><svg /);
    assert.match(home, /href="\/" hreflang="en" lang="en">English</);
    assert.match(S.siteBarHtml("zh", "/hall/"), /<a class="hall-nav" href="\/zh\/hall\/" aria-current="page">3D 展厅<\/a>/);
  });
  test("icoFile packs PNGs behind an ICO directory", () => {
    const ico = S.icoFile([{ size: 32, png: Buffer.from("aaaa") }, { size: 256, png: Buffer.from("bbbbbb") }]);
    assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 2]);
    assert.deepEqual([ico[6], ico[22]], [32, 0], "256 is written as 0");
    assert.deepEqual([ico.readUInt32LE(14), ico.readUInt32LE(18)], [4, 38]);
    assert.deepEqual([ico.readUInt32LE(30), ico.readUInt32LE(34)], [6, 42]);
    assert.equal(ico.subarray(38).toString(), "aaaabbbbbb");
  });
  test("home copy stays inside the limits in both languages", () => {
    for (const t of [STRINGS.en, STRINGS.zh]) {
      assert.ok(weightedLength(t.homeTitle) <= S.LIMITS.title, t.homeTitle);
      const d = weightedLength(t.homeDescription);
      assert.ok(d >= S.LIMITS.descriptionMin && d <= S.LIMITS.description, `${d}`);
    }
  });
});

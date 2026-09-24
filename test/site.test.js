import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, test } from "node:test";
import { EXHIBITS, ROOMS } from "../public/exhibits.js";
import * as S from "../scripts/site.js";

const pub = (rel) => new URL(`../public/${rel}`, import.meta.url);
const read = (rel) => readFileSync(pub(rel), "utf8");
const FILES = S.buildSite(EXHIBITS, ROOMS);
const HTML_PAGES = Object.keys(FILES).filter((f) => f.endsWith(".html"));
// Lengths are measured on the text a user sees, not on HTML entities.
const unesc = (s) =>
  s?.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e]);
const pathOf = (file) => `/${file.replace(/index\.html$/, "")}`;

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
  ...extra,
});

describe("generated files are committed and current", () => {
  test("every generated file matches public/ (run `pnpm build` if this fails)", () => {
    for (const [rel, content] of Object.entries(FILES)) {
      assert.ok(existsSync(pub(rel)), `missing public/${rel}`);
      assert.equal(read(rel), content, `public/${rel} is stale`);
    }
  });
  test("no stale exhibit pages for removed exhibits", () => {
    const dirs = readdirSync(pub("exhibits")).sort();
    assert.deepEqual(dirs, EXHIBITS.map((e) => e.id).sort());
  });
  test("share image exists and is 1200x630 PNG", () => {
    const png = readFileSync(pub("og.png"));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
  });
});

describe("SEO gate on every indexable page", () => {
  for (const file of HTML_PAGES) {
    test(file, () => {
      const html = FILES[file];
      const title = unesc(html.match(/<title>([^<]*)<\/title>/)?.[1]);
      const desc = unesc(html.match(/<meta name="description" content="([^"]*)">/)?.[1]);
      assert.ok(title && title.length <= S.LIMITS.title, `title "${title}"`);
      assert.ok(desc && desc.length >= 70 && desc.length <= S.LIMITS.description, `description ${desc?.length}`);
      assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, "exactly one h1");
      assert.ok(html.includes(`<link rel="canonical" href="${S.SITE.origin}${pathOf(file)}">`), "canonical");
      assert.ok(html.includes(`<meta property="og:url" content="${S.SITE.origin}${pathOf(file)}">`), "og:url");
      assert.ok(html.includes(`<meta property="og:image" content="${S.SITE.origin}/og.png">`), "og:image");
      assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
      assert.ok(html.includes('<html lang="en">'));
      assert.ok(!/noindex/.test(html), "indexable pages must not be noindex");
      assert.ok(html.includes(S.SITE.repo), "links the GitHub repo");
      for (const [tag] of html.matchAll(/<script\b[^>]*\bsrc=[^>]*>/g)) {
        assert.match(tag, /type="module"|\bdefer\b|\basync\b/, `render-blocking ${tag}`);
      }
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
      assert.ok(blocks.length >= 2, "JSON-LD blocks");
      for (const b of blocks) assert.equal(b["@context"], "https://schema.org");
    });
  }

  test("home page carries WebSite + CollectionPage listing every exhibit, prerendered", () => {
    const html = FILES["index.html"];
    const types = [...html.matchAll(/"@type":"(WebSite|CollectionPage)"/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(types)].sort(), ["CollectionPage", "WebSite"]);
    for (const e of EXHIBITS) {
      assert.ok(html.includes(`href="/exhibits/${e.id}/"`), `home links ${e.id}`);
      assert.ok(html.includes(`id="${e.id}"`), `home keeps #${e.id} anchor`);
      assert.ok(html.includes(S.exhibitMeta(e).title) || html.includes(e.title));
    }
    assert.equal((html.match(/<article /g) ?? []).length, EXHIBITS.length, "gallery is in the HTML, not only in JS");
    assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  });

  test("exhibit pages carry Article + BreadcrumbList and walk to neighbours", () => {
    const first = FILES[`exhibits/${EXHIBITS[0].id}/index.html`];
    const last = FILES[`exhibits/${EXHIBITS.at(-1).id}/index.html`];
    assert.match(first, /"@type":"Article"/);
    assert.match(first, /"@type":"BreadcrumbList"/);
    assert.match(first, /<span class="walk-prev"><\/span>/);
    assert.match(first, new RegExp(`rel="next" href="/exhibits/${EXHIBITS[1].id}/"`));
    assert.match(last, /<span class="walk-next"><\/span>/);
    assert.match(last, new RegExp(`rel="prev" href="/exhibits/${EXHIBITS.at(-2).id}/"`));
    assert.ok(!first.includes("/app.js"), "exhibit pages need no JS");
  });
});

describe("sitemap and robots", () => {
  test("sitemap lists exactly the indexable pages", () => {
    const locs = [...FILES["sitemap.xml"].matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    assert.deepEqual(locs, HTML_PAGES.map((f) => `${S.SITE.origin}${pathOf(f)}`).sort());
    assert.match(FILES["sitemap.xml"], /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });
  test("robots allows all and declares the sitemap", () => {
    assert.equal(FILES["robots.txt"], `User-agent: *\nAllow: /\n\nSitemap: ${S.SITE.origin}/sitemap.xml\n`);
  });
  test("404 page stays noindex and out of the sitemap", () => {
    const html = read("404.html");
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.ok(!html.includes('rel="canonical"'));
    assert.ok(!FILES["sitemap.xml"].includes("404"));
  });
});

describe("pure helpers", () => {
  test("clip keeps short strings, cuts long ones on a word boundary", () => {
    assert.equal(S.clip("short", 10), "short");
    assert.equal(S.clip("one two three four", 12), "one two…");
    assert.equal(S.clip("alpha, betagamma", 13), "alpha…");
    assert.equal(S.clip("abcdefghijklmnop", 6), "abcde…");
  });
  test("exhibitMeta uses subject + title when it fits, a short fallback when not", () => {
    assert.equal(S.exhibitMeta(ex("a")).title, "Thing outage, 2020: Title a");
    const long = S.exhibitMeta(ex("b", { title: "A very long exhibit title that will not fit here" }));
    assert.equal(long.title, "Thing outage, 2020, hop by hop");
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
    assert.match(xml, /<loc>https:\/\/failrouter\.com\/<\/loc><lastmod>2026-05-05<\/lastmod>/);
  });
  test("footer shows keyboard hints only when asked", () => {
    assert.ok(S.footerHtml({ keys: true }).includes("<kbd>j</kbd>"));
    assert.ok(!S.footerHtml().includes("<kbd>"));
    assert.ok(S.footerHtml().includes(S.REPO_ISSUE.replace(/&/g, "&amp;")));
  });
  test("home copy stays inside the limits", () => {
    assert.ok(S.HOME.title.length <= S.LIMITS.title);
    assert.ok(S.HOME.description.length <= S.LIMITS.description);
  });
});

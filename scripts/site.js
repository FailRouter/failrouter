// Pure page generator: data in, file contents out. No fs, no network.
// scripts/build.js writes the result into public/; tests compare it with what is committed.
// Every page exists in English (root) and Simplified Chinese (/zh/). Paths passed around here are
// language-neutral ("/", "/exhibits/<id>/"); localePath() adds the prefix.
import { LANGS, LOCALES, STRINGS, fmt, localePath, localizeExhibits, otherLang, weightedLength, charWeight } from "../public/i18n.js";
import { ALL, esc, exhibitHtml, exhibitPath, galleryHtml, roomsHtml } from "../public/museum.js";

export const SITE = {
  origin: "https://failrouter.com",
  name: "Failrouter",
  museum: "Museum of Failed Routes",
  repo: "https://github.com/FailRouter/failrouter",
  themeColor: "#111014",
};
export const REPO_ISSUE = `${SITE.repo}/issues/new?title=${encodeURIComponent("Exhibit suggestion: ")}`;
/** Gzipped bytes per page, enforced in test/site.test.js. Home = HTML + CSS + all JS; exhibit = HTML + CSS. */
export const BUDGET = { home: 50_000, exhibit: 15_000 };
/** Search-result limits, measured with weightedLength (CJK = 2). */
export const LIMITS = { title: 60, descriptionMin: 70, description: 155 };

/**
 * Shorten to at most `max` weighted characters (CJK = 2), ending with an ellipsis.
 * Never splits a Latin word; Chinese can break between any two characters.
 */
export function clip(s, max) {
  if (weightedLength(s) <= max) return s;
  let out = "";
  let w = 0;
  for (const ch of s) {
    if (w + charWeight(ch) > max - 1) break;
    out += ch;
    w += charWeight(ch);
  }
  if (/\w$/.test(out) && /^\w/.test(s.slice(out.length))) {
    const m = out.match(/^(.*\W)\w+$/s);
    if (m) out = m[1];
  }
  return `${out.replace(/[\s,;:.，；：。、]+$/, "")}…`;
}

// Keep acronyms and proper nouns ("DNS", "Airlines" is fine lowered, "AWS" is not). No-op on Chinese.
const lowerFirst = (s) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** Title + description of an exhibit page. `e` is already localized to `lang`. */
export function exhibitMeta(e, lang = "en") {
  const t = STRINGS[lang];
  const full = fmt(t.metaTitle, e);
  const title = weightedLength(full) <= LIMITS.title ? full : clip(fmt(t.metaTitleShort, e), LIMITS.title);
  const description = clip(
    fmt(t.metaDescription, {
      subject: e.subject,
      first: e.hops[0].replace(/[.。]$/, ""),
      later: e.hops.length - 1,
      last: lowerFirst(e.hops.at(-1).replace(/[.。]$/, "")),
      lesson: e.lesson,
    }),
    LIMITS.description,
  );
  return { title, description };
}

/** JSON for a <script type="application/ld+json"> block; "<" escaped so it can't close the tag. */
export const ldJson = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

const abs = (path) => `${SITE.origin}${path}`;
const url = (lang, path) => abs(localePath(lang, path));

export function publisherLd() {
  return { "@type": "Organization", name: SITE.name, url: abs("/"), sameAs: [SITE.repo] };
}

export function websiteLd(lang = "en") {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: STRINGS[lang].museum,
    alternateName: SITE.name,
    url: url(lang, "/"),
    inLanguage: LOCALES[lang].html,
    publisher: publisherLd(),
  };
}

export function collectionLd(exhibits, lang = "en") {
  const t = STRINGS[lang];
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t.homeTitle,
    description: t.homeDescription,
    url: url(lang, "/"),
    inLanguage: LOCALES[lang].html,
    isPartOf: { "@type": "WebSite", url: url(lang, "/") },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: exhibits.length,
      itemListElement: exhibits.map((e, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: abs(exhibitPath(e.id, lang)),
        name: e.title,
      })),
    },
  };
}

export function articleLd(e, rooms, lang = "en") {
  const { description } = exhibitMeta(e, lang);
  const page = abs(exhibitPath(e.id, lang));
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: e.title,
    alternativeHeadline: e.subject,
    description,
    url: page,
    mainEntityOfPage: page,
    inLanguage: LOCALES[lang].html,
    image: abs(LOCALES[lang].ogImage),
    datePublished: e.added,
    articleSection: rooms[e.room],
    about: { "@type": "Event", name: e.subject, startDate: e.date },
    citation: e.source,
    isPartOf: { "@type": "WebSite", name: STRINGS[lang].museum, url: url(lang, "/") },
    author: publisherLd(),
    publisher: publisherLd(),
  };
}

export function breadcrumbLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: abs(path),
    })),
  };
}

/** hreflang alternates for a language-neutral path: every language + x-default (English). */
export function alternates(path) {
  return [...LANGS.map((l) => [LOCALES[l].hreflang, url(l, path)]), ["x-default", url("en", path)]];
}

/** <head> contents shared by every indexable page. */
export function headHtml({ title, description, path, type, jsonLd, lang = "en" }) {
  const self = url(lang, path);
  const loc = LOCALES[lang];
  const ld = jsonLd.map((o) => `  <script type="application/ld+json">${ldJson(o)}</script>`).join("\n");
  const alt = alternates(path)
    .map(([hl, href]) => `  <link rel="alternate" hreflang="${hl}" href="${href}">`)
    .join("\n");
  return `  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${self}">
${alt}
  <meta property="og:site_name" content="${SITE.name}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${self}">
  <meta property="og:type" content="${type}">
  <meta property="og:locale" content="${loc.og}">
  <meta property="og:locale:alternate" content="${LOCALES[otherLang(lang)].og}">
  <meta property="og:image" content="${abs(loc.ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(STRINGS[lang].ogAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="${SITE.themeColor}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/style.css">
  <script>document.documentElement.classList.add("js")</script>
${ld}`;
}

/** Link to the same page in the other language. app.js keeps its #anchor in sync on the home page. */
export function langSwitchHtml(lang, path) {
  const to = otherLang(lang);
  const loc = LOCALES[to];
  return `<p class="lang-bar"><a class="lang-switch" id="lang-switch" href="${localePath(to, path)}" hreflang="${loc.hreflang}" lang="${loc.html}">${esc(STRINGS[to].langName)}</a></p>`;
}

export function footerHtml({ keys = false, lang = "en" } = {}) {
  const t = STRINGS[lang];
  const keyHint = keys ? ` <span class="keys-hint">${t.keysHtml}</span>` : "";
  return `  <footer>
    <p>${esc(t.footerLead)}</p>
    <p class="small">${esc(t.footerNote)}${keyHint}</p>
    <p class="small"><a href="${SITE.repo}">${esc(t.repoLink)}</a> · <a href="${esc(REPO_ISSUE)}">${esc(t.suggest)}</a> · ${esc(t.license)}</p>
  </footer>`;
}

export function homePage(exhibits, rooms, lang = "en") {
  const t = STRINGS[lang];
  const list = localizeExhibits(exhibits, lang);
  const head = headHtml({
    title: t.homeTitle,
    description: t.homeDescription,
    path: "/",
    type: "website",
    lang,
    jsonLd: [websiteLd(lang), collectionLd(list, lang)],
  });
  return `<!doctype html>
<html lang="${LOCALES[lang].html}">
<head>
${head}
</head>
<body>
  ${langSwitchHtml(lang, "/")}
  <header class="entrance">
    <pre class="trace" id="trace" aria-label="${esc(t.traceLabel)}">$ traceroute failrouter.com</pre>
    <h1>${t.h1Html}</h1>
    <p class="tagline">${esc(t.tagline)}</p>
    <nav class="rooms" id="rooms" aria-label="${esc(t.roomsLabel)}">${roomsHtml(list, rooms, ALL, lang)}</nav>
    <button class="wrong-turn" id="wrong-turn" type="button">${esc(t.wrongTurn)}</button>
  </header>

  <main id="gallery" class="gallery" aria-live="polite">${galleryHtml(list, rooms, ALL, lang)}
  </main>

${footerHtml({ keys: true, lang })}

  <script type="module" src="/app.js"></script>
</body>
</html>
`;
}

function neighbourLink(e, rel, label, lang) {
  if (!e) return `<span class="walk-${rel}"></span>`;
  return `<a class="walk-${rel}" rel="${rel}" href="${exhibitPath(e.id, lang)}">${label} ${esc(e.title)}</a>`;
}

/** An exhibit's own page. `exhibits` and `e` are the English originals; localized here. */
export function exhibitPage(e, exhibits, rooms, lang = "en") {
  const t = STRINGS[lang];
  const list = localizeExhibits(exhibits, lang);
  const idx = exhibits.indexOf(e);
  const x = list[idx];
  const { title, description } = exhibitMeta(x, lang);
  const path = `/exhibits/${e.id}/`;
  const hall = localePath(lang, "/");
  const crumbs = [
    [t.museum, hall],
    [x.title, exhibitPath(e.id, lang)],
  ];
  const head = headHtml({
    title,
    description,
    path,
    type: "article",
    lang,
    jsonLd: [articleLd(x, rooms, lang), breadcrumbLd(crumbs)],
  });
  return `<!doctype html>
<html lang="${LOCALES[lang].html}">
<head>
${head}
</head>
<body class="exhibit-page">
  ${langSwitchHtml(lang, path)}
  <nav class="crumbs" aria-label="${esc(t.crumbsLabel)}"><a href="${hall}">${esc(t.museum)}</a> <span aria-hidden="true">›</span> ${esc(rooms[e.room])}</nav>

  <main class="gallery single">${exhibitHtml(x, { no: idx + 1, i: 0, rooms, page: true, lang })}
    <p class="about-event">${esc(fmt(t.aboutEvent, { subject: x.subject, duration: x.duration, n: x.hops.length }))}</p>
    <nav class="walk" aria-label="${esc(t.walkLabel)}">
      ${neighbourLink(list[idx - 1], "prev", "←", lang)}
      <a class="walk-hall" href="${hall}#${esc(e.id)}">${esc(t.backToHall)}</a>
      ${neighbourLink(list[idx + 1], "next", "→", lang)}
    </nav>
  </main>

${footerHtml({ lang })}
</body>
</html>
`;
}

export function sitemapXml(exhibits) {
  const latest = exhibits.map((e) => e.added).sort().at(-1);
  const paths = [["/", latest], ...exhibits.map((e) => [`/exhibits/${e.id}/`, e.added])];
  const links = (path) =>
    alternates(path)
      .map(([hl, href]) => `    <xhtml:link rel="alternate" hreflang="${hl}" href="${href}"/>`)
      .join("\n");
  const body = paths
    .flatMap(([path, mod]) =>
      LANGS.map((l) => `  <url>\n    <loc>${url(l, path)}</loc>\n    <lastmod>${mod}</lastmod>\n${links(path)}\n  </url>`),
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>
`;
}

export const robotsTxt = () => `User-agent: *
Allow: /

Sitemap: ${abs("/sitemap.xml")}
`;

/** Every generated file, keyed by path relative to public/. */
export function buildSite(exhibits, rooms) {
  const files = { "sitemap.xml": sitemapXml(exhibits), "robots.txt": robotsTxt() };
  for (const lang of LANGS) {
    const dir = localePath(lang, "/").slice(1);
    files[`${dir}index.html`] = homePage(exhibits, rooms[lang], lang);
    for (const e of exhibits) files[`${dir}exhibits/${e.id}/index.html`] = exhibitPage(e, exhibits, rooms[lang], lang);
  }
  return files;
}

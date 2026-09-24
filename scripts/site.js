// Pure page generator: data in, file contents out. No fs, no network.
// scripts/build.js writes the result into public/; tests compare it with what is committed.
import { ALL, esc, exhibitHtml, exhibitPath, galleryHtml, roomsHtml } from "../public/museum.js";

export const SITE = {
  origin: "https://failrouter.com",
  name: "Failrouter",
  museum: "Museum of Failed Routes",
  repo: "https://github.com/FailRouter/failrouter",
  ogImage: "/og.png",
  themeColor: "#111014",
};
export const REPO_ISSUE = `${SITE.repo}/issues/new?title=${encodeURIComponent("Exhibit suggestion: ")}`;
export const LIMITS = { title: 60, description: 155 };

export const HOME = {
  title: "Museum of Failed Routes: famous outages, hop by hop",
  description:
    "Famous outages and engineering failures, from the 2021 Facebook outage to CrowdStrike's Channel File 291, each told hop by hop from its public postmortem.",
};

/** Shorten to at most `max` characters on a word boundary, ending with an ellipsis. */
export function clip(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

// Keep acronyms and proper nouns ("DNS", "Airlines" is fine lowered, "AWS" is not).
const lowerFirst = (s) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

export function exhibitMeta(e) {
  const full = `${e.subject}: ${e.title}`;
  const title = full.length <= LIMITS.title ? full : clip(`${e.subject}, hop by hop`, LIMITS.title);
  const first = e.hops[0].replace(/\.$/, "");
  const last = e.hops.at(-1).replace(/\.$/, "");
  const description = clip(
    `${e.subject}. ${first}; ${e.hops.length - 1} hops later, ${lowerFirst(last)}. ${e.lesson}`,
    LIMITS.description,
  );
  return { title, description };
}

/** JSON for a <script type="application/ld+json"> block; "<" escaped so it can't close the tag. */
export const ldJson = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

const abs = (path) => `${SITE.origin}${path}`;

export function publisherLd() {
  return { "@type": "Organization", name: SITE.name, url: abs("/"), sameAs: [SITE.repo] };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.museum,
    alternateName: SITE.name,
    url: abs("/"),
    publisher: publisherLd(),
  };
}

export function collectionLd(exhibits) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: HOME.title,
    description: HOME.description,
    url: abs("/"),
    isPartOf: { "@type": "WebSite", url: abs("/") },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: exhibits.length,
      itemListElement: exhibits.map((e, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: abs(exhibitPath(e.id)),
        name: e.title,
      })),
    },
  };
}

export function articleLd(e, rooms) {
  const { description } = exhibitMeta(e);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: e.title,
    alternativeHeadline: e.subject,
    description,
    url: abs(exhibitPath(e.id)),
    mainEntityOfPage: abs(exhibitPath(e.id)),
    image: abs(SITE.ogImage),
    datePublished: e.added,
    articleSection: rooms[e.room],
    about: { "@type": "Event", name: e.subject, startDate: e.date },
    citation: e.source,
    isPartOf: { "@type": "WebSite", name: SITE.museum, url: abs("/") },
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

/** <head> contents shared by every indexable page. */
export function headHtml({ title, description, path, type, jsonLd }) {
  const url = abs(path);
  const ld = jsonLd.map((o) => `  <script type="application/ld+json">${ldJson(o)}</script>`).join("\n");
  return `  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:site_name" content="${SITE.name}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="${type}">
  <meta property="og:locale" content="en_US">
  <meta property="og:image" content="${abs(SITE.ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${SITE.museum}: famous outages, told hop by hop">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="${SITE.themeColor}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/style.css">
  <script>document.documentElement.classList.add("js")</script>
${ld}`;
}

export function footerHtml({ keys = false } = {}) {
  const keyHint = keys ? " Keys: <kbd>j</kbd>/<kbd>k</kbd> to walk, <kbd>r</kbd> for a wrong turn." : "";
  return `  <footer>
    <p>Admission free. Exits clearly marked, unlike most of these systems.</p>
    <p class="small">Summaries are condensed from public postmortems and investigation reports.${keyHint}</p>
    <p class="small"><a href="${SITE.repo}">Source on GitHub</a> · <a href="${esc(REPO_ISSUE)}">Suggest an exhibit</a> · MIT licensed</p>
  </footer>`;
}

export function homePage(exhibits, rooms) {
  const head = headHtml({
    ...HOME,
    path: "/",
    type: "website",
    jsonLd: [websiteLd(), collectionLd(exhibits)],
  });
  return `<!doctype html>
<html lang="en">
<head>
${head}
</head>
<body>
  <header class="entrance">
    <pre class="trace" id="trace" aria-label="A traceroute that ends at the museum">$ traceroute failrouter.com</pre>
    <h1>Museum of <span>Failed Routes</span></h1>
    <p class="tagline">Every outage starts as a small change that took an unexpected route. These are the famous ones, hop by hop.</p>
    <nav class="rooms" id="rooms" aria-label="Rooms">${roomsHtml(exhibits, rooms, ALL)}</nav>
    <button class="wrong-turn" id="wrong-turn" type="button">Take a wrong turn</button>
  </header>

  <main id="gallery" class="gallery" aria-live="polite">${galleryHtml(exhibits, rooms, ALL)}
  </main>

${footerHtml({ keys: true })}

  <script type="module" src="/app.js"></script>
</body>
</html>
`;
}

function neighbourLink(e, rel, label) {
  if (!e) return `<span class="walk-${rel}"></span>`;
  return `<a class="walk-${rel}" rel="${rel}" href="${exhibitPath(e.id)}">${label} ${esc(e.title)}</a>`;
}

export function exhibitPage(e, exhibits, rooms) {
  const idx = exhibits.indexOf(e);
  const { title, description } = exhibitMeta(e);
  const crumbs = [
    [SITE.museum, "/"],
    [e.title, exhibitPath(e.id)],
  ];
  const head = headHtml({
    title,
    description,
    path: exhibitPath(e.id),
    type: "article",
    jsonLd: [articleLd(e, rooms), breadcrumbLd(crumbs)],
  });
  return `<!doctype html>
<html lang="en">
<head>
${head}
</head>
<body class="exhibit-page">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">${SITE.museum}</a> <span aria-hidden="true">›</span> ${esc(rooms[e.room])}</nav>

  <main class="gallery single">${exhibitHtml(e, { no: idx + 1, i: 0, rooms, page: true })}
    <p class="about-event">${esc(e.subject)}. Duration: ${esc(e.duration)}. ${e.hops.length} hops from the first change to the failure.</p>
    <nav class="walk" aria-label="More exhibits">
      ${neighbourLink(exhibits[idx - 1], "prev", "←")}
      <a class="walk-hall" href="/#${esc(e.id)}">Back to the main hall</a>
      ${neighbourLink(exhibits[idx + 1], "next", "→")}
    </nav>
  </main>

${footerHtml()}
</body>
</html>
`;
}

export function sitemapXml(exhibits) {
  const latest = exhibits.map((e) => e.added).sort().at(-1);
  const urls = [
    [abs("/"), latest],
    ...exhibits.map((e) => [abs(exhibitPath(e.id)), e.added]),
  ];
  const body = urls.map(([loc, mod]) => `  <url><loc>${loc}</loc><lastmod>${mod}</lastmod></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
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
  const files = {
    "index.html": homePage(exhibits, rooms),
    "sitemap.xml": sitemapXml(exhibits),
    "robots.txt": robotsTxt(),
  };
  for (const e of exhibits) files[`exhibits/${e.id}/index.html`] = exhibitPage(e, exhibits, rooms);
  return files;
}

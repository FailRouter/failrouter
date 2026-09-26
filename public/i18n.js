// UI strings and locale helpers, English + Simplified Chinese. Pure: no DOM, no globals.
// Exhibit content lives in exhibits.js (`zh` field on each exhibit, `ROOM_NAMES.zh`).
// Both dictionaries must have exactly the same keys (test/i18n.test.js).
// `{name}` placeholders are filled by fmt(). Values ending in "Html" are trusted markup, not escaped.

export const LANGS = ["en", "zh"];

export const LOCALES = {
  en: { html: "en", hreflang: "en", og: "en_US", prefix: "", ogImage: "/og.png" },
  zh: { html: "zh-Hans", hreflang: "zh-Hans", og: "zh_CN", prefix: "/zh", ogImage: "/og-zh.png" },
};

export const STRINGS = {
  en: {
    langName: "English",
    homeTitle: "Museum of Failed Routes: famous outages, hop by hop",
    homeDescription:
      "Famous outages and engineering failures, from the 2021 Facebook outage to CrowdStrike's Channel File 291, each told hop by hop from its public postmortem.",
    museum: "Museum of Failed Routes",
    h1Html: "Museum of <span>Failed Routes</span>",
    tagline:
      "Every outage starts as a small change that took an unexpected route. These are the famous ones, hop by hop.",
    traceLabel: "A traceroute that ends at the museum",
    roomsLabel: "Rooms",
    allRooms: "All rooms",
    wrongTurn: "Take a wrong turn",
    plaqueNo: "No. {no}",
    source: "Source: ",
    failed: "failed",
    footerLead: "Admission free. Exits clearly marked, unlike most of these systems.",
    footerNote: "Summaries are condensed from public postmortems and investigation reports.",
    keysHtml: "Keys: <kbd>j</kbd>/<kbd>k</kbd> to walk, <kbd>r</kbd> for a wrong turn.",
    repoLink: "Source on GitHub",
    suggest: "Suggest an exhibit",
    license: "MIT licensed",
    crumbsLabel: "Breadcrumb",
    walkLabel: "More exhibits",
    backToHall: "Back to the main hall",
    aboutEvent: "{subject}. Duration: {duration}. {n} hops from the first change to the failure.",
    metaTitle: "{subject}: {title}",
    metaTitleShort: "{subject}, hop by hop",
    metaDescription: "{subject}. {first}; {later} hops later, {last}. {lesson}",
    ogAlt: "Museum of Failed Routes: famous outages, told hop by hop",
  },
  zh: {
    langName: "中文",
    homeTitle: "失败路由博物馆：知名宕机事故逐跳复盘",
    homeDescription:
      "从 2021 年 Facebook 全球宕机到 CrowdStrike 蓝屏，每起知名宕机事故都按公开的事后复盘报告，一跳一跳讲清楚。",
    museum: "失败路由博物馆",
    h1Html: "<span>失败路由</span>博物馆",
    tagline: "每次宕机都始于一个小改动，然后走上了没人预料的路线。这里收的是有名的那些，一跳一跳地讲。",
    traceLabel: "一段以博物馆为终点的 traceroute",
    roomsLabel: "展厅",
    allRooms: "全部展厅",
    wrongTurn: "走条岔路",
    plaqueNo: "展品 {no}",
    source: "来源：",
    failed: "失败",
    footerLead: "免费参观。出口标得很清楚，这点比馆里大多数系统强。",
    footerNote: "展品摘要均据公开的事后复盘报告与调查报告整理。",
    keysHtml: "键盘：<kbd>j</kbd>/<kbd>k</kbd> 前后走，<kbd>r</kbd> 随机走条岔路。",
    repoLink: "GitHub 源码",
    suggest: "推荐展品",
    license: "MIT 许可",
    crumbsLabel: "面包屑导航",
    walkLabel: "更多展品",
    backToHall: "回到主展厅",
    aboutEvent: "{subject}。持续时间：{duration}。从第一个改动到故障，共 {n} 跳。",
    metaTitle: "{subject}：{title}",
    metaTitleShort: "{subject}：原因与经过",
    metaDescription: "{subject}。{first}；{later} 跳之后，{last}。{lesson}",
    ogAlt: "失败路由博物馆：知名宕机事故，逐跳复盘",
  },
};

/** Fill `{name}` placeholders; unknown names are left as-is so a typo shows up on the page and in tests. */
export const fmt = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** Language of a page from its <html lang>: anything starting with "zh" is Chinese, the rest English. */
export const langOf = (htmlLang) => (/^zh\b/i.test(htmlLang ?? "") ? "zh" : "en");

export const otherLang = (lang) => (lang === "zh" ? "en" : "zh");

/** Language-neutral path ("/", "/exhibits/x/") → that language's public path. */
export const localePath = (lang, path) => `${LOCALES[lang].prefix}${path}`;

/** Language switch target: same page in the other language, keeping the exhibit anchor. */
export const switchHref = (href, id) => `${href.replace(/#.*$/, "")}${id ? `#${id}` : ""}`;

/** Exhibits with their text fields in `lang`. Ids, dates and `source` stay as they are. */
export function localizeExhibits(exhibits, lang) {
  if (lang === "en") return exhibits;
  return exhibits.map((e) => ({ ...e, ...e[lang] }));
}

// CJK ideographs, kana, hangul, CJK punctuation and full-width forms count double,
// which is roughly how search results truncate them.
const WIDE = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/;
export const charWeight = (ch) => (WIDE.test(ch) ? 2 : 1);

/** Display length with CJK = 2. Equal to `.length` for plain English. */
export function weightedLength(s) {
  let n = 0;
  for (const ch of s) n += charWeight(ch);
  return n;
}

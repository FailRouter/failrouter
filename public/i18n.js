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
    impact: "Impact {score}/10",
    sortLabel: "Sort",
    sortDateDesc: "Date, newest first",
    sortDateAsc: "Date, oldest first",
    sortImpactDesc: "Impact, highest first",
    sortImpactAsc: "Impact, lowest first",
    impactHow: "How impact is scored",
    impactHeading: "Impact",
    impactSummary: "Five dimensions, 0 to 10 each. The overall {score}/10 is their average.",
    radarLabel: "Radar chart of the five impact scores. The table below lists the same scores.",
    impactDimension: "Dimension",
    impactScore: "Score",
    impactBasis: "Basis",
    impactLevel: "Meaning",
    impactPageTitle: "How the Museum of Failed Routes scores outage impact",
    impactPageDescription:
      "How each outage in the museum is scored 0 to 10 on reach, duration, loss, recovery and cascade, using only facts from its public postmortem.",
    impactIntro:
      "Each exhibit is scored 0 to 10 on five dimensions, using only facts from its named public source. The overall impact is the plain average of the five, to one decimal place. The home page draws it as five dots, one dot for every 2 points.",
    impactLevels: "Scores sit on the levels below. An odd score means the facts fall between two levels.",
    impactNoBlame: "The score measures how far an outage reached, not who was at fault.",
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
    impact: "影响 {score}/10",
    sortLabel: "排序",
    sortDateDesc: "时间，新到旧",
    sortDateAsc: "时间，旧到新",
    sortImpactDesc: "影响，高到低",
    sortImpactAsc: "影响，低到高",
    impactHow: "影响分怎么算",
    impactHeading: "影响评估",
    impactSummary: "五个维度各 0 到 10 分，总分 {score}/10 是它们的平均值。",
    radarLabel: "五个维度影响分的雷达图，下表列出同样的分数。",
    impactDimension: "维度",
    impactScore: "分数",
    impactBasis: "依据",
    impactLevel: "标准",
    impactPageTitle: "失败路由博物馆：宕机影响分怎么算",
    impactPageDescription:
      "馆内每起宕机事故都按范围、时长、损失、恢复难度、连锁五个维度打 0 到 10 分，只依据公开复盘报告里的事实。",
    impactIntro:
      "每件展品按五个维度各打 0 到 10 分，只依据展品注明的公开来源里的事实。总影响分是五项的平均值，保留一位小数。首页用五个圆点表示，每 2 分一个点。",
    impactLevels: "分数落在下表的档位上。奇数分表示事实正好落在两档之间。",
    impactNoBlame: "分数衡量的是故障波及多广，不评判谁的过错。",
  },
};

/**
 * What each impact dimension measures and what 0, 2, 4, 6, 8 and 10 mean.
 * Same keys and order as DIMENSIONS in museum.js; six levels per dimension (test/i18n.test.js).
 */
export const RUBRIC = {
  en: {
    reach: {
      name: "Reach",
      what: "Who was directly affected",
      levels: [
        "No outside users",
        "Inside one organization",
        "One product's users in one region",
        "One product's users worldwide",
        "Several major services, worldwide",
        "Across industries, at the level of society",
      ],
    },
    duration: {
      name: "Duration",
      what: "Time until the main service was back",
      levels: [
        "Under 5 minutes",
        "5 to 30 minutes",
        "30 minutes to 2 hours",
        "2 to 8 hours",
        "8 to 48 hours",
        "Over 48 hours, or never restored",
      ],
    },
    loss: {
      name: "Loss",
      what: "What was lost for good",
      levels: [
        "Nothing",
        "A small cost that can be recovered",
        "Lost revenue stated in the source, no data lost",
        "Some data lost for good, or a stated loss of $10 million or more",
        "A lot of data lost for good, or a stated loss of $100 million or more",
        "The whole asset lost: vehicle destroyed, mission failed",
      ],
    },
    recovery: {
      name: "Recovery",
      what: "How hard it was to recover",
      levels: [
        "Recovered on its own",
        "One-click rollback or config revert",
        "Remote manual intervention",
        "Several teams, systems rebuilt",
        "On-site access, or fixing machines one by one",
        "Cannot be fixed, only replaced",
      ],
    },
    cascade: {
      name: "Cascade",
      what: "How far it spread beyond the system that failed",
      levels: [
        "No spillover",
        "Only the owner's own dependent systems",
        "A few customers or partners",
        "Many downstream sites of one provider",
        "Large parts of the internet, or several industries",
        "Flights, hospitals or emergency lines halted at scale",
      ],
    },
  },
  zh: {
    reach: {
      name: "范围",
      what: "直接受影响的是谁",
      levels: [
        "没有外部用户",
        "一家机构内部",
        "一个产品在一个区域的用户",
        "一个产品的全球用户",
        "多个主要服务的全球用户",
        "跨行业、社会层面的影响",
      ],
    },
    duration: {
      name: "时长",
      what: "主服务恢复用了多久",
      levels: [
        "不到 5 分钟",
        "5 到 30 分钟",
        "30 分钟到 2 小时",
        "2 到 8 小时",
        "8 到 48 小时",
        "超过 48 小时，或再也没有恢复",
      ],
    },
    loss: {
      name: "损失",
      what: "永久失去了什么",
      levels: [
        "没有",
        "可以恢复的小额成本",
        "来源写明有收入损失，没有丢数据",
        "部分数据永久丢失，或来源写明损失在 1000 万美元以上",
        "大量数据永久丢失，或来源写明损失在 1 亿美元以上",
        "整件资产全部损失：飞行器损毁、任务失败",
      ],
    },
    recovery: {
      name: "恢复难度",
      what: "恢复有多难",
      levels: [
        "系统自动恢复",
        "一键回滚或撤回配置",
        "远程人工介入",
        "多团队协同，需要重建系统",
        "必须到现场，或逐台设备手动修",
        "修不了，只能换掉",
      ],
    },
    cascade: {
      name: "连锁",
      what: "影响在故障系统之外传了多远",
      levels: [
        "没有外溢",
        "只影响自家的依赖系统",
        "少数客户或合作方",
        "某家供应商的大量下游站点",
        "互联网的大片区域，或多个行业",
        "航班、医院、急救这类现实世界服务大面积停摆",
      ],
    },
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

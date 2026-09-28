// Pure logic for the museum page: no DOM, no globals, so it runs under node:test.
// app.js wires these functions to the document. Every function that renders text takes `lang`
// ("en" default) and reads its strings from i18n.js; pass exhibits already localized (localizeExhibits).
import { LOCALES, STRINGS, fmt, localePath } from "./i18n.js";

export const ALL = "all";

export const TRACE = [
  " 1  home-router (192.168.1.1)          1.2 ms",
  " 2  isp-edge.example (10.0.0.1)        8.9 ms",
  " 3  a-config-push-nobody-reviewed      12.4 ms",
  " 4  * * *",
  " 5  * * *  request timed out",
  "    you have arrived.",
];

/** Delay before printing a traceroute line: timeouts ("*") take longer. */
export const traceDelay = (line) => (line.includes("*") ? 700 : 350);

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** Exhibits shown in a room ("all" = every exhibit). */
export function visibleIn(exhibits, room) {
  return room === ALL ? exhibits : exhibits.filter((e) => e.room === room);
}

/** Impact dimensions, in radar-axis order (clockwise from the top). Same keys as RUBRIC in i18n.js. */
export const DIMENSIONS = ["reach", "duration", "loss", "recovery", "cascade"];

/** Overall impact: plain average of the five 0-10 scores, one decimal place. */
export const impactScore = (e) => (DIMENSIONS.reduce((n, k) => n + e.impact[k], 0) * 2) / 10;

/** Sort orders offered on the home page; the first is the default and the prerendered order. */
export const SORTS = {
  "date-desc": "sortDateDesc",
  "date-asc": "sortDateAsc",
  "impact-desc": "sortImpactDesc",
  "impact-asc": "sortImpactAsc",
};
export const DEFAULT_SORT = "date-desc";

/** A known sort key, or the default (e.g. a stale value restored by the browser). */
export const parseSort = (v) => (Object.hasOwn(SORTS, v) ? v : DEFAULT_SORT);

const byDateDesc = (a, b) => b.date.localeCompare(a.date);
const byId = (a, b) => a.id.localeCompare(b.id);
const PRIMARY = {
  "date-desc": byDateDesc,
  "date-asc": (a, b) => -byDateDesc(a, b),
  "impact-desc": (a, b) => impactScore(b) - impactScore(a),
  "impact-asc": (a, b) => impactScore(a) - impactScore(b),
};

/** A sorted copy. Ties fall back to newest first, then id, so the order is always the same. */
export function sortExhibits(exhibits, sort = DEFAULT_SORT) {
  const primary = PRIMARY[parseSort(sort)];
  return [...exhibits].sort((a, b) => primary(a, b) || byDateDesc(a, b) || byId(a, b));
}

/** What the gallery shows: one room, in one order. */
export const viewList = (exhibits, room, sort) => sortExhibits(visibleIn(exhibits, room), sort);

/** <option>s for the sort <select>, current one selected. */
export function sortOptionsHtml(current, lang = "en") {
  return Object.entries(SORTS)
    .map(([k, label]) => `<option value="${k}"${k === current ? " selected" : ""}>${esc(STRINGS[lang][label])}</option>`)
    .join("");
}

// Dot row geometry, matching .pips in style.css: 5 cells of 14 px, each with a 10 px dot in the middle.
const PIP = { cell: 14, dot: 10, count: 5 };

/**
 * How far to fill the dot row, in % of its width, so `score / 2` dots look filled: 2.5 dots = two full
 * dots and exactly half of the third. The gaps between dots are skipped, so a whole number ends in a gap.
 */
export function pipsFill(score) {
  const dots = score / 2;
  const full = Math.floor(dots);
  const frac = dots - full;
  const px = full * PIP.cell + (frac > 0 ? (PIP.cell - PIP.dot) / 2 + frac * PIP.dot : 0);
  return Math.round((px / (PIP.cell * PIP.count)) * 1000) / 10;
}

/** Overall impact line: five dots filled to score / 2, plus the number as text (the dots are decoration). */
export function impactHtml(e, lang = "en") {
  const score = impactScore(e);
  return `<p class="impact"><span class="pips" aria-hidden="true" style="--v:${pipsFill(score)}%"></span>${esc(fmt(STRINGS[lang].impact, { score: score.toFixed(1) }))}</p>`;
}

/** Room filter buttons: [key, label, count], "all" first. */
export function roomButtons(exhibits, rooms, lang = "en") {
  const counts = {};
  for (const e of exhibits) counts[e.room] = (counts[e.room] ?? 0) + 1;
  return [
    [ALL, STRINGS[lang].allRooms, exhibits.length],
    ...Object.entries(rooms).map(([k, v]) => [k, v, counts[k] ?? 0]),
  ];
}

export function roomsHtml(exhibits, rooms, current, lang = "en") {
  return roomButtons(exhibits, rooms, lang)
    .map(
      ([k, label, n]) =>
        `<button type="button" data-room="${esc(k)}" aria-pressed="${k === current}">${esc(label)} <span>${n}</span></button>`,
    )
    .join("");
}

/** Public URL path of an exhibit's own page in `lang`. */
export const exhibitPath = (id, lang = "en") => localePath(lang, `/exhibits/${id}/`);

/**
 * One exhibit card. `no` is the 1-based catalogue number, `i` the position in the current view.
 * `page: true` renders it as the main content of the exhibit's own page (h1, no self-link, always lit).
 */
export function exhibitHtml(e, { no, i, rooms, page = false, lang = "en" }) {
  const t = STRINGS[lang];
  const hops = e.hops
    .map((h, n) => {
      const last = n === e.hops.length - 1;
      const mark = last ? ` <b class="x" aria-label="${esc(t.failed)}">✕</b>` : "";
      return `<li class="${last ? "fail" : ""}"><span class="hop">${String(n + 1).padStart(2, " ")}</span>${esc(h)}${mark}</li>`;
    })
    .join("");
  const heading = page
    ? `<h1>${esc(e.title)}</h1>`
    : `<h2><a href="${exhibitPath(esc(e.id), lang)}">${esc(e.title)}</a></h2>`;
  // The source keeps its original (English) name; mark it so screen readers switch voice.
  const src = lang === "en" ? esc(e.source) : `<span lang="${LOCALES.en.html}">${esc(e.source)}</span>`;
  return `
  <article class="exhibit${page ? " lit" : ""}" id="${esc(e.id)}" tabindex="-1" style="--i:${i}">
    <p class="plaque-no">${esc(fmt(t.plaqueNo, { no: String(no).padStart(3, "0") }))} · ${esc(rooms[e.room])}</p>
    ${heading}
    <p class="meta"><time datetime="${esc(e.date)}">${esc(e.date)}</time> · ${esc(e.duration)}</p>
    ${impactHtml(e, lang)}
    <ol class="route">${hops}</ol>
    <p class="lesson">${esc(e.lesson)}</p>
    <p class="source">${esc(t.source)}${src}</p>
  </article>`;
}

/** Cards for one room in one order. Catalogue numbers come from `exhibits` order, so they never change. */
export function galleryHtml(exhibits, rooms, room, lang = "en", sort = DEFAULT_SORT) {
  return viewList(exhibits, room, sort)
    .map((e, i) => exhibitHtml(e, { no: exhibits.indexOf(e) + 1, i, rooms, lang }))
    .join("");
}

/** Random exhibit id from `pool`, avoiding `current` when there is a choice. `rand` in [0, 1). */
export function wrongTurnId(pool, current, rand) {
  if (pool.length === 0) return null;
  const choices = pool.length > 1 ? pool.filter((e) => e.id !== current) : pool;
  return choices[Math.floor(rand * choices.length)].id;
}

// Radar chart geometry, in viewBox units. Sized so labels stay >= 12 px on a 320 px screen.
// Shared by the exhibit pages (inline SVG, scripts/site.js) and the 3D plaques (canvas, hall-scene.js).
export const RADAR = { w: 320, h: 250, cx: 160, cy: 130, r: 78, label: 14 };
const round1 = (n) => Math.round(n * 10) / 10 || 0;

/** Point at `value` (0-10) on axis `i`, axes clockwise from the top. `r` = radius of a 10. */
export function radarPoint(i, value, r = RADAR.r) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / DIMENSIONS.length;
  const d = (r * value) / 10;
  return [round1(RADAR.cx + d * Math.cos(a)), round1(RADAR.cy + d * Math.sin(a))];
}

/** Axis label placement: x, text-anchor, and baselines of the name line and the score line. */
export function radarLabel(i) {
  const [x, y] = radarPoint(i, 10, RADAR.r + RADAR.label);
  const dx = x - RADAR.cx;
  const dy = y - RADAR.cy;
  const anchor = Math.abs(dx) < 1 ? "middle" : dx > 0 ? "start" : "end";
  const lines = dy < -RADAR.r ? [y - 18, y - 2] : dy > RADAR.r / 2 ? [y + 12, y + 28] : [y - 2, y + 14];
  return { x, anchor, lines: lines.map(round1) };
}

// The site icon: a museum pediment and base, with a route of hops falling towards the base and
// ending in a red node. 64-unit grid. Used for favicon.svg (scripts/site.js), the site bar and the 3D hall.
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
export const ICON = [
  { d: "M12 0H52A12 12 0 0 1 64 12V52A12 12 0 0 1 52 64H12A12 12 0 0 1 0 52V12A12 12 0 0 1 12 0Z", fill: "#111014" },
  { d: "M7 24L32 9L57 24Z", fill: "#c9a45c" },
  { d: "M8 51H56A1 1 0 0 1 57 52V55A1 1 0 0 1 56 56H8A1 1 0 0 1 7 55V52A1 1 0 0 1 8 51Z", fill: "#c9a45c" },
  { d: "M16 30L32 37L46 44", stroke: "#7fdc8c", width: 3.5 },
  { d: circle(16, 30, 4.5), fill: "#7fdc8c" },
  { d: circle(32, 37, 4.5), fill: "#7fdc8c" },
  { d: circle(47, 44, 6), fill: "#c2412d" },
];

/** The icon as SVG markup. `attrs` go on the <svg> element (size, class, aria). */
export function iconSvg(attrs = "") {
  const parts = ICON.map((p) =>
    p.stroke
      ? `<path d="${p.d}" fill="none" stroke="${p.stroke}" stroke-width="${p.width}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${p.d}" fill="${p.fill}"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${attrs ? ` ${attrs}` : ""}>${parts}</svg>`;
}

/** Keyboard walk: "j" next, "k" previous, clamped to the list. Unknown current = before the first. */
export function stepId(list, current, key) {
  if (list.length === 0) return null;
  const idx = list.findIndex((e) => e.id === current);
  if (key === "j") return list[Math.min(idx + 1, list.length - 1)].id;
  if (key === "k") return list[Math.max(idx - 1, 0)].id;
  return null;
}

/** Whether a keydown should drive the museum (no modifiers, not typing in a field). */
export function isMuseumKey(ev) {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
  return !/INPUT|TEXTAREA|SELECT/.test(ev.target?.tagName ?? "");
}

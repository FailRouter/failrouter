// Pure logic for the museum page: no DOM, no globals, so it runs under node:test.
// app.js wires these functions to the document.

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

/** Room filter buttons: [key, label, count], "all" first. */
export function roomButtons(exhibits, rooms) {
  const counts = {};
  for (const e of exhibits) counts[e.room] = (counts[e.room] ?? 0) + 1;
  return [[ALL, "All rooms", exhibits.length], ...Object.entries(rooms).map(([k, v]) => [k, v, counts[k] ?? 0])];
}

export function roomsHtml(exhibits, rooms, current) {
  return roomButtons(exhibits, rooms)
    .map(
      ([k, label, n]) =>
        `<button type="button" data-room="${esc(k)}" aria-pressed="${k === current}">${esc(label)} <span>${n}</span></button>`,
    )
    .join("");
}

/** Public URL path of an exhibit's own page. */
export const exhibitPath = (id) => `/exhibits/${id}/`;

/**
 * One exhibit card. `no` is the 1-based catalogue number, `i` the position in the current view.
 * `page: true` renders it as the main content of the exhibit's own page (h1, no self-link, always lit).
 */
export function exhibitHtml(e, { no, i, rooms, page = false }) {
  const hops = e.hops
    .map((h, n) => {
      const last = n === e.hops.length - 1;
      const mark = last ? ' <b class="x" aria-label="failed">✕</b>' : "";
      return `<li class="${last ? "fail" : ""}"><span class="hop">${String(n + 1).padStart(2, " ")}</span>${esc(h)}${mark}</li>`;
    })
    .join("");
  const heading = page
    ? `<h1>${esc(e.title)}</h1>`
    : `<h2><a href="${exhibitPath(esc(e.id))}">${esc(e.title)}</a></h2>`;
  return `
  <article class="exhibit${page ? " lit" : ""}" id="${esc(e.id)}" tabindex="-1" style="--i:${i}">
    <p class="plaque-no">No. ${String(no).padStart(3, "0")} · ${esc(rooms[e.room])}</p>
    ${heading}
    <p class="meta"><time datetime="${esc(e.date)}">${esc(e.date)}</time> · ${esc(e.duration)}</p>
    <ol class="route">${hops}</ol>
    <p class="lesson">${esc(e.lesson)}</p>
    <p class="source">Source: ${esc(e.source)}</p>
  </article>`;
}

export function galleryHtml(exhibits, rooms, room) {
  return visibleIn(exhibits, room)
    .map((e, i) => exhibitHtml(e, { no: exhibits.indexOf(e) + 1, i, rooms }))
    .join("");
}

/** Random exhibit id from `pool`, avoiding `current` when there is a choice. `rand` in [0, 1). */
export function wrongTurnId(pool, current, rand) {
  if (pool.length === 0) return null;
  const choices = pool.length > 1 ? pool.filter((e) => e.id !== current) : pool;
  return choices[Math.floor(rand * choices.length)].id;
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

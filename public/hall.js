// Pure logic for the 3D hall (/hall/): walk order, floor plan, camera framing, movement, plaque text
// layout, device tier and adaptive quality. No DOM and no three.js, so it runs under node:test.
// public/hall-app.js wires these to the page and to three.js.
import { DEFAULT_SORT, esc, impactScore, sortExhibits } from "./museum.js";
import { STRINGS, fmt } from "./i18n.js";

/** three.js names hall-app.js may use; `pnpm build --vendor` bundles exactly these into public/vendor/. */
export const THREE_EXPORTS = [
  "AdditiveBlending",
  "BoxGeometry",
  "CanvasTexture",
  "CatmullRomCurve3",
  "Color",
  "CylinderGeometry",
  "DirectionalLight",
  "Fog",
  "Group",
  "HemisphereLight",
  "Mesh",
  "MeshBasicMaterial",
  "MeshLambertMaterial",
  "PerspectiveCamera",
  "PlaneGeometry",
  "Raycaster",
  "RepeatWrapping",
  "SRGBColorSpace",
  "Scene",
  "SphereGeometry",
  "TorusGeometry",
  "TubeGeometry",
  "Vector2",
  "Vector3",
  "WebGLRenderer",
];

/** Where the vendored three.js lives, and roughly what entering the hall downloads (gzip, checked in tests). */
export const VENDOR = "/vendor/three.module.min.js";
export const DOWNLOAD_KB = 150;

/** Floor plan, in metres. The corridor runs from the lobby (z > 0) towards -z. */
export const PLAN = {
  width: 8, // wall to wall
  wallHeight: 4.2,
  eye: 1.6,
  back: 6, // lobby back wall
  firstRoom: -2, // z of the first room sign
  roomPad: 2, // sign to first plaque row
  slot: 5, // plaque row spacing
  tail: 2, // last row to the end wall
  walk: 2.3, // |x| the visitor may walk to (keeps clear of the plinths)
  margin: 0.7, // distance kept from the end walls
  plaque: { w: 2.2, h: 2.75, y: 1.8 },
  view: { x: 1.2, z: -0.4 }, // viewpoint offset from a plaque: across the corridor, a step towards its sculpture
};

/** Exhibits in the order the corridor shows them: rooms in `roomKeys` order, newest first inside a room. */
export function walkOrder(exhibits, roomKeys) {
  const sorted = sortExhibits(exhibits, DEFAULT_SORT);
  return roomKeys.flatMap((k) => sorted.filter((e) => e.room === k));
}

/**
 * Floor plan for `order` (from walkOrder): one section per room that has exhibits, plaques alternating
 * left / right. Side -1 hangs on the left wall (x < 0, facing +x), +1 on the right wall.
 */
export function hallLayout(order, roomKeys, plan = PLAN) {
  const rooms = [];
  const slots = [];
  let z = plan.firstRoom;
  for (const key of roomKeys) {
    const here = order.filter((e) => e.room === key);
    if (here.length === 0) continue;
    const start = z;
    here.forEach((e, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      slots.push({
        id: e.id,
        room: key,
        side,
        x: side * (plan.width / 2),
        z: start - plan.roomPad - plan.slot * (Math.floor(i / 2) + 0.5),
        rotY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
      });
    });
    z = start - plan.roomPad - plan.slot * Math.ceil(here.length / 2) - 1;
    rooms.push({ key, start, end: z });
  }
  return { rooms, slots, end: z - plan.tail, back: plan.back };
}

/** Camera position and look-at point for the plaque in `slot`. */
export function viewpoint(slot, plan = PLAN) {
  return {
    pos: [-slot.side * plan.view.x, plan.eye, slot.z + plan.view.z],
    look: [slot.x, plan.plaque.y, slot.z],
  };
}

/**
 * Where a plaque's route sculpture stands: beside the plaque on the far side from the lobby, so walking
 * in you read the plaque first, clear of the walkway.
 */
export function plinthPosition(slot, plan = PLAN) {
  return [slot.side * (plan.width / 2 - 0.9), slot.z - plan.plaque.w / 2 - 0.75];
}

/** Where a plaque's spotlight falls: between the plaque and its sculpture. */
export const spotPosition = (slot, plan = PLAN) => [slot.side * (plan.width / 2 - 0.9), slot.z - 0.8];

/** Route sculpture: one node per hop, spiralling upwards from the plinth top. Local [x, y, z]. */
export function routePoints(hops, { base = 1.1, rise = 0.95, radius = 0.26, turn = 1.25 } = {}) {
  return Array.from({ length: hops }, (_, k) => {
    const a = k * turn;
    const y = base + (hops > 1 ? (rise * k) / (hops - 1) : 0);
    return [Math.round(Math.cos(a) * radius * 1000) / 1000, Math.round(y * 1000) / 1000, Math.round(Math.sin(a) * radius * 1000) / 1000];
  });
}

/** Horizontal distance from a viewpoint to its plaque. */
export const viewDistance = (plan = PLAN) => Math.hypot(plan.width / 2 + plan.view.x, plan.view.z);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const deg = (rad) => (rad * 180) / Math.PI;

/**
 * Vertical field of view (degrees) that fits a whole plaque, with room for the bars above and below,
 * at any aspect ratio: portrait phones widen it, wide screens stay at `min`.
 */
export function fovFor(aspect, plan = PLAN, min = 50, max = 80) {
  const d = viewDistance(plan);
  const byHeight = 2 * Math.atan((plan.plaque.h * 1.3) / 2 / d);
  const byWidth = 2 * Math.atan((plan.plaque.w * 1.15) / 2 / (d * aspect));
  return clamp(deg(Math.max(byHeight, byWidth)), min, max);
}

/** Yaw (around y, 0 = looking towards -z) and pitch that look from `pos` at `look`. */
export function lookAngles(pos, look) {
  const dx = look[0] - pos[0];
  const dy = look[1] - pos[1];
  const dz = look[2] - pos[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** Keep the visitor inside the corridor. `pos` is [x, z]. */
export function clampPosition([x, z], layout, plan = PLAN) {
  return [clamp(x, -plan.walk, plan.walk), clamp(z, layout.end + plan.margin, layout.back - plan.margin)];
}

/** One step of keyboard walking: `forward` / `strafe` in -1..1, `dt` seconds, `speed` m/s. Returns [x, z]. */
export function moveStep([x, z], yaw, { forward, strafe }, dt, speed = 3) {
  const len = Math.hypot(forward, strafe);
  if (len === 0) return [x, z];
  const f = forward / Math.max(1, len);
  const s = strafe / Math.max(1, len);
  const d = speed * dt;
  return [x + (-Math.sin(yaw) * f + Math.cos(yaw) * s) * d, z + (-Math.cos(yaw) * f - Math.sin(yaw) * s) * d];
}

/** Drag to look: pixels to radians, pitch kept within ±0.9 rad. */
export function lookDelta({ yaw, pitch }, dx, dy, sensitivity = 0.005) {
  return { yaw: yaw - dx * sensitivity, pitch: clamp(pitch - dy * sensitivity, -0.9, 0.9) };
}

/** Angle interpolation along the short way round. */
export function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

/** Ease in-out for the walk between plaques, t in 0..1. */
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Index of the plaque whose viewpoint is closest to [x, z]. */
export function nearestIndex(layout, [x, z]) {
  let best = 0;
  let bestD = Infinity;
  layout.slots.forEach((s, i) => {
    const [vx, , vz] = viewpoint(s).pos;
    const d = Math.hypot(vx - x, vz - z);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Previous / next plaque, clamped to the corridor. */
export const stepIndex = (i, delta, count) => clamp(i + delta, 0, count - 1);

/** Plaque index for a URL hash (`#<id>`), or -1 (start in the lobby). */
export function indexForHash(layout, hash) {
  const id = decodeURIComponent((hash ?? "").replace(/^#/, ""));
  return id ? layout.slots.findIndex((s) => s.id === id) : -1;
}

/** Where the visitor stands when entering without an exhibit: the lobby, looking down the corridor. */
export function lobbyView(layout, plan = PLAN) {
  return { pos: [0, plan.eye, layout.back - 0.8], look: [0, plan.eye + 0.15, layout.back - 20] };
}

/** Poster images: the lobby plus one per room with exhibits. */
export const posterKeys = (layout) => ["lobby", ...layout.rooms.map((r) => r.key)];
export const POSTER_WIDTHS = [480, 960];
export const POSTER_HEIGHT = (w) => Math.round((w * 9) / 16);
export const posterPath = (key, w) => `/posters/${key}-${w}.webp`;

/** Camera for a poster: the lobby view, or standing at a room's sign looking down the room. */
export function posterView(layout, key, plan = PLAN) {
  const room = layout.rooms.find((r) => r.key === key);
  if (!room) return lobbyView(layout, plan);
  return { pos: [0, plan.eye + 0.2, room.start + 1.5], look: [0, plan.eye - 0.1, room.end] };
}

/** `?poster=<key>` (used by `pnpm build --posters`), or null for a normal visit. */
export function posterParam(search, layout) {
  const key = new URLSearchParams(search ?? "").get("poster");
  return key && posterKeys(layout).includes(key) ? key : null;
}

/**
 * Whether to offer the 3D hall, which message (STRINGS key) to show instead, and whether to jump
 * between plaques instead of walking (reduced motion).
 */
export function hallMode({ webgl, saveData, reducedMotion }) {
  if (!webgl) return { enter: false, message: "hallNoWebgl", jump: true };
  if (saveData) return { enter: false, message: "hallSaveData", jump: true };
  return { enter: true, message: null, jump: Boolean(reducedMotion) };
}

const FORWARD = { w: 1, arrowup: 1, s: -1, arrowdown: -1 };
const STRAFE = { d: 1, arrowright: 1, a: -1, arrowleft: -1 };

/** Walking input from the keys held down (lower-cased `KeyboardEvent.key` values). */
export function keyInput(pressed) {
  let forward = 0;
  let strafe = 0;
  for (const k of pressed) {
    forward += FORWARD[k] ?? 0;
    strafe += STRAFE[k] ?? 0;
  }
  return { forward: clamp(forward, -1, 1), strafe: clamp(strafe, -1, 1) };
}

/** Keys that walk the whole corridor: "j" next plaque, "k" previous (as on the home page). */
export const stepKey = (key) => ({ j: 1, k: -1 })[key] ?? 0;

/** Whether a pointer press and release count as a tap (pick a plaque) rather than a drag. */
export const isTap = (dx, dy) => Math.hypot(dx, dy) < 8;

// ---------- device tier ----------

/** Low-end GPU renderer names: old Mali / Adreno / PowerVR, and software rendering. */
const LOW_END_RENDERERS = [/Mali-4\d\d(?!\d)/i, /Adreno[^0-9]*[1-5]\d\d(?!\d)/i, /PowerVR/i, /SwiftShader/i, /llvmpipe/i];
export const isLowEndRenderer = (renderer) => LOW_END_RENDERERS.some((re) => re.test(renderer));

/**
 * Render tier from device signals, never from the user agent. Desktop (fine pointer) is always high.
 * On touch screens any low-end signal wins; all high-end signals are needed for high; missing = medium.
 */
export function deviceTier({ coarsePointer, devicePixelRatio, hardwareConcurrency, maxTextureSize, renderer }) {
  if (!coarsePointer) return "high";
  const low =
    (hardwareConcurrency !== undefined && hardwareConcurrency <= 3) ||
    (maxTextureSize !== undefined && maxTextureSize < 4096) ||
    (renderer !== undefined && isLowEndRenderer(renderer));
  if (low) return "low";
  const high = hardwareConcurrency >= 8 && maxTextureSize >= 8192 && devicePixelRatio >= 2;
  return high ? "high" : "medium";
}

/** What each tier renders with. `texture` is the plaque canvas width in px. */
export const TIERS = {
  high: { dpr: 2, antialias: true, texture: 1024 },
  medium: { dpr: 1.5, antialias: false, texture: 1024 },
  low: { dpr: 1, antialias: false, texture: 512 },
};
export const TIER_ORDER = ["high", "medium", "low"];

/** Canvas pixel ratio for a tier: the device's, capped by the tier. */
export const pixelRatio = (tier, deviceDpr = 1) => Math.min(deviceDpr || 1, TIERS[tier].dpr);

// ---------- adaptive quality ----------

export const QUALITY = {
  windowMs: 3000, // sliding FPS window
  downFps: 45, // below this, drop a tier
  upFps: 55, // at or above this for holdMs, climb a tier
  holdMs: 5000,
  dwellMs: 3000, // no change within this long after a change
  minSpanMs: 1500,
  minSamples: 24,
  gapMs: 250, // frames further apart than this are separate bursts of motion, not slow frames
};

/** Mean FPS over the window (frame timestamps), or null when there is too little data to decide. */
export function windowFps(samples) {
  const n = samples.length;
  if (n < QUALITY.minSamples) return null;
  const span = samples[n - 1] - samples[0];
  if (span < QUALITY.minSpanMs) return null;
  return ((n - 1) * 1000) / span;
}

/** One decision of the tier state machine; see QUALITY for the thresholds. */
export function decideTier({ tier, fps, upSince, windowStart, now, lastChange }) {
  if (fps === null) return { tier, upSince: null, changed: false };
  const dwell = now - lastChange < QUALITY.dwellMs;
  const i = TIER_ORDER.indexOf(tier);
  if (fps < QUALITY.downFps) {
    if (dwell || i === TIER_ORDER.length - 1) return { tier, upSince: null, changed: false };
    return { tier: TIER_ORDER[i + 1], upSince: null, changed: true };
  }
  if (i > 0 && fps >= QUALITY.upFps) {
    const since = upSince ?? windowStart;
    if (!dwell && now - since >= QUALITY.holdMs) return { tier: TIER_ORDER[i - 1], upSince: null, changed: true };
    return { tier, upSince: since, changed: false };
  }
  return { tier, upSince: null, changed: false };
}

export const createQuality = (now, tier = "high") => ({ tier, samples: [], upSince: null, lastChange: now });

/**
 * Record a rendered frame and maybe change tier. Updates `state` in place (no allocation per frame).
 * A long gap (the scene was idle) starts a new window, so idle time never reads as a slow frame.
 */
export function recordFrame(state, now) {
  const s = state.samples;
  if (s.length > 0 && (now < s.at(-1) || now - s.at(-1) > QUALITY.gapMs)) {
    s.length = 0;
    state.upSince = null;
  }
  s.push(now);
  let drop = 0;
  while (s[drop] <= now - QUALITY.windowMs) drop += 1;
  if (drop > 0) s.splice(0, drop);
  const d = decideTier({ tier: state.tier, fps: windowFps(s), upSince: state.upSince, windowStart: s[0], now, lastChange: state.lastChange });
  state.upSince = d.upSince;
  if (d.changed) {
    state.tier = d.tier;
    state.lastChange = now;
    s.length = 0;
  }
  return state;
}

// ---------- plaque text ----------

const WIDE = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/;
const TOKEN = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]|[^\s\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]+\s*|\s+/g;
// Chinese punctuation that must not start a line.
const NO_START = /^[，。、；：？）」』】》…·%）,.;:?)]/;

/**
 * Greedy line breaking: Latin text breaks at spaces, Chinese between any two characters, closing
 * punctuation never starts a line, and a word too long for a line is split. `measure(text)` → px.
 */
export function wrapLines(text, maxWidth, measure) {
  const lines = [];
  let line = "";
  const fits = (s) => measure(s.trimEnd()) <= maxWidth;
  for (const tok of text.match(TOKEN) ?? []) {
    if (line === "" && /^\s+$/.test(tok)) continue;
    if (fits(line + tok)) {
      line += tok;
    } else if (line !== "" && NO_START.test(tok)) {
      line += tok;
    } else {
      if (line !== "") lines.push(line.trimEnd());
      line = "";
      for (const ch of tok.trimStart()) {
        if (line !== "" && !fits(line + ch)) {
          lines.push(line.trimEnd());
          line = "";
        }
        line += ch;
      }
    }
  }
  if (line.trim() !== "") lines.push(line.trimEnd());
  return lines;
}

// Plaque colours: the site's plaque card (style.css).
const INK = "#221e1a";
const LABEL = "#8a7d64";
const META = "#6f6656";
const FAIL = "#c2412d";

/** Text blocks of a plaque, top to bottom. `e` is already localized; `rooms` is in `lang`. */
export function plaqueBlocks(e, { no, rooms, lang = "en" }) {
  const t = STRINGS[lang];
  const hops = e.hops.map((h, i) => {
    const last = i === e.hops.length - 1;
    return { text: last ? `${h} ✕` : h, lead: String(i + 1).padStart(2, "0"), indent: 52, size: 32, color: last ? FAIL : INK, weight: last ? 700 : 400, before: i === 0 ? 26 : 8 };
  });
  return [
    { text: `${fmt(t.plaqueNo, { no: String(no).padStart(3, "0") })} · ${rooms[e.room]}`, family: "mono", size: 24, color: LABEL },
    { text: e.title, size: 54, weight: 700, color: INK, before: 12, lineHeight: 1.15 },
    { text: `${e.date} · ${e.duration}`, size: 28, color: META, before: 14 },
    { text: fmt(t.impact, { score: impactScore(e).toFixed(1) }), size: 28, color: FAIL, before: 4 },
    ...hops,
    { text: e.lesson, size: 32, color: INK, italic: lang !== "zh", before: 30, rule: true },
    { text: `${t.source}${e.source}`, size: 22, color: LABEL, before: 18 },
  ];
}

/** CSS font string for a block at `scale`. `families` = { serif, mono }. */
export function fontCss(block, scale, families) {
  const px = Math.round(block.size * scale);
  return `${block.italic ? "italic " : ""}${block.weight ?? 400} ${px}px ${families[block.family ?? "serif"]}`;
}

function place(blocks, box, measure, scale) {
  const lines = [];
  const rules = [];
  let y = box.pad;
  for (const b of blocks) {
    const before = (b.before ?? 0) * scale;
    if (b.rule) rules.push(Math.round(y + before / 2));
    y += before;
    const font = fontCss(b, scale, box.families);
    const lh = b.size * scale * (b.lineHeight ?? 1.32);
    const indent = b.lead ? b.indent * scale : 0;
    const wrapped = wrapLines(b.text, box.width - 2 * box.pad - indent, (s) => measure(s, font));
    wrapped.forEach((text, i) => {
      if (i === 0 && b.lead) lines.push({ text: b.lead, x: box.pad, y: Math.round(y), font: fontCss({ ...b, family: "mono", weight: 400, size: b.size * 0.8 }, scale, box.families), color: LABEL });
      lines.push({ text, x: Math.round(box.pad + indent), y: Math.round(y), font, color: b.color });
      y += lh;
    });
  }
  return { lines, rules, bottom: y };
}

/**
 * Lay out blocks in a box ({ width, height, pad, families }), shrinking the type until it fits, then
 * centring the text block vertically. Lines are positioned by their top edge (canvas textBaseline
 * "top"). `measure(text, font)` → px.
 */
export function layoutPlaque(blocks, box, measure, minScale = 0.5) {
  for (let scale = 1; ; scale = Math.max(minScale, scale * 0.92)) {
    const out = place(blocks, box, measure, scale);
    if (out.bottom <= box.height - box.pad || scale === minScale) {
      const shift = Math.max(0, Math.round((box.height - box.pad - out.bottom) / 2));
      return {
        scale,
        lines: out.lines.map((l) => ({ ...l, y: l.y + shift })),
        rules: out.rules.map((y) => y + shift),
        bottom: out.bottom + shift,
      };
    }
  }
}

// ---------- page markup pieces (prerendered by scripts/site.js) ----------

/** Buttons of the "Exhibits" dialog, grouped by room, in walk order. */
export function spotsHtml(order, rooms, lang = "en") {
  const t = STRINGS[lang];
  const groups = [];
  order.forEach((e, i) => {
    if (groups.at(-1)?.room !== e.room) groups.push({ room: e.room, items: [] });
    groups.at(-1).items.push(`<li><button type="button" data-spot="${i}">${esc(e.title)}</button></li>`);
  });
  return groups
    .map((g) => `<h3>${esc(rooms[g.room])}</h3><ul class="hall-spots">${g.items.join("")}</ul>`)
    .join("")
    .concat(`<p class="hall-count">${esc(fmt(t.hallCount, { n: order.length }))}</p>`);
}

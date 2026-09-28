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

// What the page needs before Enter lives in hall-mode.js (kept tiny); re-exported here for one import.
export { DOWNLOAD_KB, VENDOR, hallMode } from "./hall-mode.js";

/**
 * Floor plan, in metres. A main corridor (the spine) runs from the lobby (z > 0) towards -z and ends
 * at the end wall. Rooms hang off it, alternating left (x < 0) and right, each reached through a short
 * side corridor. Inside a room, plaques face each other across it, like the old single corridor.
 */
export const PLAN = {
  spine: 5, // spine width, wall to wall
  wallHeight: 4.2,
  eye: 1.6,
  back: 6, // lobby back wall
  firstJunction: -4, // z of the first side corridor
  gap: 7, // spine distance between side corridors
  endPad: 6, // last side corridor to the end wall
  corridor: { width: 3, length: 6 },
  room: { width: 8, pad: 1.5, slot: 5, tail: 1.5 },
  margin: 0.5, // distance kept from walls
  walk: 2.3, // |v| the visitor may walk to inside a room (keeps clear of the plinths)
  lane: 0.9, // |v| inside a side corridor (keeps clear of the corridor installations)
  plaque: { w: 2.2, h: 2.75, y: 1.8 },
  view: { across: 1.2, along: 0.4 }, // viewpoint: across the room from a plaque, a step towards its sculpture
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const deg = (rad) => (rad * 180) / Math.PI;

/** Exhibits in the order the hall shows them: rooms in `roomKeys` order, newest first inside a room. */
export function walkOrder(exhibits, roomKeys) {
  const sorted = sortExhibits(exhibits, DEFAULT_SORT);
  return roomKeys.flatMap((k) => sorted.filter((e) => e.room === k));
}

/**
 * Floor plan for `order` (from walkOrder). Rooms without exhibits get no room. Room i hangs on side
 * -1 (left) when i is even, +1 (right) when odd; `u` is the distance from the spine's axis, so a
 * point at distance u on that side has x = side * u. Plaque `wall` -1 hangs on the room's deeper
 * wall (z = room.z - width / 2, facing +z), +1 on the wall nearer the lobby (facing -z).
 */
export function hallLayout(order, roomKeys, plan = PLAN) {
  const rooms = [];
  const slots = [];
  const u0 = plan.spine / 2 + plan.corridor.length;
  for (const key of roomKeys) {
    const here = order.filter((e) => e.room === key);
    if (here.length === 0) continue;
    const index = rooms.length;
    const side = index % 2 === 0 ? -1 : 1;
    const z = plan.firstJunction - plan.gap * index;
    const rows = Math.ceil(here.length / 2);
    const u1 = u0 + plan.room.pad + plan.room.slot * rows + plan.room.tail;
    here.forEach((e, k) => {
      const wall = k % 2 === 0 ? -1 : 1;
      const u = u0 + plan.room.pad + plan.room.slot * (Math.floor(k / 2) + 0.5);
      slots.push({ id: e.id, room: key, roomIndex: index, side, wall, u, roomZ: z, x: side * u, z: z + (wall * plan.room.width) / 2, rotY: wall < 0 ? 0 : Math.PI });
    });
    rooms.push({ key, index, side, z, u0, u1, count: here.length });
  }
  const last = rooms.at(-1)?.z ?? plan.firstJunction;
  return { rooms, slots, end: last - plan.endPad, back: plan.back };
}

/** World [x, z] of a point at distance `u` from the spine axis and `v` across a room's axis. */
const roomPoint = (room, u, v) => [room.side * u, room.z + v];

/** Camera position and look-at point for the plaque in `slot`. */
export function viewpoint(slot, plan = PLAN) {
  const [x, z] = [slot.side * (slot.u + plan.view.along), slot.roomZ - slot.wall * plan.view.across];
  return { pos: [x, plan.eye, z], look: [slot.x, plan.plaque.y, slot.z] };
}

/** Horizontal distance from a viewpoint to its plaque. */
export const viewDistance = (plan = PLAN) => Math.hypot(plan.room.width / 2 + plan.view.across, plan.view.along);

/** Just inside a room's entrance, looking at its far wall. */
export function roomView(room, plan = PLAN) {
  const [x, z] = roomPoint(room, room.u0 + 0.6, 0);
  const [lx, lz] = roomPoint(room, room.u1, 0);
  return { pos: [x, plan.eye, z], look: [lx, plan.eye, lz] };
}

/** Where the visitor stands when entering without an exhibit: the lobby, looking down the spine. */
export function lobbyView(layout, plan = PLAN) {
  return { pos: [0, plan.eye, layout.back - 0.8], look: [0, plan.eye + 0.15, layout.back - 20] };
}

/**
 * Where a plaque's impact sculpture stands: beside the plaque, deeper into the room, so walking in
 * you read the plaque first; outside the walkway.
 */
export function plinthPosition(slot, plan = PLAN) {
  return [slot.side * (slot.u + plan.plaque.w / 2 + 0.75), slot.roomZ + slot.wall * (plan.room.width / 2 - 0.9)];
}

/** Where a plaque's spotlight falls: between the plaque and its sculpture. */
export const spotPosition = (slot, plan = PLAN) => [slot.side * (slot.u + 0.8), slot.roomZ + slot.wall * (plan.room.width / 2 - 0.9)];

// ---------- walls, floors and where the visitor may walk ----------

const box = (xa, xb, za, zb) => ({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb) });

/** Floor rectangles: the spine, each side corridor and each room. */
export function floorRects(layout, plan = PLAN) {
  const h = plan.spine / 2;
  const c = plan.corridor.width / 2;
  const r = plan.room.width / 2;
  return [
    box(-h, h, layout.end, layout.back),
    ...layout.rooms.flatMap((room) => [box(room.side * h, room.side * room.u0, room.z - c, room.z + c), box(room.side * room.u0, room.side * room.u1, room.z - r, room.z + r)]),
  ];
}

/** Rectangles the visitor's eye may be in; they overlap where spaces connect. */
export function walkRects(layout, plan = PLAN) {
  const m = plan.margin;
  const h = plan.spine / 2;
  return [
    box(-h + m, h - m, layout.end + m, layout.back - m),
    ...layout.rooms.flatMap((room) => [
      box(room.side * (h - 0.6), room.side * (room.u0 + 0.6), room.z - plan.lane, room.z + plan.lane),
      box(room.side * (room.u0 - 0.1), room.side * (room.u1 - m), room.z - plan.walk, room.z + plan.walk),
    ]),
  ];
}

const inRect = (r, [x, z]) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
export const inside = (rects, p) => rects.some((r) => inRect(r, p));

/** Move from `prev` towards `next`, sliding along walls: try the full step, then each axis alone. */
export function slide(prev, next, rects) {
  if (inside(rects, next)) return next;
  const alongX = [next[0], prev[1]];
  if (inside(rects, alongX)) return alongX;
  const alongZ = [prev[0], next[1]];
  return inside(rects, alongZ) ? alongZ : prev;
}

/** Parts of [a, b] left after cutting out `gaps` ([from, to] pairs inside it). */
export function splitSpan(a, b, gaps) {
  const out = [];
  let at = a;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > at) out.push([at, g0]);
    at = Math.max(at, g1);
  }
  if (b > at) out.push([at, b]);
  return out;
}

const wallZ = (x0, x1, z, nz) => ({ x: (x0 + x1) / 2, z, len: Math.abs(x1 - x0), rotY: nz > 0 ? 0 : Math.PI });
const wallX = (z0, z1, x, nx) => ({ x, z: (z0 + z1) / 2, len: Math.abs(z1 - z0), rotY: nx > 0 ? Math.PI / 2 : -Math.PI / 2 });

/**
 * Wall panels: centre (x, z), length, and rotY so that a plane facing +z turns to face the space
 * it bounds. Openings are left where side corridors meet the spine and the rooms.
 */
export function wallSegments(layout, plan = PLAN) {
  const h = plan.spine / 2;
  const c = plan.corridor.width / 2;
  const r = plan.room.width / 2;
  const out = [wallZ(-h, h, layout.end, 1), wallZ(-h, h, layout.back, -1)];
  for (const side of [-1, 1]) {
    const gaps = layout.rooms.filter((room) => room.side === side).map((room) => [room.z - c, room.z + c]);
    for (const [z0, z1] of splitSpan(layout.end, layout.back, gaps)) out.push(wallX(z0, z1, side * h, -side));
  }
  for (const room of layout.rooms) {
    const s = room.side;
    for (const v of [-1, 1]) {
      out.push(wallZ(s * h, s * room.u0, room.z + v * c, -v));
      out.push(wallZ(s * room.u0, s * room.u1, room.z + v * r, -v));
    }
    for (const [z0, z1] of splitSpan(room.z - r, room.z + r, [[room.z - c, room.z + c]])) out.push(wallX(z0, z1, s * room.u0, s));
    out.push(wallX(room.z - r, room.z + r, s * room.u1, -s));
  }
  return out;
}

// ---------- finding the way ----------

/** Index of the room whose side corridor or room contains [x, z], or -1 (spine or lobby). */
export function locate(layout, [x, z], plan = PLAN) {
  if (Math.abs(x) <= plan.spine / 2) return -1;
  const side = Math.sign(x);
  const room = layout.rooms.find((r) => r.side === side && Math.abs(z - r.z) <= plan.room.width / 2);
  return room ? room.index : -1;
}

/** Index of the plaque in room `roomIndex` whose viewpoint is closest to [x, z], or -1. */
export function nearestInRoom(layout, roomIndex, [x, z]) {
  let best = -1;
  let bestD = Infinity;
  layout.slots.forEach((s, i) => {
    if (s.roomIndex !== roomIndex) return;
    const [vx, , vz] = viewpoint(s).pos;
    const d = Math.hypot(vx - x, vz - z);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Waypoints ([x, z], not including `from`) from one point to another through corridors, never through walls. */
export function pathBetween(layout, from, to, plan = PLAN) {
  const a = locate(layout, from, plan);
  const b = locate(layout, to, plan);
  if (a >= 0 && a === b) return [to];
  const junction = (i) => [0, layout.rooms[i].z];
  const entrance = (i) => roomPoint(layout.rooms[i], layout.rooms[i].u0 + 1.2, 0);
  const pts = [];
  if (a >= 0) {
    if (Math.abs(from[0]) > layout.rooms[a].u0) pts.push(entrance(a));
    pts.push(junction(a));
  }
  if (b >= 0) pts.push(junction(b), entrance(b));
  pts.push(to);
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}

export const polylineLength = (pts) => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

/** Point at distance `d` along a polyline, with the yaw of the segment it is on (facing the way of travel). */
export function pointAlong(pts, d) {
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (len === 0) continue;
    const yaw = Math.atan2(-(bx - ax), -(bz - az));
    if (left <= len || i === pts.length - 1) {
      const k = Math.min(1, left / len);
      return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, yaw };
    }
    left -= len;
  }
  return { x: pts[0][0], z: pts[0][1], yaw: 0 };
}

/** Walks longer than this (metres) fade out and in instead: a long glide is slow and can make people queasy. */
export const FADE_DISTANCE = 24;
/** Walking speed between plaques, m/s, and the shortest walk in seconds. */
export const WALK_SPEED = 6;
export const walkSeconds = (length) => Math.max(0.6, length / WALK_SPEED);

/**
 * Camera pose `t` (0..1) of the way along `path` (starting at the current position): turn towards
 * the way of travel at first, face along the corridors, then turn to the target view at the end.
 */
export function tweenPose(path, start, target, t) {
  const k = ease(t);
  const p = pointAlong(path, k * polylineLength(path));
  const out = clamp((t - 0.6) / 0.4, 0, 1);
  const into = clamp(t / 0.15, 0, 1);
  const travel = lerpAngle(start.yaw, p.yaw, into);
  return {
    x: p.x,
    z: p.z,
    yaw: lerpAngle(travel, target.yaw, out),
    pitch: start.pitch * (1 - into) + target.pitch * out,
  };
}

/** Vertical field of view (degrees) that fits a whole plaque at any aspect ratio: portrait phones widen it. */
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

/** Ease in-out, t in 0..1. */
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Previous / next plaque, clamped to the collection. From the lobby (-1), next is the first. */
export const stepIndex = (i, delta, count) => clamp(i + delta, 0, count - 1);

/** Where a URL hash starts the visit: an exhibit (`#<id>`), a room (`#room-<key>`), or null (the lobby). */
export function startFor(layout, hash) {
  const id = decodeURIComponent((hash ?? "").replace(/^#/, ""));
  const room = layout.rooms.findIndex((r) => `room-${r.key}` === id);
  if (room >= 0) return { room };
  const exhibit = layout.slots.findIndex((s) => s.id === id);
  return exhibit >= 0 ? { exhibit } : null;
}

/** Two lines for short captions like "Next exhibit: suggest one": break after the colon, keep it on the first line. */
export function splitAtColon(text) {
  const m = text.match(/^(.*?[:：])\s*(.+)$/);
  return m ? [m[1], m[2]] : [text];
}

/** Text of the sign hanging in the spine before a side corridor: an arrow on the side it turns to. */
export const signText = (name, side) => (side < 0 ? `← ${name}` : `${name} →`);

/** The installation in each room's side corridor; rooms added later get the network rack. */
export const CORRIDOR_PROPS = { routing: "rack", config: "rollout", human: "keyboard", numbers: "counter", time: "clocks" };
export const propFor = (key) => CORRIDOR_PROPS[key] ?? "rack";

/** Which wall of a side corridor holds the installation (-1 = deeper, +1 = lobby side); the data wall faces it. */
export const propWall = (room) => (room.index % 2 === 0 ? 1 : -1);

// ---------- impact sculpture ----------

/** Nodes of the impact sculpture, bottom to top. */
export const NODES = 5;

/**
 * How red each sculpture node is, bottom to top: 1, 0.5 (top half red) or 0. One node per 2 points,
 * rounded to the nearest whole point, so it matches the home page's dots within half a node.
 */
export function nodeFill(score) {
  const red = Math.round(score) / 2;
  return Array.from({ length: NODES }, (_, k) => clamp(red - k, 0, 1));
}

/**
 * Which half of a node is red for its fill (from nodeFill): red rises from the bottom like a level,
 * so a half node is red below and unlit above, and the colour changes only once up the sculpture.
 */
export const hemispheres = (fill) => ({ bottom: fill > 0, top: fill === 1 });

/** Whether the rod between two nodes (fills below and above) is red: only where red continues upwards. */
export const rodLit = (below, above) => below === 1 && above > 0;

/** Sculpture nodes: a fixed spiral rising from the plinth top. Local [x, y, z]. */
export function routePoints(count = NODES, { base = 1.1, rise = 0.95, radius = 0.26, turn = 1.25 } = {}) {
  return Array.from({ length: count }, (_, k) => {
    const a = k * turn;
    const y = base + (count > 1 ? (rise * k) / (count - 1) : 0);
    return [Math.round(Math.cos(a) * radius * 1000) / 1000, Math.round(y * 1000) / 1000, Math.round(Math.sin(a) * radius * 1000) / 1000];
  });
}

// ---------- posters ----------

/** Poster images of the 3D hall: one view, used above the Enter button. */
export const posterKeys = () => ["hall"];
export const POSTER_WIDTHS = [480, 960];
export const POSTER_HEIGHT = (w) => Math.round((w * 9) / 16);
export const posterPath = (key, w) => `/posters/${key}-${w}.webp`;

/** `?poster=<key>` (used by `pnpm build --posters`), or null for a normal visit. */
export function posterParam(search) {
  const key = new URLSearchParams(search ?? "").get("poster");
  return posterKeys().includes(key) ? key : null;
}

/** Camera for the poster: inside the room with the most exhibits (the first, on a tie), from its entrance. */
export function posterView(layout, plan = PLAN) {
  const room = layout.rooms.reduce((a, b) => (b.count > a.count ? b : a));
  const { pos, look } = roomView(room, plan);
  return { pos: [pos[0] - room.side * 0.4, plan.eye + 0.25, pos[2]], look: [look[0], plan.eye - 0.1, look[2]] };
}

// ---------- map ----------

/** Schematic map geometry (SVG units): spine down the middle, lobby at the bottom, end at the top. */
export function mapGeometry(layout) {
  const n = layout.rooms.length;
  const top = 34;
  const ys = layout.rooms.map((_, i) => top + 44 + (n - 1 - i) * 56);
  const lobby = (ys[0] ?? top + 44) + 44;
  return { w: 320, cx: 160, branch: 44, end: top, lobby, ys, h: lobby + 34 };
}

/** Map position of a point in the hall: along the spine by z, out along a branch by distance into the side corridor. */
export function mapPoint(layout, [x, z], plan = PLAN) {
  const g = mapGeometry(layout);
  const i = locate(layout, [x, z], plan);
  if (i >= 0) {
    const room = layout.rooms[i];
    const t = clamp((Math.abs(x) - plan.spine / 2) / (room.u0 + 1 - plan.spine / 2), 0, 1);
    return [Math.round(g.cx + room.side * g.branch * t), g.ys[i]];
  }
  const stops = [[layout.back, g.lobby], ...layout.rooms.map((r, k) => [r.z, g.ys[k]]), [layout.end, g.end]];
  const zc = clamp(z, layout.end, layout.back);
  for (let k = 1; k < stops.length; k++) {
    const [za, ya] = stops[k - 1];
    const [zb, yb] = stops[k];
    if (zc >= zb) return [g.cx, Math.round(ya + ((yb - ya) * (za - zc)) / (za - zb))];
  }
  return [g.cx, g.end];
}

// Rough text widths for map labels (13 px serif): Latin ~7 px, CJK 13 px.
const labelWidth = (s) => [...s].reduce((n, ch) => n + (WIDE.test(ch) ? 13 : 7), 0);

/**
 * The map as inline SVG: the route as a dashed line, a node per room with its exhibit count and
 * name, the entrance and the end. Each room links to `#room-<key>` (the room list below it; the 3D
 * hall walks there). `.map-you` is the "you are here" dot, placed by hall-scene.js.
 */
export function mapSvg(layout, rooms, lang = "en", cls = "hall-map") {
  const t = STRINGS[lang];
  const g = mapGeometry(layout);
  // The corner minimap is decorative for assistive tech (aria-hidden), so its links stay out of the tab order.
  const mini = cls.includes("mini");
  const branches = layout.rooms
    .map((room, i) => {
      const y = g.ys[i];
      const nx = g.cx + room.side * g.branch;
      const lx = g.cx + room.side * (g.branch + 18);
      const lines = wrapLines(rooms[room.key], g.cx - g.branch - 26, labelWidth);
      const y0 = y - ((lines.length - 1) * 15) / 2 + 5;
      const label = lines.map((l, k) => `<tspan x="${lx}" y="${y0 + k * 15}">${esc(l)}</tspan>`).join("");
      const name = fmt(t.hallTimeline, { room: rooms[room.key], n: room.count });
      return `<a class="map-room" href="#room-${esc(room.key)}"${mini ? ' tabindex="-1"' : ""} data-room="${esc(room.key)}" aria-label="${esc(name)}"><rect class="map-hit" x="${room.side < 0 ? 0 : g.cx}" y="${y - 28}" width="${g.cx}" height="56"/><path class="map-route" d="M${g.cx} ${y}H${nx}"/><circle class="map-node" cx="${nx}" cy="${y}" r="11"/><text class="map-count" x="${nx}" y="${y + 4}" text-anchor="middle">${room.count}</text><text class="map-label" text-anchor="${room.side < 0 ? "end" : "start"}">${label}</text></a>`;
    })
    .join("");
  return `<svg class="${cls}" viewBox="0 0 ${g.w} ${g.h}" role="group" aria-label="${esc(t.hallMapHeading)}"><path class="map-route" d="M${g.cx} ${g.lobby}V${g.end}"/><path class="map-end" d="M${g.cx - 18} ${g.end}H${g.cx + 18}"/><text class="map-cap" x="${g.cx}" y="${g.end - 12}" text-anchor="middle">${esc(t.hallEnd)}</text><circle class="map-lobby" cx="${g.cx}" cy="${g.lobby}" r="5"/><text class="map-cap" x="${g.cx}" y="${g.lobby + 24}" text-anchor="middle">${esc(t.hallEntrance)}</text>${branches}<circle class="map-you" cx="${g.cx}" cy="${g.lobby}" r="6" hidden/></svg>`;
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

/** Text blocks of a plaque, top to bottom. Blocks marked `bottom` sit bottom-left, beside the radar. */
export function plaqueBlocks(e, { no, rooms, lang = "en" }) {
  const t = STRINGS[lang];
  const score = impactScore(e);
  const hops = e.hops.map((h, i) => {
    const last = i === e.hops.length - 1;
    return { text: last ? `${h} ✕` : h, lead: String(i + 1).padStart(2, "0"), indent: 52, size: 32, color: last ? FAIL : INK, weight: last ? 700 : 400, before: i === 0 ? 24 : 8 };
  });
  return [
    { text: `${fmt(t.plaqueNo, { no: String(no).padStart(3, "0") })} · ${rooms[e.room]}`, family: "mono", size: 24, color: LABEL },
    { text: e.title, size: 54, weight: 700, color: INK, before: 12, lineHeight: 1.15 },
    { text: fmt(t.impact, { score: score.toFixed(1) }), pips: score, size: 30, color: FAIL, before: 10 },
    { text: `${e.date} · ${e.duration}`, size: 28, color: META, before: 6 },
    ...hops,
    { text: e.lesson, size: 30, color: INK, italic: lang !== "zh", bottom: true },
    { text: `${t.source}${e.source}`, size: 22, color: LABEL, before: 14, bottom: true },
  ];
}

/** Radar box on a plaque (px at scale 1, the viewBox of RADAR in museum.js scaled up). */
export const PLAQUE_RADAR = { w: 380, h: 297 };

/** Width of the five impact dots drawn before a `pips` line (cell = 0.9 em, as on the home page's 14 px cells). */
export const pipsWidth = (size) => size * 0.9 * 5 + size * 0.4;

/** Data wall of a side corridor: the room's exhibits, oldest first, with their impact. */
export function timelineBlocks(exhibits, roomKey, rooms, lang = "en") {
  const t = STRINGS[lang];
  const here = sortExhibits(exhibits.filter((e) => e.room === roomKey), "date-asc");
  return [
    { text: fmt(t.hallTimeline, { room: rooms[roomKey], n: here.length }), size: 44, weight: 700, color: INK, lineHeight: 1.2 },
    ...here.flatMap((e) => [
      { text: e.title, lead: e.date.slice(0, 4), indent: 110, size: 34, color: INK, before: 26 },
      { text: fmt(t.impact, { score: impactScore(e).toFixed(1) }), pips: impactScore(e), indent: 110, size: 26, color: FAIL, before: 4 },
    ]),
  ];
}

/** Lobby panel: how to read a plaque. */
export function legendBlocks(lang = "en") {
  const t = STRINGS[lang];
  const item = (lead, text, color = INK) => ({ text, lead, indent: 90, size: 32, color, before: 20 });
  return [
    { text: t.hallLegendTitle, size: 46, weight: 700, color: INK },
    item("01", t.hallLegendHops),
    item("✕", t.hallLegendFail, FAIL),
    item("●", t.hallLegendImpact),
    item("▲", t.hallLegendSculpture),
  ];
}

/** Lobby panel opposite the legend: the museum's no-blame rule. */
export const ruleBlocks = (lang = "en") => [
  { text: STRINGS[lang].museum, family: "mono", size: 26, color: LABEL },
  { text: STRINGS[lang].impactNoBlame, size: 40, color: INK, italic: lang !== "zh", before: 18, lineHeight: 1.4 },
];

/** CSS font string for a block at `scale`. `families` = { serif, mono }. */
export function fontCss(block, scale, families) {
  const px = Math.round(block.size * scale);
  return `${block.italic ? "italic " : ""}${block.weight ?? 400} ${px}px ${families[block.family ?? "serif"]}`;
}

function place(blocks, width, box, measure, scale, top) {
  const lines = [];
  let y = top;
  for (const b of blocks) {
    y += (b.before ?? 0) * scale;
    const font = fontCss(b, scale, box.families);
    const lh = b.size * scale * (b.lineHeight ?? 1.32);
    const indent = (b.indent ?? 0) * scale;
    const lead = b.lead ? indent : 0;
    const dots = b.pips === undefined ? 0 : pipsWidth(b.size * scale);
    const wrapped = wrapLines(b.text, width - lead - dots, (s) => measure(s, font));
    wrapped.forEach((text, i) => {
      if (i === 0 && b.lead) lines.push({ text: b.lead, x: box.pad, y: Math.round(y), font: fontCss({ ...b, family: "mono", weight: 400, size: b.size * 0.8 }, scale, box.families), color: LABEL });
      if (i === 0 && dots) lines.push({ pips: b.pips, x: Math.round(box.pad + indent), y: Math.round(y), size: Math.round(b.size * scale) });
      lines.push({ text, x: Math.round(box.pad + indent + dots), y: Math.round(y), font, color: b.color });
      y += lh;
    });
  }
  return { lines, bottom: y };
}

/**
 * Lay out blocks in a box ({ width, height, pad, families }), shrinking the type until it fits.
 * Lines are positioned by their top edge (canvas textBaseline "top"). `measure(text, font)` → px.
 * Without `reserve`, the text is centred vertically. With `reserve` ({ w, h } at scale 1), blocks
 * marked `bottom` go bottom-left, a box of that size (returned as `aside`) bottom-right, and a rule
 * above both.
 */
export function layoutPlaque(blocks, box, measure, { minScale = 0.5, reserve = null } = {}) {
  const inner = box.width - 2 * box.pad;
  for (let scale = 1; ; scale = Math.max(minScale, scale * 0.94)) {
    const last = scale === minScale;
    if (!reserve) {
      const out = place(blocks, inner, box, measure, scale, box.pad);
      if (out.bottom > box.height - box.pad && !last) continue;
      const shift = Math.max(0, Math.round((box.height - box.pad - out.bottom) / 2));
      return { scale, lines: out.lines.map((l) => ({ ...l, y: l.y + shift })), rules: [], aside: null, bottom: out.bottom + shift };
    }
    const main = place(blocks.filter((b) => !b.bottom), inner, box, measure, scale, box.pad);
    const gap = 28 * scale;
    // Grow the box into spare space (up to 1.6x), keeping at least a third of the width for text beside it.
    for (let grow = 1.6; grow > 0.95; grow -= 0.1) {
      const aw = Math.min(reserve.w * scale * grow, inner * 0.66);
      const ah = (aw / reserve.w) * reserve.h;
      const low = place(blocks.filter((b) => b.bottom), inner - aw - gap, box, measure, scale, 0);
      const sectionTop = box.height - box.pad - Math.max(ah, low.bottom);
      if (main.bottom + gap > sectionTop && (grow > 1.05 || !last)) continue;
      return {
        scale,
        lines: [...main.lines, ...low.lines.map((l) => ({ ...l, y: Math.round(l.y + sectionTop) }))],
        rules: [Math.round(sectionTop - gap / 2)],
        aside: { x: Math.round(box.width - box.pad - aw), y: Math.round(box.height - box.pad - ah), w: Math.round(aw), h: Math.round(ah) },
        bottom: box.height - box.pad,
      };
    }
  }
}

// ---------- page markup pieces (prerendered by scripts/site.js) ----------

/** Buttons of the map dialog's exhibit list, grouped by room, in walk order. */
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

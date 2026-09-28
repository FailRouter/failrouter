import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { EXHIBITS, ROOM_NAMES, ROOMS } from "../public/exhibits.js";
import { STRINGS, localizeExhibits } from "../public/i18n.js";
import { impactScore, pipsFill } from "../public/museum.js";
import * as H from "../public/hall.js";

const KEYS = Object.keys(ROOMS);
const ex = (id, room, date) => ({ id, room, date, title: id, hops: ["a", "b", "c"] });
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
// Monospace stand-in for canvas measureText: Latin 10 px, CJK 20 px.
const mono = (s) => [...s].reduce((n, ch) => n + (/[\u2e80-\uffef]/.test(ch) ? 20 : 10), 0);

describe("walk order and floor plan", () => {
  const list = [ex("a", "config", "2020-01-01"), ex("b", "routing", "2019-01-01"), ex("c", "routing", "2021-01-01"), ex("d", "config", "2022-01-01"), ex("e", "config", "2018-01-01")];
  const keys = ["routing", "time", "config"];
  const order = H.walkOrder(list, keys);
  const layout = H.hallLayout(order, keys);
  const [r0, r1] = layout.rooms;

  test("rooms in the given order, newest first inside a room", () => {
    assert.deepEqual(order.map((e) => e.id), ["c", "b", "d", "a", "e"]);
  });
  test("rooms without exhibits get no room; rooms alternate left and right down the spine", () => {
    assert.deepEqual(layout.rooms.map((r) => [r.key, r.side, r.z]), [["routing", -1, H.PLAN.firstJunction], ["config", 1, H.PLAN.firstJunction - H.PLAN.gap]]);
    assert.equal(r0.u0, H.PLAN.spine / 2 + H.PLAN.corridor.length);
    assert.equal(r0.u1 - r0.u0, H.PLAN.room.pad + H.PLAN.room.slot + H.PLAN.room.tail, "one row");
    assert.equal(r1.u1 - r1.u0, H.PLAN.room.pad + 2 * H.PLAN.room.slot + H.PLAN.room.tail, "two rows");
    assert.equal(layout.end, r1.z - H.PLAN.endPad);
    assert.deepEqual(H.hallLayout([], keys).rooms, []);
  });
  test("plaques face each other across the room, two per row, deeper rows further out", () => {
    const [c, b, d, a, e] = layout.slots;
    assert.deepEqual([c.wall, b.wall, d.wall, a.wall, e.wall], [-1, 1, -1, 1, -1]);
    assert.equal(c.u, b.u);
    assert.equal(e.u - d.u, H.PLAN.room.slot);
    assert.equal(c.x, -c.u, "left room: x < 0");
    assert.equal(d.x, d.u, "right room: x > 0");
    assert.equal(c.z, r0.z - H.PLAN.room.width / 2);
    assert.equal(b.z, r0.z + H.PLAN.room.width / 2);
    assert.deepEqual([c.rotY, b.rotY], [0, Math.PI]);
  });
  test("same-side rooms never overlap", () => {
    const real = H.hallLayout(H.walkOrder(EXHIBITS, KEYS), KEYS);
    for (const side of [-1, 1]) {
      const zs = real.rooms.filter((r) => r.side === side).map((r) => r.z);
      for (let i = 1; i < zs.length; i++) assert.ok(zs[i - 1] - zs[i] >= H.PLAN.room.width + 1, `${side}: ${zs}`);
    }
  });
  test("the real collection: every exhibit hung once, all five rooms", () => {
    const real = H.hallLayout(H.walkOrder(EXHIBITS, KEYS), KEYS);
    assert.deepEqual(real.slots.map((s) => s.id).sort(), EXHIBITS.map((e) => e.id).sort());
    assert.deepEqual(real.rooms.map((r) => r.key), KEYS);
  });
  test("viewpoint stands across the room, inside the walkway, and looks at the plaque", () => {
    const [c] = layout.slots;
    const v = H.viewpoint(c);
    assert.deepEqual(v.look, [c.x, H.PLAN.plaque.y, c.z]);
    near(v.pos[2], r0.z + H.PLAN.view.across);
    near(v.pos[0], -(c.u + H.PLAN.view.along));
    assert.ok(H.inside(H.walkRects(layout), [v.pos[0], v.pos[2]]));
    near(Math.hypot(v.pos[0] - c.x, v.pos[2] - c.z), H.viewDistance());
  });
  test("sculpture and spotlight stand beside the plaque, deeper in, outside the walkway", () => {
    const b = layout.slots[1];
    const [x, z] = H.plinthPosition(b);
    near(x, -(b.u + H.PLAN.plaque.w / 2 + 0.75));
    near(z, r0.z + 3.1);
    assert.ok(!H.inside(H.walkRects(layout), [x, z - 0.4]), "plinth edge outside the walkway");
    assert.deepEqual(H.spotPosition(b), [-(b.u + 0.8), r0.z + 3.1]);
  });
  test("room view and lobby view look where you walk", () => {
    const rv = H.roomView(r1);
    assert.deepEqual(rv.pos, [r1.u0 + 0.6, H.PLAN.eye, r1.z]);
    assert.equal(rv.look[0], r1.u1);
    const lobby = H.lobbyView(layout);
    assert.ok(lobby.pos[2] < layout.back && lobby.look[2] < lobby.pos[2]);
  });
  test("poster: inside the fullest room, from its entrance; only known poster keys", () => {
    const pv = H.posterView(layout);
    assert.ok(pv.pos[0] > r1.u0 - 1 && pv.look[0] === r1.u1, "config has the most exhibits");
    assert.equal(H.posterParam("?poster=hall"), "hall");
    assert.equal(H.posterParam("?poster=lobby"), null);
    assert.equal(H.posterParam(undefined), null);
    assert.equal(H.posterPath("hall", 480), "/posters/hall-480.webp");
    assert.equal(H.POSTER_HEIGHT(960), 540);
    assert.deepEqual(H.posterKeys(), ["hall"]);
  });
  test("startFor: an exhibit, a room, or the lobby", () => {
    assert.deepEqual(H.startFor(layout, "#d"), { exhibit: 2 });
    assert.deepEqual(H.startFor(layout, "#room-config"), { room: 1 });
    assert.equal(H.startFor(layout, "#room-time"), null, "a room without exhibits");
    assert.equal(H.startFor(layout, "#nope"), null);
    assert.equal(H.startFor(layout, undefined), null);
    for (const e of EXHIBITS) assert.ok(!e.id.startsWith("room-"), `${e.id} would clash with a room anchor`);
  });
  test("splitAtColon breaks short captions after the colon", () => {
    assert.deepEqual(H.splitAtColon(STRINGS.en.hallSuggestFrame), ["Next exhibit:", "suggest one"]);
    assert.deepEqual(H.splitAtColon(STRINGS.zh.hallSuggestFrame), ["下一件展品：", "欢迎推荐"]);
    assert.deepEqual(H.splitAtColon("plain"), ["plain"]);
  });
  test("signs point to the side the corridor turns to; each corridor gets an installation", () => {
    assert.equal(H.signText("A", -1), "← A");
    assert.equal(H.signText("A", 1), "A →");
    assert.deepEqual(KEYS.map(H.propFor), ["rack", "rollout", "keyboard", "counter", "clocks"]);
    assert.equal(H.propFor("new-room"), "rack");
    assert.deepEqual(layout.rooms.map(H.propWall), [1, -1]);
  });
});

describe("walls, floors and walking", () => {
  const layout = H.hallLayout(H.walkOrder(EXHIBITS, KEYS), KEYS);
  const rects = H.walkRects(layout);
  const [r0, r1] = layout.rooms;
  test("splitSpan cuts gaps out of a span", () => {
    assert.deepEqual(H.splitSpan(0, 10, [[6, 7], [2, 3]]), [[0, 2], [3, 6], [7, 10]]);
    assert.deepEqual(H.splitSpan(0, 10, [[0, 2], [8, 10]]), [[2, 8]]);
    assert.deepEqual(H.splitSpan(0, 10, []), [[0, 10]]);
  });
  test("floor: the spine plus a corridor and a room per room", () => {
    assert.equal(H.floorRects(layout).length, 1 + 2 * layout.rooms.length);
  });
  test("walls: end, back, spine sides with openings, and four sides of every corridor and room", () => {
    const walls = H.wallSegments(layout);
    const left = layout.rooms.filter((r) => r.side < 0).length;
    const right = layout.rooms.length - left;
    assert.equal(walls.length, 2 + (left + 1) + (right + 1) + layout.rooms.length * 7);
    const total = (x) => walls.filter((w) => Math.abs(w.x - x) < 1e-9 && w.rotY === Math.PI / 2).reduce((n, w) => n + w.len, 0);
    near(total(-H.PLAN.spine / 2), layout.back - layout.end - left * H.PLAN.corridor.width);
    assert.ok(walls.every((w) => w.len > 0));
    const end = walls[0];
    assert.deepEqual([end.z, end.rotY, end.len], [layout.end, 0, H.PLAN.spine]);
  });
  test("walkable: spine, corridors and rooms connect; walls and plinths don't", () => {
    assert.ok(H.inside(rects, [0, 0]));
    assert.ok(H.inside(rects, [-(H.PLAN.spine / 2), r0.z]), "corridor mouth");
    assert.ok(H.inside(rects, [-r0.u0, r0.z]), "room entrance");
    assert.ok(!H.inside(rects, [-(H.PLAN.spine / 2), r0.z + 2]), "spine wall beside the corridor");
    assert.ok(!H.inside(rects, [-(r0.u0 + 3), r0.z + 3.1]), "plinth row");
    assert.ok(!H.inside(rects, [0, layout.end]), "end wall");
  });
  test("slide: full step, then along one axis, else stay", () => {
    assert.deepEqual(H.slide([0, 0], [0.5, -1], rects), [0.5, -1]);
    assert.deepEqual(H.slide([1.9, 0], [2.5, -1], rects), [1.9, -1], "slides along the spine wall");
    assert.deepEqual(H.slide([0, 0], [10, 10], rects), [0, 0]);
    assert.deepEqual(H.slide([0, layout.back - 1], [0.3, layout.back], rects), [0.3, layout.back - 1]);
  });
  test("locate: spine, corridor and room", () => {
    assert.equal(H.locate(layout, [0, r0.z]), -1);
    assert.equal(H.locate(layout, [-5, r0.z]), 0);
    assert.equal(H.locate(layout, [r1.u0 + 2, r1.z + 3]), 1);
    assert.equal(H.locate(layout, [5, r0.z]), -1, "no room on that side there");
  });
  test("nearestInRoom picks the plaque whose viewpoint is closest", () => {
    const k = layout.slots.findIndex((s) => s.roomIndex === 1);
    const [x, , z] = H.viewpoint(layout.slots[k]).pos;
    assert.equal(H.nearestInRoom(layout, 1, [x, z]), k);
    assert.equal(H.nearestInRoom(layout, 99, [0, 0]), -1);
  });
  test("pathBetween goes through the junctions and corridors, never through walls", () => {
    const a = H.viewpoint(layout.slots[0]).pos;
    const b = H.viewpoint(layout.slots.find((s) => s.roomIndex === 1)).pos;
    const path = [[a[0], a[2]], ...H.pathBetween(layout, [a[0], a[2]], [b[0], b[2]])];
    assert.deepEqual(path.slice(1, -1), [[-(r0.u0 + 1.2), r0.z], [0, r0.z], [0, r1.z], [r1.u0 + 1.2, r1.z]]);
    for (let i = 1; i < path.length; i++) {
      for (let k = 0; k <= 20; k++) {
        const p = [path[i - 1][0] + ((path[i][0] - path[i - 1][0]) * k) / 20, path[i - 1][1] + ((path[i][1] - path[i - 1][1]) * k) / 20];
        assert.ok(H.inside(rects, p), `segment ${i} leaves the walkable area at ${p}`);
      }
    }
    assert.deepEqual(H.pathBetween(layout, [a[0], a[2]], [a[0] - 1, a[2]]), [[a[0] - 1, a[2]]], "same room: straight");
    assert.deepEqual(H.pathBetween(layout, [0, 3], [0, -10]), [[0, -10]], "along the spine");
    assert.deepEqual(H.pathBetween(layout, [-5, r0.z], [0, 3]), [[0, r0.z], [0, 3]], "from a corridor, no detour into the room");
    assert.deepEqual(H.pathBetween(layout, [0, 3], [-5, r0.z]), [[0, r0.z], [-5, r0.z]], "into a corridor, no detour into the room");
  });
  const walkable = (path) => {
    for (let i = 1; i < path.length; i++) {
      for (let k = 0; k <= 40; k++) {
        const p = [path[i - 1][0] + ((path[i][0] - path[i - 1][0]) * k) / 40, path[i - 1][1] + ((path[i][1] - path[i - 1][1]) * k) / 40];
        assert.ok(H.inside(rects, p), `segment ${i} leaves the walkable area at ${p}`);
      }
    }
  };
  test("pathBetween inside one room goes through the doorway between its corridor and the room", () => {
    const from = [-(H.PLAN.spine / 2 + 0.5), r0.z + H.PLAN.lane];
    const to = [-(r0.u0 + 1), r0.z + H.PLAN.walk];
    const path = H.pathBetween(layout, from, to);
    assert.deepEqual(path, [[-r0.u0, r0.z], to]);
    walkable([from, ...path]);
    walkable([to, ...H.pathBetween(layout, to, from)]);
  });
  test("nearestWalkable keeps walkable points and pulls others to the closest walkable point", () => {
    assert.deepEqual(H.nearestWalkable(rects, [0, 0]), [0, 0]);
    const h = H.PLAN.spine / 2 - H.PLAN.margin;
    assert.deepEqual(H.nearestWalkable(rects, [10, 0]), [h, 0], "past the spine wall, no room there");
    assert.deepEqual(H.nearestWalkable(rects, [-(r0.u0 + 3), r0.z + 3.9]), [-(r0.u0 + 3), r0.z + H.PLAN.walk], "at a room wall");
    for (let x = -30; x <= 30; x += 2.5) for (let z = layout.end - 3; z <= layout.back + 3; z += 2.5) assert.ok(H.inside(rects, H.nearestWalkable(rects, [x, z])));
    assert.deepEqual(H.nearestWalkable([], [1, 2]), [1, 2]);
  });
  test("floorTarget walks to the nearest walkable point, facing the way of the walk, eyes level", () => {
    const h = H.PLAN.spine / 2 - H.PLAN.margin;
    const t = H.floorTarget(layout, rects, [h, layout.back - 1], [5, -6]);
    assert.deepEqual([t.x, t.z, t.pitch], [h, -6, 0], "past the spine wall: pulled onto the walkway");
    near(t.yaw, 0);
    near(H.floorTarget(layout, rects, [0, 0], [0, -5]).yaw, 0, 1e-9);
    assert.equal(H.floorTarget(layout, rects, [0, 0], [0.1, -0.2]), null, "too close to walk");
  });
  test("floorTarget stops STAND_OFF short of a wall straight ahead, not one met at a glance", () => {
    const t = H.floorTarget(layout, rects, [0, 0], [0, layout.end + 0.2]);
    near(t.z, layout.end + H.STAND_OFF, 0.06);
    near(t.yaw, 0);
    const room = H.roomView(r0).pos;
    const deep = H.floorTarget(layout, rects, [room[0], room[2]], [-(r0.u1 - 0.1), r0.z]);
    near(deep.x, -(r0.u1 - H.STAND_OFF), 0.06);
    near(deep.z, r0.z);
    assert.equal(H.floorTarget(layout, rects, [0, layout.end + 2], [0, layout.end + 0.2]), null, "already close: stays");
    // A diagonal walk that meets a side wall at a glance goes all the way.
    const from = [0, layout.back - 1];
    const side = H.floorTarget(layout, rects, from, [-(r0.u0 + 3), r0.z + 3.5]);
    near(side.x, -(r0.u0 + 3));
    near(side.z, r0.z + H.PLAN.walk, 1e-9);
    const floors = H.floorRects(layout);
    assert.deepEqual(H.clearance(floors, [0, 0], 0, 3), { dist: 3, headOn: false }, "open floor");
    const end = H.clearance(floors, [0, layout.end + 1], 0);
    near(end.dist, 1, 0.051);
    assert.equal(end.headOn, true, "end wall, straight on");
    assert.equal(H.clearance(floors, [0, layout.end + 0.3], -1.2).headOn, false, "end wall, at a glance");
    assert.equal(H.clearance(floors, [0, 0], -Math.PI / 2 - 0.2).headOn, true, "side wall, nearly straight on");
    assert.equal(H.clearance(floors, [0, 0], -0.3, 30).headOn, false, "side wall, at a glance");
  });
  test("hitIntent: objects are picked, the floor is walked on, walls do nothing", () => {
    assert.equal(H.hitIntent({ action: { index: 0 } }), "pick");
    assert.equal(H.hitIntent({ floor: true }), "walk");
    assert.equal(H.hitIntent({}), "none");
    assert.equal(H.hitIntent(undefined), "none");
  });
  test("polylineLength, pointAlong and tweenPose", () => {
    const pts = [[0, 0], [0, -4], [3, -4]];
    assert.equal(H.polylineLength(pts), 7);
    const mid = H.pointAlong(pts, 2);
    assert.deepEqual([mid.x, mid.z], [0, -2]);
    near(mid.yaw, 0);
    const turn = H.pointAlong(pts, 5);
    assert.deepEqual([turn.x, turn.z], [1, -4]);
    near(turn.yaw, -Math.PI / 2);
    assert.deepEqual([H.pointAlong(pts, 99).x, H.pointAlong(pts, -1).z], [3, 0]);
    assert.deepEqual(H.pointAlong([[1, 1], [1, 1]], 0), { x: 1, z: 1, yaw: 0 });
    const target = { yaw: 1, pitch: 0.2 };
    const start = { yaw: -1, pitch: -0.3 };
    const p0 = H.tweenPose(pts, start, target, 0);
    assert.deepEqual([p0.x, p0.z, p0.yaw, p0.pitch], [0, 0, -1, -0.3]);
    const p1 = H.tweenPose(pts, start, target, 1);
    assert.deepEqual([p1.x, p1.z], [3, -4]);
    near(p1.yaw, 1);
    near(p1.pitch, 0.2);
    near(H.tweenPose(pts, start, target, 0.4).yaw, H.pointAlong(pts, H.ease(0.4) * 7).yaw);
    assert.equal(H.walkSeconds(1), 0.6);
    assert.equal(H.walkSeconds(12), 2);
  });
});

describe("camera and movement", () => {
  test("fovFor widens on portrait phones and stays at the minimum on wide screens", () => {
    assert.equal(H.fovFor(16 / 9), 50);
    const phone = H.fovFor(320 / 700);
    assert.ok(phone > 50 && phone < 80, `${phone}`);
    assert.equal(H.fovFor(0.1), 80, "clamped");
    const hfov = 2 * Math.atan(Math.tan((phone * Math.PI) / 360) * (320 / 700));
    assert.ok(2 * H.viewDistance() * Math.tan(hfov / 2) >= H.PLAN.plaque.w);
  });
  test("lookAngles: -z is yaw 0, +x is -90°, up is positive pitch", () => {
    const ahead = H.lookAngles([0, 0, 0], [0, 0, -1]);
    near(ahead.yaw, 0);
    near(ahead.pitch, 0);
    near(H.lookAngles([0, 0, 0], [1, 0, 0]).yaw, -Math.PI / 2);
    near(H.lookAngles([0, 0, 0], [0, 1, -1]).pitch, Math.PI / 4);
  });
  test("moveStep walks forward along the view, strafes right, and doesn't speed up diagonally", () => {
    const [x, z] = H.moveStep([0, 0], 0, { forward: 1, strafe: 0 }, 1, 2);
    near(x, 0);
    near(z, -2);
    const [sx, sz] = H.moveStep([0, 0], 0, { forward: 0, strafe: 1 }, 1, 2);
    near(sx, 2);
    near(sz, 0);
    const [dx, dz] = H.moveStep([0, 0], 0, { forward: 1, strafe: 1 }, 1, 2);
    near(Math.hypot(dx, dz), 2);
    assert.deepEqual(H.moveStep([1, 2], 0, { forward: 0, strafe: 0 }, 1), [1, 2]);
  });
  test("lookDelta grabs the view: drag right turns left, drag down looks up; pitch is limited", () => {
    assert.deepEqual(H.lookDelta({ yaw: 0, pitch: 0 }, 100, 0), { yaw: 0.5, pitch: 0 });
    assert.equal(H.lookDelta({ yaw: 0, pitch: 0 }, 0, 1000).pitch, 0.9);
    assert.equal(H.lookDelta({ yaw: 0, pitch: 0 }, 0, -1000).pitch, -0.9);
    near(H.grabSensitivity(60, 600), Math.PI / 3 / 600);
    assert.equal(H.grabSensitivity(60, 0), Math.PI / 3, "no division by zero");
  });
  test("turnStep turns right on a positive input, at TURN_SPEED", () => {
    near(H.turnStep(0, 1, 0.5), -H.TURN_SPEED / 2);
    near(H.turnStep(1, -1, 1, 2), 3);
  });
  test("smoothInput eases towards the keys, snaps small leftovers to 0, and follows at once with tau 0", () => {
    const zero = { forward: 0, strafe: 0, turn: 0 };
    const keys = { forward: 1, strafe: 0, turn: -1 };
    assert.deepEqual(H.smoothInput(zero, keys, 0.016, 0), keys);
    const a = H.smoothInput(zero, keys, 0.016);
    assert.ok(a.forward > 0 && a.forward < 1 && a.turn < 0 && a.turn > -1, JSON.stringify(a));
    let v = a;
    for (let i = 0; i < 60; i++) v = H.smoothInput(v, keys, 0.016);
    near(v.forward, 1, 1e-3);
    for (let i = 0; i < 60; i++) v = H.smoothInput(v, zero, 0.016);
    assert.deepEqual(v, zero);
    assert.equal(H.isStill(v), true);
    assert.equal(H.isStill(a), false);
    assert.equal(H.isStill({ forward: 0, strafe: 0, turn: 0.2 }), false);
  });
  test("releaseVelocity measures the end of a drag; glide slows it down and stops", () => {
    const s = [{ t: 0, yaw: 0, pitch: 0 }, { t: 100, yaw: 0.1, pitch: 0 }, { t: 140, yaw: 0.2, pitch: -0.04 }];
    const v = H.releaseVelocity(s, 150);
    near(v.yaw, 0.1 / 0.04 * 1, 1e-9);
    near(v.pitch, -1);
    assert.deepEqual(H.releaseVelocity(s, 400), { yaw: 0, pitch: 0 }, "rested before letting go");
    assert.deepEqual(H.releaseVelocity([], 0), { yaw: 0, pitch: 0 });
    assert.deepEqual(H.releaseVelocity([s[2]], 150), { yaw: 0, pitch: 0 }, "one sample");
    assert.equal(H.releaseVelocity([{ t: 0, yaw: 0, pitch: 0 }, { t: 10, yaw: 5, pitch: 0 }], 10).yaw, 8, "capped");
    const g = H.glide({ yaw: 2, pitch: 0 }, H.GLIDE_TAU);
    near(g.yaw, 2 / Math.E);
    assert.equal(H.glide({ yaw: 0.04, pitch: 0 }, 0.016), null);
  });
  test("lerpAngle takes the short way round; ease is 0 → 1, symmetric; stepIndex clamps", () => {
    near(H.lerpAngle(3, -3, 0.5), Math.PI, 1e-3);
    assert.deepEqual([H.ease(-1), H.ease(0), H.ease(0.5), H.ease(1), H.ease(2)], [0, 0, 0.5, 1, 1]);
    near(H.ease(0.25) + H.ease(0.75), 1);
    assert.equal(H.stepIndex(0, -1, 5), 0);
    assert.equal(H.stepIndex(4, 1, 5), 4);
    assert.equal(H.stepIndex(-1, 1, 5), 0);
  });
  test("keyInput, stepKey and isTap", () => {
    assert.deepEqual(H.keyInput(new Set(["w", "d"])), { forward: 1, strafe: 1, turn: 0 });
    assert.deepEqual(H.keyInput(["arrowup", "w", "arrowleft"]), { forward: 1, strafe: 0, turn: -1 });
    assert.deepEqual(H.keyInput(["s", "a", "x", "arrowright"]), { forward: -1, strafe: -1, turn: 1 });
    assert.deepEqual(H.keyInput(["arrowdown"]), { forward: -1, strafe: 0, turn: 0 });
    assert.deepEqual([H.stepKey("j"), H.stepKey("k"), H.stepKey("x")], [1, -1, 0]);
    assert.equal(H.isTap(3, 4), true);
    assert.equal(H.isTap(10, 0), false);
  });
});

describe("impact sculpture", () => {
  test("nodeFill: one red node per 2 points, rounded to the nearest point, bottom up", () => {
    assert.deepEqual(H.nodeFill(0), [0, 0, 0, 0, 0]);
    assert.deepEqual(H.nodeFill(4.8), [1, 1, 0.5, 0, 0]);
    assert.deepEqual(H.nodeFill(5), [1, 1, 0.5, 0, 0]);
    assert.deepEqual(H.nodeFill(7.6), [1, 1, 1, 1, 0]);
    assert.deepEqual(H.nodeFill(10), [1, 1, 1, 1, 1]);
  });
  test("nodeFill matches the home page's dots within half a node, for every real exhibit", () => {
    for (const e of EXHIBITS) {
      const score = impactScore(e);
      const red = H.nodeFill(score).reduce((n, f) => n + f, 0);
      const dots = (pipsFill(score) / 100) * 5;
      assert.ok(Math.abs(red - score / 2) <= 0.25 && Math.abs(red - dots) <= 0.5, `${e.id}: ${red} vs ${dots}`);
    }
  });
  test("routePoints: a fixed five-node spiral rising from the plinth", () => {
    const pts = H.routePoints();
    assert.equal(pts.length, H.NODES);
    assert.deepEqual(pts[0], [0.26, 1.1, 0]);
    near(pts[4][1], 2.05);
    assert.ok(pts.every((p, i) => i === 0 || p[1] > pts[i - 1][1]));
    assert.deepEqual(H.routePoints(1), [[0.26, 1.1, 0]]);
  });
});

describe("map", () => {
  const layout = H.hallLayout(H.walkOrder(EXHIBITS, KEYS), KEYS);
  const g = H.mapGeometry(layout);
  test("geometry: rooms bottom-up from the entrance, the end at the top", () => {
    assert.ok(g.lobby > g.ys[0] && g.ys.every((y, i) => i === 0 || y < g.ys[i - 1]) && g.end < g.ys.at(-1));
    assert.equal(g.h, g.lobby + 34);
    assert.deepEqual(H.mapGeometry({ rooms: [] }).ys, []);
  });
  test("mapPoint: left in the hall is left on the map, the spine is the middle, walking forward goes up", () => {
    const [r0, r1] = layout.rooms;
    assert.deepEqual(H.mapPoint(layout, [0, layout.back]), [g.cx, g.lobby]);
    assert.deepEqual(H.mapPoint(layout, [0, r0.z]), [g.cx, g.ys[0]]);
    assert.deepEqual(H.mapPoint(layout, [0, layout.end]), [g.cx, g.end]);
    assert.deepEqual(H.mapPoint(layout, [0, 99]), [g.cx, g.lobby]);
    assert.deepEqual(H.mapPoint(layout, [-(r0.u0 + 3), r0.z]), [g.cx - g.branch, g.ys[0]], "room 0 is on the left");
    assert.deepEqual(H.mapPoint(layout, [r1.u0 + 3, r1.z]), [g.cx + g.branch, g.ys[1]], "room 1 is on the right");
    const [mx, my] = H.mapPoint(layout, [0, (r0.z + r1.z) / 2]);
    assert.equal(mx, g.cx);
    assert.ok(my < g.ys[0] && my > g.ys[1]);
  });
  test("mapSvg: one link per room to its anchor, labels on its own side, a hidden you-are-here dot", () => {
    const svg = H.mapSvg(layout, ROOM_NAMES.zh, "zh");
    assert.equal((svg.match(/<a class="map-room"/g) ?? []).length, layout.rooms.length);
    for (const r of layout.rooms) assert.ok(svg.includes(`href="#room-${r.key}" data-room="${r.key}" aria-label="${ROOM_NAMES.zh[r.key]}：${r.count} 件展品"`));
    assert.match(svg, /text-anchor="end"><tspan x="98"/);
    assert.match(svg, /text-anchor="start"><tspan x="222"/);
    assert.match(svg, /<circle class="map-you" [^>]* hidden\/>/);
    assert.ok(!svg.includes("tabindex"));
    assert.ok(svg.includes(">展厅尽头<") && svg.includes(">入口<"));
    const en = H.mapSvg(layout, ROOM_NAMES.en, "en", "hall-map mini");
    assert.match(en, /^<svg class="hall-map mini"/);
    assert.equal((en.match(/tabindex="-1"/g) ?? []).length, layout.rooms.length, "minimap links stay out of the tab order");
    assert.equal((en.match(/<tspan/g) ?? []).length > layout.rooms.length, true, "long English names wrap");
    for (const [, x] of en.matchAll(/<tspan x="(\d+)"/g)) assert.ok(Number(x) >= 8 && Number(x) <= 312);
  });
});

describe("what to offer", () => {
  test("no WebGL or data saver: stay on the floor plan with a message; reduced motion jumps", () => {
    assert.deepEqual(H.hallMode({ webgl: false, saveData: false, reducedMotion: false }), { enter: false, message: "hallNoWebgl", jump: true });
    assert.deepEqual(H.hallMode({ webgl: true, saveData: true, reducedMotion: false }), { enter: false, message: "hallSaveData", jump: true });
    assert.deepEqual(H.hallMode({ webgl: true, saveData: false, reducedMotion: true }), { enter: true, message: null, jump: true });
    assert.deepEqual(H.hallMode({ webgl: true, saveData: false, reducedMotion: undefined }), { enter: true, message: null, jump: false });
    for (const m of ["hallNoWebgl", "hallSaveData"]) assert.ok(STRINGS.en[m] && STRINGS.zh[m]);
  });
});

describe("device tier", () => {
  const touch = { coarsePointer: true, devicePixelRatio: 3, hardwareConcurrency: 8, maxTextureSize: 16384, renderer: "Apple GPU" };
  test("desktop is always high", () => {
    assert.equal(H.deviceTier({ coarsePointer: false, hardwareConcurrency: 2 }), "high");
  });
  test("any low-end signal wins on touch screens", () => {
    assert.equal(H.deviceTier({ ...touch, hardwareConcurrency: 3 }), "low");
    assert.equal(H.deviceTier({ ...touch, maxTextureSize: 2048 }), "low");
    assert.equal(H.deviceTier({ ...touch, renderer: "Mali-450 MP" }), "low");
    assert.equal(H.deviceTier({ ...touch, renderer: "Adreno (TM) 506" }), "low");
    assert.equal(H.deviceTier({ ...touch, renderer: "Google SwiftShader" }), "low");
  });
  test("high needs every high-end signal; missing signals are medium", () => {
    assert.equal(H.deviceTier(touch), "high");
    assert.equal(H.deviceTier({ ...touch, devicePixelRatio: 1.5 }), "medium");
    assert.equal(H.deviceTier({ coarsePointer: true }), "medium");
    assert.equal(H.deviceTier({ ...touch, renderer: "Adreno (TM) 740" }), "high");
  });
  test("isLowEndRenderer does not flag newer GPUs", () => {
    assert.equal(H.isLowEndRenderer("Mali-G78"), false);
    assert.equal(H.isLowEndRenderer("Mali-4000"), false);
    assert.equal(H.isLowEndRenderer("llvmpipe (LLVM 15)"), true);
  });
  test("pixelRatio caps the device ratio per tier", () => {
    assert.equal(H.pixelRatio("high", 3), 2);
    assert.equal(H.pixelRatio("medium", 3), 1.5);
    assert.equal(H.pixelRatio("low", 3), 1);
    assert.equal(H.pixelRatio("high", 1), 1);
    assert.equal(H.pixelRatio("high", undefined), 1);
    assert.deepEqual(Object.keys(H.TIERS), H.TIER_ORDER);
  });
});

describe("adaptive quality", () => {
  const frames = (state, from, to, fps) => {
    for (let t = from; t <= to; t += 1000 / fps) H.recordFrame(state, t);
    return state;
  };
  test("windowFps needs enough frames over enough time", () => {
    assert.equal(H.windowFps([0, 16]), null);
    assert.equal(H.windowFps(Array.from({ length: 30 }, (_, i) => i)), null, "too short a span");
    near(H.windowFps(Array.from({ length: 31 }, (_, i) => i * 100)), 10);
  });
  test("slow frames drop one tier after the dwell time, then wait again", () => {
    const s = H.createQuality(0, "high");
    frames(s, 0, 2900, 30);
    assert.equal(s.tier, "high", "dwell after creation");
    frames(s, 3000, 4800, 30);
    assert.equal(s.tier, "medium");
    frames(s, 4800, 6000, 30);
    assert.equal(s.tier, "medium", "dwell after a change");
    frames(s, 6000, 9000, 30);
    assert.equal(s.tier, "low");
    frames(s, 9000, 15000, 30);
    assert.equal(s.tier, "low", "low is the floor");
  });
  test("fast frames climb a tier only after holding for 5 s", () => {
    const s = H.createQuality(0, "low");
    frames(s, 0, 4000, 60);
    assert.equal(s.tier, "low");
    frames(s, 4000, 6000, 60);
    assert.equal(s.tier, "medium");
    frames(s, 6000, 20000, 60);
    assert.equal(s.tier, "high");
    frames(s, 20000, 30000, 60);
    assert.equal(s.tier, "high", "high is the ceiling");
  });
  test("frames in the hysteresis band change nothing; idle gaps and clock resets start a new window", () => {
    const s = H.createQuality(0, "medium");
    frames(s, 0, 10000, 50);
    assert.equal(s.tier, "medium");
    frames(s, 20000, 21000, 60);
    assert.ok(s.samples[0] >= 20000, "gap starts a new window");
    H.recordFrame(s, 5);
    assert.deepEqual(s.samples, [5]);
  });
  test("decideTier: no data keeps the tier; climbing during dwell keeps counting", () => {
    assert.deepEqual(H.decideTier({ tier: "low", fps: null, upSince: 1, windowStart: 0, now: 9000, lastChange: 0 }), { tier: "low", upSince: null, changed: false });
    assert.deepEqual(H.decideTier({ tier: "low", fps: 60, upSince: 0, windowStart: 0, now: 6000, lastChange: 4000 }), { tier: "low", upSince: 0, changed: false });
  });
});

describe("plaque text", () => {
  test("wrapLines breaks Latin at spaces and Chinese anywhere", () => {
    assert.deepEqual(H.wrapLines("one two three", 70, mono), ["one two", "three"]);
    assert.deepEqual(H.wrapLines("  lead", 100, mono), ["lead"]);
    assert.deepEqual(H.wrapLines("一二三四五", 60, mono), ["一二三", "四五"]);
    assert.deepEqual(H.wrapLines("DNS 服务器", 60, mono), ["DNS 服", "务器"]);
  });
  test("wrapLines keeps closing punctuation off the start of a line and splits overlong words", () => {
    assert.deepEqual(H.wrapLines("一二三，四", 60, mono), ["一二三，", "四"]);
    assert.deepEqual(H.wrapLines("abcdefghij", 40, mono), ["abcd", "efgh", "ij"]);
    assert.deepEqual(H.wrapLines("", 40, mono), []);
  });
  test("plaqueBlocks: number and room, title, impact with dots, date, one block per hop (last one red), lesson and source at the bottom", () => {
    const [e] = EXHIBITS;
    const en = H.plaqueBlocks(e, { no: 1, rooms: ROOM_NAMES.en });
    assert.equal(en[0].text, `No. 001 · ${ROOMS[e.room]}`);
    assert.equal(en[1].text, e.title);
    assert.equal(en[2].text, `Impact ${impactScore(e).toFixed(1)}/10`);
    assert.equal(en[2].pips, impactScore(e));
    assert.equal(en.length, 4 + e.hops.length + 2);
    const hops = en.filter((b) => b.lead);
    assert.match(hops.at(-1).text, /✕$/);
    assert.equal(hops.at(-1).color, "#c2412d");
    assert.deepEqual(en.slice(-2).map((b) => b.bottom), [true, true]);
    assert.equal(en.at(-2).italic, true);
    const [zh] = localizeExhibits([e], "zh");
    const zb = H.plaqueBlocks(zh, { no: 1, rooms: ROOM_NAMES.zh, lang: "zh" });
    assert.equal(zb.at(-2).italic, false, "no italics on Chinese");
    assert.equal(zb.at(-1).text, `来源：${e.source}`);
  });
  test("fontCss composes style, weight, size and family", () => {
    const fam = { serif: "Georgia", mono: "Menlo" };
    assert.equal(H.fontCss({ size: 20 }, 1, fam), "400 20px Georgia");
    assert.equal(H.fontCss({ size: 20, weight: 700, italic: true, family: "mono" }, 0.5, fam), "italic 700 10px Menlo");
  });
  test("layoutPlaque without a reserve: stacks lines, hop numbers in the margin, dots before the text, centred", () => {
    const box = { width: 400, height: 1000, pad: 20, families: { serif: "S", mono: "M" } };
    const blocks = [{ text: "Title", size: 20 }, { text: "hop", size: 10, lead: "01", indent: 30, before: 5 }, { text: "7", pips: 7, size: 10 }];
    const out = H.layoutPlaque(blocks, box, (s) => mono(s));
    assert.equal(out.scale, 1);
    assert.deepEqual(out.lines.map((l) => [l.text ?? "pips", l.x]), [["Title", 20], ["01", 20], ["hop", 50], ["pips", 20], ["7", 20 + H.pipsWidth(10)]]);
    assert.ok(Math.abs(out.lines[0].y - box.pad - (box.height - box.pad - out.bottom)) <= 1, "centred vertically");
    assert.equal(out.aside, null);
    assert.deepEqual(out.rules, []);
  });
  test("layoutPlaque with a reserve: bottom blocks beside a bottom-right box, a rule above both", () => {
    const box = { width: 400, height: 600, pad: 20, families: { serif: "S", mono: "M" } };
    const blocks = [{ text: "Title", size: 20 }, { text: "low", size: 10, bottom: true }];
    const out = H.layoutPlaque(blocks, box, mono, { reserve: { w: 100, h: 80 } });
    assert.deepEqual(out.aside, { x: 220, y: 452, w: 160, h: 128 }, "grown 1.6x into spare space");
    const low = out.lines.find((l) => l.text === "low");
    assert.equal(low.y, 452);
    assert.ok(out.rules[0] < 452 && out.rules[0] > out.lines[0].y);
    const long = H.layoutPlaque([{ text: "one two three four five six seven", size: 20, bottom: true }], box, mono, { reserve: { w: 200, h: 10 } });
    assert.equal(long.aside.w, Math.round(360 * 0.66), "never wider than two thirds");
    assert.ok(long.lines.every((l) => l.x + mono(l.text) <= long.aside.x - 28), "bottom text keeps clear of the box");
    const tight = H.layoutPlaque([{ text: "T", size: 20, before: 400 }, { text: "low", size: 10, bottom: true }], box, mono, { reserve: { w: 100, h: 80 } });
    assert.equal(tight.scale, 1);
    assert.ok(tight.aside.w < 160, "no room to grow much");
  });
  test("layoutPlaque shrinks the type until it fits, down to a floor", () => {
    const box = { width: 400, height: 120, pad: 10, families: { serif: "S", mono: "M" } };
    const out = H.layoutPlaque([{ text: "x", size: 40 }, { text: "y", size: 40 }], box, mono);
    assert.ok(out.scale < 1 && out.bottom <= 110, `${out.scale} ${out.bottom}`);
    assert.equal(H.layoutPlaque([{ text: "x", size: 1000 }], box, mono).scale, 0.5);
    assert.equal(H.layoutPlaque([{ text: "x", size: 1000 }, { text: "y", size: 10, bottom: true }], box, mono, { reserve: { w: 10, h: 10 } }).scale, 0.5);
  });
  test("every real plaque fits with its radar at a readable size in both languages (monospace worst case)", () => {
    const measure = (s, font) => (mono(s) * Number(font.match(/(\d+)px/)[1])) / 20;
    for (const lang of ["en", "zh"]) {
      for (const [i, e] of localizeExhibits(EXHIBITS, lang).entries()) {
        const out = H.layoutPlaque(H.plaqueBlocks(e, { no: i + 1, rooms: ROOM_NAMES[lang], lang }), { width: 1024, height: 1280, pad: 72, families: { serif: "S", mono: "M" } }, measure, { reserve: H.PLAQUE_RADAR });
        assert.ok(out.scale >= 0.6, `${lang} ${e.id}: scale ${out.scale}`);
        assert.ok(out.aside.w >= 0.6 * H.PLAQUE_RADAR.w);
      }
    }
  });
  test("corridor data wall, lobby legend and rule panels", () => {
    const tl = H.timelineBlocks(localizeExhibits(EXHIBITS, "zh"), "time", ROOM_NAMES.zh, "zh");
    const here = EXHIBITS.filter((e) => e.room === "time");
    assert.equal(tl[0].text, `钟表室：${here.length} 件展品`);
    assert.deepEqual(tl.filter((b) => b.lead).map((b) => b.lead), here.map((e) => e.date.slice(0, 4)).sort());
    assert.equal(tl.filter((b) => b.pips !== undefined).length, here.length);
    const legend = H.legendBlocks("en");
    assert.equal(legend[0].text, STRINGS.en.hallLegendTitle);
    assert.deepEqual(legend.slice(1).map((b) => b.lead), ["01", "✕", "●", "▲"]);
    assert.equal(H.ruleBlocks("zh")[1].text, STRINGS.zh.impactNoBlame);
    assert.equal(H.ruleBlocks("zh")[1].italic, false);
  });
});

describe("prerendered pieces", () => {
  test("spotsHtml groups buttons by room in walk order and counts them", () => {
    const order = H.walkOrder(localizeExhibits(EXHIBITS, "zh"), KEYS);
    const html = H.spotsHtml(order, ROOM_NAMES.zh, "zh");
    assert.equal((html.match(/<h3>/g) ?? []).length, KEYS.length);
    assert.equal((html.match(/data-spot="/g) ?? []).length, EXHIBITS.length);
    assert.ok(html.includes(`<button type="button" data-spot="0">${order[0].title}</button>`));
    assert.ok(html.endsWith(`<p class="hall-count">共 ${EXHIBITS.length} 件展品</p>`));
    assert.match(H.spotsHtml([{ id: "x", room: "a", title: "<b>" }], { a: "A" }), /data-spot="0">&lt;b&gt;</);
  });
});

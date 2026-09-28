import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { EXHIBITS, ROOM_NAMES, ROOMS } from "../public/exhibits.js";
import { STRINGS, localizeExhibits } from "../public/i18n.js";
import * as H from "../public/hall.js";

const KEYS = Object.keys(ROOMS);
const ex = (id, room, date) => ({ id, room, date, title: id, hops: ["a", "b", "c"] });
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
// Monospace stand-in for canvas measureText: Latin 10 px, CJK 20 px.
const mono = (s) => [...s].reduce((n, ch) => n + (/[\u2e80-\uffef]/.test(ch) ? 20 : 10), 0);

describe("walk order and floor plan", () => {
  const list = [ex("a", "config", "2020-01-01"), ex("b", "routing", "2019-01-01"), ex("c", "routing", "2021-01-01"), ex("d", "config", "2022-01-01"), ex("e", "config", "2018-01-01")];
  const order = H.walkOrder(list, ["routing", "config", "time"]);
  const layout = H.hallLayout(order, ["routing", "config", "time"]);

  test("rooms in the given order, newest first inside a room", () => {
    assert.deepEqual(order.map((e) => e.id), ["c", "b", "d", "a", "e"]);
  });
  test("rooms without exhibits get no section; plaques alternate left and right, two per row", () => {
    assert.deepEqual(layout.rooms.map((r) => r.key), ["routing", "config"]);
    assert.deepEqual(layout.slots.map((s) => s.side), [-1, 1, -1, 1, -1]);
    const [c, b, d, a, e] = layout.slots;
    assert.equal(c.z, b.z, "a row shares its z");
    assert.equal(d.z, a.z);
    assert.equal(a.z - e.z, H.PLAN.slot, "next row one slot further in");
    assert.deepEqual([c.x, b.x], [-4, 4]);
    near(c.rotY, Math.PI / 2);
    near(b.rotY, -Math.PI / 2);
  });
  test("each room ends before the next begins, and the corridor ends past the last plaque", () => {
    const [r1, r2] = layout.rooms;
    assert.equal(r1.start, H.PLAN.firstRoom);
    assert.equal(r2.start, r1.end);
    assert.ok(layout.slots.every((s) => s.z < H.PLAN.firstRoom && s.z > layout.end));
    assert.equal(layout.end, r2.end - H.PLAN.tail);
    assert.equal(layout.back, H.PLAN.back);
  });
  test("the real collection: every exhibit hung once, all five rooms", () => {
    const real = H.hallLayout(H.walkOrder(EXHIBITS, KEYS), KEYS);
    assert.deepEqual(real.slots.map((s) => s.id).sort(), EXHIBITS.map((e) => e.id).sort());
    assert.deepEqual(real.rooms.map((r) => r.key), KEYS);
    assert.deepEqual(H.posterKeys(real), ["lobby", ...KEYS]);
  });
  test("viewpoint stands across the corridor and looks at the plaque", () => {
    const v = H.viewpoint(layout.slots[0]);
    assert.deepEqual(v.pos, [1.2, H.PLAN.eye, layout.slots[0].z + H.PLAN.view.z]);
    assert.deepEqual(v.look, [-4, H.PLAN.plaque.y, layout.slots[0].z]);
    assert.ok(Math.abs(v.pos[0]) <= H.PLAN.walk, "inside the walkway");
    near(H.viewDistance(), Math.hypot(5.2, 0.4));
  });
  test("sculpture and spotlight sit beside the plaque, deeper in, clear of the walkway", () => {
    const s = layout.slots[1];
    const [x, z] = H.plinthPosition(s);
    assert.equal(x, 3.1);
    near(z, s.z - 1.85);
    assert.ok(Math.abs(x) - 0.45 > H.PLAN.walk, "plinth outside the walkway");
    assert.deepEqual(H.spotPosition(s), [3.1, s.z - 0.8]);
  });
  test("routePoints spirals up one node per hop", () => {
    const pts = H.routePoints(5);
    assert.equal(pts.length, 5);
    assert.deepEqual(pts[0], [0.26, 1.1, 0]);
    near(pts[4][1], 2.05);
    assert.ok(pts.every((p, i) => i === 0 || p[1] > pts[i - 1][1]));
    assert.deepEqual(H.routePoints(1), [[0.26, 1.1, 0]]);
  });
  test("nearestIndex, stepIndex and indexForHash", () => {
    const v = H.viewpoint(layout.slots[3]).pos;
    assert.equal(H.nearestIndex(layout, [v[0], v[2]]), 3);
    assert.equal(H.nearestIndex(layout, [0, 100]), 0);
    assert.equal(H.stepIndex(0, -1, 5), 0);
    assert.equal(H.stepIndex(4, 1, 5), 4);
    assert.equal(H.stepIndex(-1, 1, 5), 0, "from the lobby, next is the first plaque");
    assert.equal(H.indexForHash(layout, "#d"), 2);
    assert.equal(H.indexForHash(layout, "#nope"), -1);
    assert.equal(H.indexForHash(layout, ""), -1);
    assert.equal(H.indexForHash(layout, undefined), -1);
  });
  test("lobby and poster views look down the corridor; unknown poster keys are refused", () => {
    const lobby = H.lobbyView(layout);
    assert.ok(lobby.pos[2] < layout.back && lobby.look[2] < lobby.pos[2]);
    assert.deepEqual(H.posterView(layout, "lobby"), lobby);
    const room = H.posterView(layout, "config");
    assert.equal(room.pos[2], layout.rooms[1].start + 1.5);
    assert.equal(room.look[2], layout.rooms[1].end);
    assert.equal(H.posterParam("?poster=config", layout), "config");
    assert.equal(H.posterParam("?poster=lobby", layout), "lobby");
    assert.equal(H.posterParam("?poster=time", layout), null, "a room without exhibits has no poster");
    assert.equal(H.posterParam("", layout), null);
    assert.equal(H.posterParam(undefined, layout), null);
    assert.equal(H.posterPath("lobby", 480), "/posters/lobby-480.webp");
    assert.equal(H.POSTER_HEIGHT(960), 540);
  });
});

describe("camera and movement", () => {
  test("fovFor widens on portrait phones and stays at the minimum on wide screens", () => {
    assert.equal(H.fovFor(16 / 9), 50);
    const phone = H.fovFor(320 / 700);
    assert.ok(phone > 50 && phone < 80, `${phone}`);
    assert.equal(H.fovFor(0.1), 80, "clamped");
    // At the phone fov the whole plaque width fits.
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
    const [tx, tz] = H.moveStep([0, 0], -Math.PI / 2, { forward: 1, strafe: 0 }, 1, 1);
    near(tx, 1);
    near(tz, 0);
    assert.deepEqual(H.moveStep([1, 2], 0, { forward: 0, strafe: 0 }, 1), [1, 2]);
  });
  test("clampPosition keeps the visitor in the walkway and off the end walls", () => {
    const layout = { end: -40, back: 6 };
    assert.deepEqual(H.clampPosition([9, 99], layout), [H.PLAN.walk, 6 - H.PLAN.margin]);
    assert.deepEqual(H.clampPosition([-9, -99], layout), [-H.PLAN.walk, -40 + H.PLAN.margin]);
    assert.deepEqual(H.clampPosition([1, -3], layout), [1, -3]);
  });
  test("lookDelta turns with the drag and limits pitch", () => {
    assert.deepEqual(H.lookDelta({ yaw: 0, pitch: 0 }, 100, 0), { yaw: -0.5, pitch: 0 });
    assert.equal(H.lookDelta({ yaw: 0, pitch: 0 }, 0, -1000).pitch, 0.9);
    assert.equal(H.lookDelta({ yaw: 0, pitch: 0 }, 0, 1000).pitch, -0.9);
  });
  test("lerpAngle takes the short way round; ease is 0 → 1, symmetric", () => {
    near(H.lerpAngle(3, -3, 0.5), Math.PI, 1e-3);
    near(H.lerpAngle(0, 1, 0.25), 0.25);
    assert.deepEqual([H.ease(-1), H.ease(0), H.ease(0.5), H.ease(1), H.ease(2)], [0, 0, 0.5, 1, 1]);
    near(H.ease(0.25) + H.ease(0.75), 1);
  });
  test("keyInput, stepKey and isTap", () => {
    assert.deepEqual(H.keyInput(new Set(["w", "d"])), { forward: 1, strafe: 1 });
    assert.deepEqual(H.keyInput(["arrowup", "w", "arrowleft"]), { forward: 1, strafe: -1 }, "clamped");
    assert.deepEqual(H.keyInput(["s", "a", "x"]), { forward: -1, strafe: -1 });
    assert.deepEqual(H.keyInput([]), { forward: 0, strafe: 0 });
    assert.deepEqual([H.stepKey("j"), H.stepKey("k"), H.stepKey("x")], [1, -1, 0]);
    assert.equal(H.isTap(3, 4), true);
    assert.equal(H.isTap(10, 0), false);
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
  test("plaqueBlocks: number and room, title, date, impact, one block per hop (last one red), lesson, source", () => {
    const [e] = EXHIBITS;
    const en = H.plaqueBlocks(e, { no: 1, rooms: ROOM_NAMES.en });
    assert.equal(en[0].text, `No. 001 · ${ROOMS[e.room]}`);
    assert.equal(en[1].text, e.title);
    assert.equal(en.length, 4 + e.hops.length + 2);
    const hops = en.filter((b) => b.lead);
    assert.deepEqual(hops.map((b) => b.lead), e.hops.map((_, i) => String(i + 1).padStart(2, "0")));
    assert.match(hops.at(-1).text, /✕$/);
    assert.equal(hops.at(-1).color, "#c2412d");
    assert.equal(en.at(-2).italic, true);
    assert.equal(en.at(-1).text, `Source: ${e.source}`);
    const [zh] = localizeExhibits([e], "zh");
    const zb = H.plaqueBlocks(zh, { no: 1, rooms: ROOM_NAMES.zh, lang: "zh" });
    assert.equal(zb[0].text, `展品 001 · ${ROOM_NAMES.zh[e.room]}`);
    assert.equal(zb.at(-2).italic, false, "no italics on Chinese");
    assert.equal(zb.at(-1).text, `来源：${e.source}`);
  });
  test("fontCss composes style, weight, size and family", () => {
    const fam = { serif: "Georgia", mono: "Menlo" };
    assert.equal(H.fontCss({ size: 20 }, 1, fam), "400 20px Georgia");
    assert.equal(H.fontCss({ size: 20, weight: 700, italic: true, family: "mono" }, 0.5, fam), "italic 700 10px Menlo");
  });
  test("layoutPlaque stacks lines top-down, draws the hop number in the margin and a rule above the lesson", () => {
    const box = { width: 400, height: 1000, pad: 20, families: { serif: "S", mono: "M" } };
    const blocks = [
      { text: "Title", size: 20 },
      { text: "hop", size: 10, lead: "01", indent: 30, before: 5 },
      { text: "lesson", size: 10, rule: true, before: 10 },
    ];
    const out = H.layoutPlaque(blocks, box, (s) => mono(s));
    assert.equal(out.scale, 1);
    assert.deepEqual(out.lines.map((l) => [l.text, l.x]), [["Title", 20], ["01", 20], ["hop", 50], ["lesson", 20]]);
    const top = out.lines[0].y - box.pad;
    assert.ok(Math.abs(top - (box.height - box.pad - out.bottom)) <= 1, "centred vertically");
    assert.ok(out.lines.every((l, i) => i === 0 || l.y >= out.lines[i - 1].y));
    assert.equal(out.rules.length, 1);
    assert.ok(out.rules[0] < out.lines.at(-1).y);
  });
  test("layoutPlaque shrinks the type until it fits, down to a floor", () => {
    const box = { width: 400, height: 120, pad: 10, families: { serif: "S", mono: "M" } };
    const tall = [{ text: "x", size: 40 }, { text: "y", size: 40 }];
    const out = H.layoutPlaque(tall, box, mono);
    assert.ok(out.scale < 1 && out.bottom <= 110, `${out.scale} ${out.bottom}`);
    const huge = H.layoutPlaque([{ text: "x", size: 1000 }], box, mono);
    assert.equal(huge.scale, 0.5);
  });
  test("every real plaque fits at a readable size in both languages (monospace worst case)", () => {
    for (const lang of ["en", "zh"]) {
      for (const [i, e] of localizeExhibits(EXHIBITS, lang).entries()) {
        const out = H.layoutPlaque(H.plaqueBlocks(e, { no: i + 1, rooms: ROOM_NAMES[lang], lang }), { width: 1024, height: 1280, pad: 72, families: { serif: "S", mono: "M" } }, (s, font) => (mono(s) * Number(font.match(/(\d+)px/)[1])) / 20);
        assert.ok(out.bottom <= 1280 - 72 && out.scale >= 0.6, `${lang} ${e.id}: scale ${out.scale}`);
      }
    }
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

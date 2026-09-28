// three.js glue for the 3D hall, downloaded with three.js when the visitor presses Enter.
// Every decision (floor plan, walls, paths, framing, movement, tiers, text layout, sculpture fill)
// lives in hall.js, museum.js and i18n.js, which are unit-tested. Keep this file branch-light.
import { RUBRIC, STRINGS, localizeExhibits, switchHref } from "./i18n.js";
import { DIMENSIONS, ICON, RADAR, exhibitHtml, exhibitPath, impactScore, isMuseumKey, radarLabel, radarPoint } from "./museum.js";
import * as H from "./hall.js";

const $ = (sel) => document.querySelector(sel);

export function start({ THREE, data: { EXHIBITS, ROOM_NAMES }, lang, mode, signals, onExit }) {
  const root = document.documentElement;
  const stage = $("#hall-stage");
  const langSwitch = $("#lang-switch");
  const t = STRINGS[lang];
  const rooms = ROOM_NAMES[lang];
  const keys = Object.keys(rooms);
  const list = localizeExhibits(EXHIBITS, lang);
  const order = H.walkOrder(list, keys);
  const layout = H.hallLayout(order, keys);
  const rects = H.walkRects(layout);
  const P = H.PLAN;
  const poster = H.posterParam(location.search);
  const tier = H.deviceTier(signals);
  const spec = H.TIERS[tier];
  const quality = H.createQuality(performance.now(), tier);
  const off = new AbortController();
  const on = (el, type, fn) => el.addEventListener(type, fn, { signal: off.signal });
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  stage.hidden = false;
  root.classList.add("hall-on");
  root.classList.toggle("hall-shot", poster !== null);

  const renderer = new THREE.WebGLRenderer({ antialias: spec.antialias, preserveDrawingBuffer: poster !== null });
  renderer.setPixelRatio(H.pixelRatio(tier, window.devicePixelRatio));
  $("#hall-canvas").append(renderer.domElement);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111014);
  scene.fog = new THREE.Fog(0x111014, 12, 40);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 90);
  camera.rotation.order = "YXZ";
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x17141b, 1.6));
  const sun = new THREE.DirectionalLight(0xffe6c0, 0.9);
  sun.position.set(2, 10, 6);
  scene.add(sun);

  // ---------- textures drawn on canvases: no image downloads, text in the page's system fonts ----------
  const families = {
    serif: getComputedStyle(document.body).fontFamily,
    mono: getComputedStyle(root).getPropertyValue("--mono").trim() || "monospace",
  };
  const textless = poster !== null;
  function canvasTexture(w, h, draw, repeat = false) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const lambert = (opts) => keep(new THREE.MeshLambertMaterial(opts));
  const basic = (opts) => keep(new THREE.MeshBasicMaterial(opts));
  const glow = (map, opacity) => basic({ map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  function add(geometry, material, [x, y, z], rot = [0, 0, 0], parent = scene) {
    const mesh = new THREE.Mesh(keep(geometry), material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(...rot);
    parent.add(mesh);
    return mesh;
  }
  // A plane whose texture repeats every `tile` metres, so walls and floors of any size look the same.
  function tiled(w, h, tile) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
    return g;
  }

  const planks = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#1c1815";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = ["#221d19", "#1f1a16", "#241f1a", "#1a1613"][(i * 5) % 4];
      g.fillRect(i * 32 + 1, 0, 30, h);
      g.fillStyle = "#15120f";
      g.fillRect(i * 32, (i * 97) % h, 32, 2);
    }
  }, true);
  const panels = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#2b2831";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#35313c";
    g.lineWidth = 4;
    g.strokeRect(12, 12, w - 24, h - 24);
  }, true);
  const cone = canvasTexture(8, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255,236,190,0.9)");
    grad.addColorStop(1, "rgba(255,236,190,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const pool = canvasTexture(128, 128, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, "rgba(255,236,190,0.8)");
    grad.addColorStop(1, "rgba(255,236,190,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  });

  const measureWith = (g) => (text, font) => ((g.font = font), g.measureText(text).width);
  function drawPips(g, x, y, size, score) {
    const cell = size * 0.9;
    const r = size * 0.32;
    for (let k = 0; k < 5; k++) {
      const cx = x + cell * k + cell / 2;
      const cy = y + size * 0.62;
      const fill = Math.min(1, Math.max(0, score / 2 - k));
      g.fillStyle = "#8c8579";
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      if (fill <= 0) continue;
      g.save();
      g.beginPath();
      g.rect(cx - r, cy - r, 2 * r * fill, 2 * r);
      g.clip();
      g.fillStyle = "#c2412d";
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  function drawLines(g, lines) {
    g.textBaseline = "top";
    for (const l of lines) {
      if (l.pips !== undefined) {
        drawPips(g, l.x, l.y, l.size, l.pips);
        continue;
      }
      g.font = l.font;
      g.fillStyle = l.color;
      if (textless) {
        const px = Number(l.font.match(/(\d+)px/)[1]);
        g.globalAlpha = 0.28;
        g.fillRect(l.x, l.y + px * 0.2, g.measureText(l.text).width, px * 0.62);
        g.globalAlpha = 1;
      } else {
        g.fillText(l.text, l.x, l.y);
      }
    }
  }
  // The exhibit page's radar (RADAR in museum.js), drawn into `box`.
  function drawRadar(g, box, e) {
    const k = box.w / RADAR.w;
    g.save();
    g.translate(box.x, box.y);
    g.scale(k, box.h / RADAR.h);
    const ring = (pts) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };
    g.strokeStyle = "#c9bda5";
    g.lineWidth = 1;
    for (const v of [2, 4, 6, 8, 10]) {
      ring(DIMENSIONS.map((_, i) => radarPoint(i, v)));
      g.stroke();
    }
    for (let i = 0; i < DIMENSIONS.length; i++) {
      const [x, y] = radarPoint(i, 10);
      g.beginPath();
      g.moveTo(RADAR.cx, RADAR.cy);
      g.lineTo(x, y);
      g.stroke();
    }
    ring(DIMENSIONS.map((d, i) => radarPoint(i, e.impact[d])));
    g.fillStyle = "rgba(194,65,45,0.18)";
    g.fill();
    g.strokeStyle = "#c2412d";
    g.lineWidth = 2;
    g.stroke();
    if (!textless) {
      g.textBaseline = "alphabetic";
      DIMENSIONS.forEach((d, i) => {
        const { x, anchor, lines } = radarLabel(i);
        g.textAlign = anchor === "middle" ? "center" : anchor === "start" ? "left" : "right";
        g.font = `400 15px ${families.serif}`;
        g.fillStyle = "#221e1a";
        g.fillText(RUBRIC[lang][d].name, x, lines[0]);
        g.font = `700 15px ${families.mono}`;
        g.fillStyle = "#c2412d";
        g.fillText(String(e.impact[d]), x, lines[1]);
      });
    }
    g.restore();
  }
  function drawIcon(g, x, y, size) {
    g.save();
    g.translate(x, y);
    g.scale(size / 64, size / 64);
    for (const p of ICON) {
      const path = new Path2D(p.d);
      if (p.stroke) {
        g.strokeStyle = p.stroke;
        g.lineWidth = p.width;
        g.lineCap = g.lineJoin = "round";
        g.stroke(path);
      } else {
        g.fillStyle = p.fill;
        g.fill(path);
      }
    }
    g.restore();
  }
  function card(g, w, h) {
    g.fillStyle = "#f3ece0";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#d9ccb3";
    g.lineWidth = 6;
    g.strokeRect(20, 20, w - 40, h - 40);
  }

  function plaqueTexture(x) {
    const size = spec.texture;
    return canvasTexture(size, Math.round(size * 1.25), (g) => {
      g.scale(size / 1024, size / 1024);
      card(g, 1024, 1280);
      const blocks = H.plaqueBlocks(x, { no: list.indexOf(x) + 1, rooms, lang });
      const out = H.layoutPlaque(blocks, { width: 1024, height: 1280, pad: 72, families }, measureWith(g), { reserve: H.PLAQUE_RADAR });
      g.fillStyle = "#dccfb6";
      for (const y of out.rules) g.fillRect(72, y, 880, 3);
      drawLines(g, out.lines);
      drawRadar(g, out.aside, x);
    });
  }
  function panelTexture(blocks, w, h) {
    return canvasTexture(w, h, (g) => {
      card(g, w, h);
      drawLines(g, H.layoutPlaque(blocks, { width: w, height: h, pad: 64, families }, measureWith(g)).lines);
    });
  }
  function signTexture(text, w = 1024, h = 160) {
    return canvasTexture(w, h, (g) => {
      g.fillStyle = "#2a2418";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#c9a45c";
      g.lineWidth = 6;
      g.strokeRect(10, 10, w - 20, h - 20);
      if (textless) return;
      let px = 68;
      const fit = () => ((g.font = `600 ${px}px ${families.serif}`), g.measureText(text).width);
      while (fit() > w - 80 && px > 24) px -= 4;
      g.fillStyle = "#c9a45c";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, w / 2, h / 2 + 2);
    });
  }

  // ---------- the building ----------
  const floorMat = lambert({ map: planks });
  const ceilMat = basic({ color: 0x0c0b0f });
  for (const r of H.floorRects(layout)) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    add(tiled(w, d, 2), floorMat, [cx, 0, cz], [-Math.PI / 2, 0, 0]);
    add(new THREE.PlaneGeometry(w, d), ceilMat, [cx, P.wallHeight, cz], [Math.PI / 2, 0, 0]);
  }
  const wallMat = lambert({ map: panels });
  const brass = lambert({ color: 0xc9a45c, emissive: 0x2a2010 });
  for (const s of H.wallSegments(layout)) {
    add(tiled(s.len, P.wallHeight, 2.1), wallMat, [s.x, P.wallHeight / 2, s.z], [0, s.rotY, 0]);
    const nx = Math.sin(s.rotY) * 0.02;
    const nz = Math.cos(s.rotY) * 0.02;
    for (const y of [0.06, 3.55]) add(new THREE.BoxGeometry(s.len, 0.05, 0.04), brass, [s.x + nx, y, s.z + nz], [0, s.rotY, 0]);
  }
  const lamp = basic({ color: 0xf6e7c8 });
  for (let z = layout.back - 2; z > layout.end; z -= 5) add(new THREE.BoxGeometry(1.4, 0.04, 0.24), lamp, [0, P.wallHeight - 0.02, z]);

  const pickable = [];
  const pick = (mesh, action) => ((mesh.userData.action = action), pickable.push(mesh), mesh);

  // Lobby: the museum sign, how to read a plaque, and the no-blame rule.
  add(new THREE.PlaneGeometry(4.4, 0.69), basic({ map: signTexture(t.hallSign) }), [0, 3.6, 0]);
  const half = P.spine / 2 - 0.03;
  add(new THREE.PlaneGeometry(2.6, 2.4), basic({ map: panelTexture(H.legendBlocks(lang), 1040, 960) }), [-half, 1.8, 1.4], [0, Math.PI / 2, 0]);
  add(new THREE.PlaneGeometry(2.6, 1.6), basic({ map: panelTexture(H.ruleBlocks(lang), 1040, 640) }), [half, 1.9, 1.4], [0, -Math.PI / 2, 0]);

  // End of the hall: the icon, the slogan and the address, and an empty frame for the next exhibit.
  const endSign = canvasTexture(1440, 540, (g, w, h) => {
    g.fillStyle = "#1a181f";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c9a45c";
    g.lineWidth = 8;
    g.strokeRect(12, 12, w - 24, h - 24);
    drawIcon(g, w / 2 - 110, 50, 220);
    if (textless) return;
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillStyle = "#c9a45c";
    g.font = `400 72px ${families.serif}`;
    g.fillText(t.slogan, w / 2, 300);
    g.fillStyle = "#8c8579";
    g.font = `400 40px ${families.mono}`;
    g.fillText("failrouter.com", w / 2, 410);
  });
  add(new THREE.PlaneGeometry(3.6, 1.35), basic({ map: endSign }), [0, 2.8, layout.end + 0.03]);
  add(new THREE.BoxGeometry(1.44, 1.74, 0.05), brass, [0, 1.35, layout.end + 0.04]);
  const emptyFrame = canvasTexture(520, 640, (g, w, h) => {
    g.fillStyle = "#e7dfd1";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#d9ccb3";
    g.lineWidth = 6;
    g.setLineDash([18, 12]);
    g.strokeRect(40, 40, w - 80, h - 80);
    if (textless) return;
    g.fillStyle = "#6f6656";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `400 40px ${families.serif}`;
    const block = H.splitAtColon(t.hallSuggestFrame);
    block.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (block.length - 1) / 2) * 54));
  });
  pick(add(new THREE.PlaneGeometry(1.3, 1.6), basic({ map: emptyFrame }), [0, 1.35, layout.end + 0.07]), { suggest: true });

  // Signs over the spine before each side corridor, rooms' names on their far walls, corridors.
  const plinthMat = lambert({ color: 0x26222b });
  const green = lambert({ color: 0x7fdc8c, emissive: 0x2e6b37 });
  const red = lambert({ color: 0xc2412d, emissive: 0x7a1a10 });
  // Unlit sculpture nodes: the grey of the unfilled impact dots on the home page (--muted), no glow.
  const unlit = lambert({ color: 0x8c8579 });
  const dark = lambert({ color: 0x1d1a21 });
  const coneMat = glow(cone, 0.06);
  const poolMat = glow(pool, 0.35);
  for (const room of layout.rooms) {
    const s = room.side;
    pick(add(new THREE.PlaneGeometry(2.3, 0.36), basic({ map: signTexture(H.signText(rooms[room.key], s), 1024, 160) }), [s * 1.2, 3.35, room.z + 2.2]), { room: room.index });
    add(new THREE.PlaneGeometry(3.6, 0.56), basic({ map: signTexture(rooms[room.key]) }), [s * (room.u1 - 0.03), 3.3, room.z], [0, -s * (Math.PI / 2), 0]);
    for (let u = room.u0 + 2; u < room.u1; u += 5) add(new THREE.BoxGeometry(0.24, 0.04, 1.4), lamp, [s * u, P.wallHeight - 0.02, room.z]);

    const mid = P.spine / 2 + P.corridor.length / 2;
    const pw = H.propWall(room);
    const dw = -pw;
    const wallAt = (w) => room.z + (w * P.corridor.width) / 2;
    const faceInto = (w) => [0, w < 0 ? 0 : Math.PI, 0];
    const here = list.filter((e) => e.room === room.key);
    add(new THREE.BoxGeometry(4.34, 2.54, 0.04), brass, [s * mid, 1.9, wallAt(dw) - dw * 0.02]);
    add(new THREE.PlaneGeometry(4.2, 2.4), basic({ map: panelTexture(H.timelineBlocks(here, room.key, rooms, lang), 1400, 800) }), [s * mid, 1.9, wallAt(dw) - dw * 0.045], faceInto(dw));
    const prop = new THREE.Group();
    prop.position.set(s * mid, 0, wallAt(pw) - pw * 0.2);
    prop.rotation.y = faceInto(pw)[1];
    scene.add(prop);
    prop.userData.pending = H.propFor(room.key);
    add(new THREE.PlaneGeometry(2.6, 2.6), poolMat, [s * mid, 0.01, wallAt(pw) - pw * 0.6], [-Math.PI / 2, 0, 0]);
  }

  // Corridor installations. Each builds into a group whose front faces +z (into the corridor).
  function display(text, color, w, h) {
    return canvasTexture(w, h, (g) => {
      g.fillStyle = "#0a0a0c";
      g.fillRect(0, 0, w, h);
      g.fillStyle = color;
      g.font = `700 ${Math.round(h * 0.62)}px ${families.mono}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, w / 2, h / 2);
    });
  }
  function clockFace(hour, minute) {
    return canvasTexture(256, 256, (g) => {
      g.fillStyle = "#f3ece0";
      g.beginPath();
      g.arc(128, 128, 120, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#221e1a";
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6;
        g.lineWidth = k % 3 ? 3 : 7;
        g.beginPath();
        g.moveTo(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96);
        g.lineTo(128 + Math.sin(a) * 110, 128 - Math.cos(a) * 110);
        g.stroke();
      }
      const hand = (a, len, width) => {
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(128, 128);
        g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len);
        g.stroke();
      };
      hand(((hour % 12) + minute / 60) * (Math.PI / 6), 62, 9);
      hand(minute * (Math.PI / 30), 92, 5);
    });
  }
  const PROPS = {
    rack(gr) {
      add(new THREE.BoxGeometry(1.4, 2.2, 0.5), dark, [0, 1.1, 0], undefined, gr);
      const led = new THREE.SphereGeometry(0.025, 8, 6);
      keep(led);
      for (let row = 0; row < 6; row++) {
        add(new THREE.BoxGeometry(1.2, 0.18, 0.02), plinthMat, [0, 0.55 + row * 0.28, 0.26], undefined, gr);
        for (let k = 0; k < 8; k++) {
          const dead = row === 3 && k === 5;
          const mesh = new THREE.Mesh(led, dead ? red : green);
          mesh.position.set(-0.49 + k * 0.14, 0.55 + row * 0.28, 0.28);
          if (!(row === 3 && k === 6)) gr.add(mesh);
        }
      }
    },
    rollout(gr) {
      [0.45, 0.9, 1.5].forEach((h, k) => add(new THREE.BoxGeometry(0.5, h, 0.5), k === 2 ? red : brass, [-0.6 + k * 0.6, h / 2, 0], undefined, gr));
    },
    keyboard(gr) {
      add(new THREE.BoxGeometry(0.9, 0.95, 0.5), plinthMat, [0, 0.475, 0], undefined, gr);
      const deck = new THREE.Group();
      deck.position.set(0, 1.02, 0);
      deck.rotation.x = 0.35;
      gr.add(deck);
      add(new THREE.BoxGeometry(1.5, 0.08, 0.6), dark, [0, 0, 0], undefined, deck);
      const key = new THREE.BoxGeometry(0.11, 0.05, 0.11);
      keep(key);
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k < 10; k++) {
          if (row > 0 && row < 3 && k > 7) continue;
          const mesh = new THREE.Mesh(key, plinthMat);
          mesh.position.set(-0.63 + k * 0.13, 0.06, -0.2 + row * 0.13);
          deck.add(mesh);
        }
      }
      add(new THREE.BoxGeometry(0.24, 0.07, 0.24), green, [0.5, 0.07, -0.005], undefined, deck);
    },
    counter(gr) {
      add(new THREE.BoxGeometry(1.7, 1.1, 0.12), dark, [0, 1.7, -0.14], undefined, gr);
      add(new THREE.PlaneGeometry(1.5, 0.42), basic({ map: display("32767", "#7fdc8c", 600, 168) }), [0, 1.95, -0.07], undefined, gr);
      add(new THREE.PlaneGeometry(1.5, 0.42), basic({ map: display("-32768", "#c2412d", 600, 168) }), [0, 1.45, -0.07], undefined, gr);
    },
    clocks(gr) {
      [[10, 10], [3, 45], [11, 59]].forEach(([h, m], k) => {
        add(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 32), brass, [-0.8 + k * 0.8, 2.3, -0.12], [Math.PI / 2, 0, 0], gr);
        add(new THREE.PlaneGeometry(0.62, 0.62), basic({ map: clockFace(h, m), transparent: true }), [-0.8 + k * 0.8, 2.3, -0.085], undefined, gr);
      });
      add(new THREE.PlaneGeometry(1.2, 0.32), basic({ map: display("23:59:60", "#c2412d", 600, 160) }), [0, 1.55, -0.12], undefined, gr);
    },
  };
  // Build the installations now that PROPS exists (the loop above ran first).
  for (const gr of scene.children.filter((c) => c.isGroup && c.userData.pending)) PROPS[gr.userData.pending](gr);

  // ---------- plaques and impact sculptures ----------
  const blank = basic({ color: 0xf3ece0 });
  const plaques = [];
  layout.slots.forEach((slot, i) => {
    const inward = -slot.wall;
    add(new THREE.BoxGeometry(P.plaque.w + 0.14, P.plaque.h + 0.14, 0.05), brass, [slot.x, P.plaque.y, slot.z + inward * 0.035]);
    const plaque = pick(add(new THREE.PlaneGeometry(P.plaque.w, P.plaque.h), blank, [slot.x, P.plaque.y, slot.z + inward * 0.07], [0, slot.rotY, 0]), { index: i });
    plaques.push(plaque);

    const [px, pz] = H.plinthPosition(slot);
    const gr = new THREE.Group();
    gr.position.set(px, 0, pz);
    scene.add(gr);
    pick(add(new THREE.BoxGeometry(0.8, 1, 0.8), plinthMat, [0, 0.5, 0], undefined, gr), { index: i });
    add(new THREE.BoxGeometry(0.86, 0.04, 0.86), brass, [0, 1.02, 0], undefined, gr);
    const score = impactScore(order[i]);
    const plate = canvasTexture(256, 144, (g, w, h) => {
      g.fillStyle = "#c9a45c";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#221e1a";
      g.font = `700 88px ${families.mono}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(score.toFixed(1), w / 2, h / 2 + 4);
    });
    add(new THREE.PlaneGeometry(0.44, 0.25), basic({ map: plate }), [0, 0.72, inward * 0.405], [0, inward > 0 ? 0 : Math.PI, 0], gr);
    const fill = H.nodeFill(score);
    const pts = H.routePoints().map((p) => new THREE.Vector3(...p));
    const top = new THREE.SphereGeometry(0.075, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const bottom = new THREE.SphereGeometry(0.075, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    keep(top);
    keep(bottom);
    pts.forEach((p, k) => {
      const half = H.hemispheres(fill[k]);
      for (const [geo, lit] of [[top, half.top], [bottom, half.bottom]]) {
        const mesh = new THREE.Mesh(geo, lit ? red : unlit);
        mesh.position.copy(p);
        gr.add(mesh);
      }
      if (k === 0) return;
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([pts[k - 1], p]), 4, 0.016, 6), H.rodLit(fill[k - 1], fill[k]) ? red : unlit, [0, 0, 0], undefined, gr);
    });
    const peak = pts.at(-1);
    // Brass ring at the top of the scale (10 points): a marker, not a failure.
    add(new THREE.TorusGeometry(0.16, 0.012, 8, 32), brass, [peak.x, peak.y, peak.z], [Math.PI / 2, 0, 0], gr);

    const [sx, sz] = H.spotPosition(slot);
    add(new THREE.CylinderGeometry(0.05, 1.3, 3.9, 24, 1, true), coneMat, [sx, P.wallHeight - 1.95, sz]);
    add(new THREE.PlaneGeometry(2.6, 2.6), poolMat, [sx, 0.01, sz], [-Math.PI / 2, 0, 0]);
  });

  // Plaque textures are drawn when the visitor gets near a room (drawing all at once stalls a phone).
  const drawn = new Set();
  function drawNear(x, z) {
    for (const room of layout.rooms) {
      if (drawn.has(room.index)) continue;
      const cx = room.side * ((room.u0 + room.u1) / 2);
      if (Math.hypot(cx - x, room.z - z) > 26) continue;
      drawn.add(room.index);
      layout.slots.forEach((s, i) => {
        if (s.roomIndex === room.index) plaques[i].material = basic({ map: plaqueTexture(order[i]) });
      });
    }
  }

  // ---------- camera, walking, picking ----------
  const cam = { x: 0, z: 0, yaw: 0, pitch: 0 };
  const pose = ({ pos, look }) => ({ x: pos[0], z: pos[2], ...H.lookAngles(pos, look) });
  const caption = $("#hall-caption");
  const help = $("#hall-help");
  const dots = [...stage.querySelectorAll(".map-you")];
  let current = -1;
  let hashId = "";

  function setHash(id) {
    if (id === hashId) return;
    hashId = id;
    history.replaceState(null, "", `#${id}`);
    langSwitch.href = switchHref(langSwitch.getAttribute("href"), id);
  }
  // Caption, URL and map dot for where the visitor stands.
  function whereAmI() {
    const i = H.locate(layout, [cam.x, cam.z]);
    const room = layout.rooms[i];
    if (room && Math.abs(cam.x) > room.u0 + 1.5) {
      const k = H.nearestInRoom(layout, i, [cam.x, cam.z]);
      current = k;
      caption.textContent = order[k].title;
      setHash(order[k].id);
    } else {
      caption.textContent = room ? rooms[room.key] : "";
    }
    const [mx, my] = H.mapPoint(layout, [cam.x, cam.z]);
    for (const d of dots) {
      d.setAttribute("cx", mx);
      d.setAttribute("cy", my);
      d.removeAttribute("hidden");
    }
    drawNear(cam.x, cam.z);
  }

  let tween = null;
  const fade = $("#hall-fade");
  function travel(target, after = () => {}) {
    const path = [[cam.x, cam.z], ...H.pathBetween(layout, [cam.x, cam.z], [target.x, target.z])];
    const length = H.polylineLength(path);
    help.hidden = true;
    const arrive = () => {
      Object.assign(cam, target);
      after();
      whereAmI();
      schedule();
    };
    if (mode.jump) return arrive();
    if (length > H.FADE_DISTANCE) {
      fade.classList.add("on");
      setTimeout(() => {
        arrive();
        requestAnimationFrame(() => fade.classList.remove("on"));
      }, 300);
      return;
    }
    tween = { path, start: { yaw: cam.yaw, pitch: cam.pitch }, target, t0: performance.now(), dur: H.walkSeconds(length) * 1000, after };
    schedule();
  }
  const goTo = (i) => travel(pose(H.viewpoint(layout.slots[i])));
  function goRoom(index) {
    const room = layout.rooms[index];
    travel(pose(H.roomView(room)), () => setHash(`room-${room.key}`));
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = H.fovFor(camera.aspect);
    camera.updateProjectionMatrix();
    schedule();
  }

  const pressed = new Set();
  let drag = null;
  let running = false;
  let last = 0;
  function frame(now) {
    running = false;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let moving = false;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.dur);
      Object.assign(cam, H.tweenPose(tween.path, tween.start, tween.target, k));
      if (k >= 1) {
        const { after } = tween;
        tween = null;
        after();
      }
      whereAmI();
      moving = true;
    }
    const input = H.keyInput(pressed);
    if (input.forward || input.strafe) {
      tween = null;
      [cam.x, cam.z] = H.slide([cam.x, cam.z], H.moveStep([cam.x, cam.z], cam.yaw, input, dt), rects);
      whereAmI();
      moving = true;
    }
    camera.position.set(cam.x, P.eye, cam.z);
    camera.rotation.set(cam.pitch, cam.yaw, 0);
    renderer.render(scene, camera);
    if (moving || drag) {
      const before = quality.tier;
      H.recordFrame(quality, now);
      if (quality.tier !== before) renderer.setPixelRatio(H.pixelRatio(quality.tier, window.devicePixelRatio));
    }
    if (moving) schedule();
  }
  function schedule() {
    if (running) return;
    running = true;
    requestAnimationFrame((now) => {
      if (!last || now - last > 100) last = now - 16;
      frame(now);
    });
  }

  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  on(canvas, "pointerdown", (ev) => {
    drag = { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY };
    canvas.setPointerCapture(ev.pointerId);
  });
  on(canvas, "pointermove", (ev) => {
    if (!drag) return;
    Object.assign(cam, H.lookDelta(cam, ev.clientX - drag.x, ev.clientY - drag.y));
    drag.x = ev.clientX;
    drag.y = ev.clientY;
    tween = null;
    help.hidden = true;
    schedule();
  });
  on(canvas, "pointerup", (ev) => {
    const tap = drag && H.isTap(ev.clientX - drag.sx, ev.clientY - drag.sy);
    drag = null;
    if (!tap) return;
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
    const action = raycaster.intersectObjects(pickable, false)[0]?.object.userData.action;
    if (!action) return;
    if (action.suggest) return suggestDialog.showModal();
    if (action.room !== undefined) return goRoom(action.room);
    if (action.index === current && !tween) openRead();
    else goTo(action.index);
  });
  on(canvas, "pointercancel", () => (drag = null));

  const readDialog = $("#hall-read-dialog");
  const mapDialog = $("#hall-map-dialog");
  const suggestDialog = $("#hall-suggest-dialog");
  function openRead() {
    const i = Math.max(current, 0);
    const x = order[i];
    $("#hall-read-body").innerHTML = exhibitHtml(x, { no: list.indexOf(x) + 1, i: 0, rooms, lang });
    $("#hall-read-body .exhibit").classList.add("lit");
    $("#hall-full").href = exhibitPath(x.id, lang);
    if (current < 0) goTo(i);
    help.hidden = true;
    readDialog.showModal();
  }
  const step = (delta) => goTo(H.stepIndex(current, delta, order.length));
  on($("#hall-prev"), "click", () => step(-1));
  on($("#hall-next"), "click", () => step(1));
  on($("#hall-read"), "click", openRead);
  on($("#hall-map-open"), "click", () => {
    help.hidden = true;
    mapDialog.showModal();
  });
  on(stage, "click", (ev) => {
    const spot = ev.target.closest("[data-spot]");
    const room = ev.target.closest("[data-room]");
    if (!spot && !room) return;
    ev.preventDefault();
    mapDialog.close();
    if (spot) goTo(Number(spot.dataset.spot));
    else goRoom(layout.rooms.findIndex((r) => r.key === room.dataset.room));
  });
  for (const btn of stage.querySelectorAll("[data-close]")) on(btn, "click", () => btn.closest("dialog").close());
  on($("#hall-exit"), "click", exit);
  on(document, "keydown", (ev) => {
    if (!isMuseumKey(ev) || document.querySelector("dialog[open]")) return;
    const key = ev.key.toLowerCase();
    if (key === "escape") return exit();
    if (key === "enter" && ev.target === document.body) return openRead();
    if (H.stepKey(key)) return step(H.stepKey(key));
    const input = H.keyInput([key]);
    if (!input.forward && !input.strafe) return;
    ev.preventDefault();
    pressed.add(key);
    schedule();
  });
  on(document, "keyup", (ev) => pressed.delete(ev.key.toLowerCase()));
  on(window, "blur", () => pressed.clear());
  on(window, "resize", resize);

  function exit() {
    off.abort();
    for (const d of disposables) d.dispose();
    for (const p of plaques) p.material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    stage.hidden = true;
    root.classList.remove("hall-on");
    onExit(hashId);
  }

  const startAt = H.startFor(layout, location.hash);
  if (poster !== null) Object.assign(cam, pose(H.posterView(layout)));
  else if (!startAt) Object.assign(cam, pose(H.lobbyView(layout)));
  else if (startAt.room !== undefined) Object.assign(cam, pose(H.roomView(layout.rooms[startAt.room])));
  else Object.assign(cam, pose(H.viewpoint(layout.slots[startAt.exhibit])));
  whereAmI();
  resize();
  requestAnimationFrame(() => {
    root.dataset.hall = "ready";
    if (poster === null) $("#hall-map-open").focus({ preventScroll: true });
  });
}

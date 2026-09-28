// DOM and three.js glue for the 3D hall. Every decision (plan, framing, movement, tiers, text layout,
// what to offer) lives in hall.js, museum.js and i18n.js, which are unit-tested. Keep this file branch-light.
// three.js and the exhibit data are only downloaded when the visitor presses Enter.
import { STRINGS, langOf, localizeExhibits, switchHref } from "./i18n.js";
import { exhibitHtml, exhibitPath, isMuseumKey } from "./museum.js";
import * as H from "./hall.js";

const $ = (sel) => document.querySelector(sel);
const root = document.documentElement;
const lang = langOf(root.lang);
const t = STRINGS[lang];
const enterBtn = $("#hall-enter");
const statusEl = $("#hall-status");
const stage = $("#hall-stage");
const langSwitch = $("#lang-switch");

const probe = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
const signals = {
  coarsePointer: matchMedia("(pointer: coarse)").matches,
  devicePixelRatio: window.devicePixelRatio,
  hardwareConcurrency: navigator.hardwareConcurrency,
  maxTextureSize: probe?.getParameter(probe.MAX_TEXTURE_SIZE),
  renderer: probe?.getParameter(probe.getExtension("WEBGL_debug_renderer_info")?.UNMASKED_RENDERER_WEBGL ?? probe.RENDERER),
};
probe?.getExtension("WEBGL_lose_context")?.loseContext();
const mode = H.hallMode({
  webgl: Boolean(probe),
  saveData: navigator.connection?.saveData === true,
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
});

async function enter() {
  enterBtn.disabled = true;
  statusEl.textContent = t.hallLoading;
  root.dataset.hall = "loading";
  try {
    const [THREE, data] = await Promise.all([import(H.VENDOR), import("./exhibits.js")]);
    start(THREE, data);
  } catch (err) {
    console.error(err);
    statusEl.textContent = t.hallFailed;
    enterBtn.disabled = false;
    root.dataset.hall = "failed";
  }
}

function start(THREE, { EXHIBITS, ROOM_NAMES }) {
  const rooms = ROOM_NAMES[lang];
  const keys = Object.keys(rooms);
  const list = localizeExhibits(EXHIBITS, lang);
  const order = H.walkOrder(list, keys);
  const layout = H.hallLayout(order, keys);
  const poster = H.posterParam(location.search, layout);
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
  scene.fog = new THREE.Fog(0x111014, 10, 36);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 80);
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
  function texture(w, h, draw, repeat) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    if (repeat) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(...repeat);
    }
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

  const planks = texture(256, 256, (g, w, h) => {
    g.fillStyle = "#1c1815";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = ["#221d19", "#1f1a16", "#241f1a", "#1a1613"][(i * 5) % 4];
      g.fillRect(i * 32 + 1, 0, 30, h);
      g.fillStyle = "#15120f";
      g.fillRect(i * 32, ((i * 97) % h) | 0, 32, 2);
    }
  }, [4, 20]);
  const panels = texture(256, 256, (g, w, h) => {
    g.fillStyle = "#2b2831";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#35313c";
    g.lineWidth = 4;
    g.strokeRect(12, 12, w - 24, h - 24);
  }, [12, 2]);
  const cone = texture(8, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255,236,190,0.9)");
    grad.addColorStop(1, "rgba(255,236,190,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const pool = texture(128, 128, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, "rgba(255,236,190,0.8)");
    grad.addColorStop(1, "rgba(255,236,190,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  });

  function drawLines(g, lines, textless) {
    g.textBaseline = "top";
    for (const l of lines) {
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
  const measureWith = (g) => (text, font) => ((g.font = font), g.measureText(text).width);

  function plaqueTexture(x) {
    const size = spec.texture;
    return texture(size, Math.round(size * 1.25), (g) => {
      g.scale(size / 1024, size / 1024);
      g.fillStyle = "#f3ece0";
      g.fillRect(0, 0, 1024, 1280);
      g.strokeStyle = "#d9ccb3";
      g.lineWidth = 6;
      g.strokeRect(20, 20, 984, 1240);
      const blocks = H.plaqueBlocks(x, { no: list.indexOf(x) + 1, rooms, lang });
      const out = H.layoutPlaque(blocks, { width: 1024, height: 1280, pad: 72, families }, measureWith(g));
      g.fillStyle = "#dccfb6";
      for (const y of out.rules) g.fillRect(72, y, 880, 3);
      drawLines(g, out.lines, poster !== null);
    });
  }
  function signTexture(text, w = 1024, h = 160) {
    return texture(w, h, (g) => {
      g.fillStyle = "#2a2418";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#c9a45c";
      g.lineWidth = 6;
      g.strokeRect(10, 10, w - 20, h - 20);
      if (poster !== null) return;
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
  const P = H.PLAN;
  const length = layout.back - layout.end;
  const midZ = (layout.back + layout.end) / 2;
  const wallMat = lambert({ map: panels });
  const brass = lambert({ color: 0xc9a45c, emissive: 0x2a2010 });
  add(new THREE.PlaneGeometry(P.width, length), lambert({ map: planks }), [0, 0, midZ], [-Math.PI / 2, 0, 0]);
  add(new THREE.PlaneGeometry(P.width, length), basic({ color: 0x0c0b0f }), [0, P.wallHeight, midZ], [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) {
    add(new THREE.PlaneGeometry(length, P.wallHeight), wallMat, [side * (P.width / 2), P.wallHeight / 2, midZ], [0, -side * (Math.PI / 2), 0]);
    for (const y of [0.06, 3.55]) add(new THREE.BoxGeometry(0.04, 0.05, length), brass, [side * (P.width / 2 - 0.02), y, midZ]);
  }
  add(new THREE.PlaneGeometry(P.width, P.wallHeight), wallMat, [0, P.wallHeight / 2, layout.end]);
  add(new THREE.PlaneGeometry(P.width, P.wallHeight), wallMat, [0, P.wallHeight / 2, layout.back], [0, Math.PI, 0]);
  const lamp = basic({ color: 0xf6e7c8 });
  for (let z = layout.back - 2; z > layout.end; z -= P.slot) add(new THREE.BoxGeometry(1.4, 0.04, 0.24), lamp, [0, P.wallHeight - 0.02, z]);

  add(new THREE.PlaneGeometry(4.4, 0.69), basic({ map: signTexture(t.hallSign) }), [0, 3.6, 0]);
  add(new THREE.PlaneGeometry(4, 0.62), basic({ map: signTexture(t.hallEnd) }), [0, 2.2, layout.end + 0.02]);
  for (const r of layout.rooms) {
    add(new THREE.PlaneGeometry(3.6, 0.56), basic({ map: signTexture(rooms[r.key]) }), [0, 3.3, r.start]);
    add(new THREE.PlaneGeometry(P.width, 0.05), brass, [0, 0.005, r.start], [-Math.PI / 2, 0, 0]);
  }

  // ---------- plaques and route sculptures ----------
  const pickable = [];
  const plinthMat = lambert({ color: 0x26222b });
  const nodeMat = lambert({ color: 0x7fdc8c, emissive: 0x2e6b37 });
  const failMat = lambert({ color: 0xc2412d, emissive: 0x7a1a10 });
  const coneMat = glow(cone, 0.06);
  const poolMat = glow(pool, 0.35);
  layout.slots.forEach((slot, i) => {
    const x = order[i];
    const inward = slot.side * -0.035;
    add(new THREE.BoxGeometry(0.05, P.plaque.h + 0.14, P.plaque.w + 0.14), brass, [slot.x + inward, P.plaque.y, slot.z]);
    const plaque = add(new THREE.PlaneGeometry(P.plaque.w, P.plaque.h), basic({ map: plaqueTexture(x) }), [slot.x + inward * 2, P.plaque.y, slot.z], [0, slot.rotY, 0]);
    plaque.userData.index = i;
    pickable.push(plaque);

    const [px, pz] = H.plinthPosition(slot);
    const group = new THREE.Group();
    group.position.set(px, 0, pz);
    scene.add(group);
    const plinth = add(new THREE.BoxGeometry(0.8, 1, 0.8), plinthMat, [0, 0.5, 0], undefined, group);
    add(new THREE.BoxGeometry(0.86, 0.04, 0.86), brass, [0, 1.02, 0], undefined, group);
    plinth.userData.index = i;
    pickable.push(plinth);
    const pts = H.routePoints(x.hops.length).map((p) => new THREE.Vector3(...p));
    pts.forEach((p, k) => {
      const last = k === pts.length - 1;
      add(new THREE.SphereGeometry(last ? 0.11 : 0.07, 16, 12), last ? failMat : nodeMat, [p.x, p.y, p.z], undefined, group);
    });
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.slice(0, -1)), 48, 0.014, 6), nodeMat, [0, 0, 0], undefined, group);
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.slice(-2)), 8, 0.02, 6), failMat, [0, 0, 0], undefined, group);
    const top = pts.at(-1);
    add(new THREE.TorusGeometry(0.18, 0.012, 8, 32), failMat, [top.x, top.y, top.z], [Math.PI / 2, 0, 0], group);

    const [sx, sz] = H.spotPosition(slot);
    add(new THREE.CylinderGeometry(0.05, 1.3, 3.9, 24, 1, true), coneMat, [sx, P.wallHeight - 1.95, sz]);
    add(new THREE.PlaneGeometry(2.6, 2.6), poolMat, [sx, 0.01, sz], [-Math.PI / 2, 0, 0]);
  });

  // ---------- camera, walking, picking ----------
  const cam = { x: 0, z: 0, yaw: 0, pitch: 0 };
  function setView({ pos, look }) {
    Object.assign(cam, { x: pos[0], z: pos[2] }, H.lookAngles(pos, look));
  }
  let current = H.indexForHash(layout, location.hash);
  setView(poster !== null ? H.posterView(layout, poster) : current >= 0 ? H.viewpoint(layout.slots[current]) : H.lobbyView(layout));

  const caption = $("#hall-caption");
  const help = $("#hall-help");
  function setCurrent(i) {
    if (i === current && caption.textContent) return;
    current = i;
    const x = order[i];
    caption.textContent = x.title;
    history.replaceState(null, "", `#${x.id}`);
    langSwitch.href = switchHref(langSwitch.getAttribute("href"), x.id);
  }

  let tween = null;
  function goTo(i) {
    const v = H.viewpoint(layout.slots[i]);
    const to = { x: v.pos[0], z: v.pos[2], ...H.lookAngles(v.pos, v.look) };
    setCurrent(i);
    help.hidden = true;
    if (mode.jump) Object.assign(cam, to);
    else tween = { from: { ...cam }, to, t0: performance.now(), dur: 900 };
    schedule();
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
      const k = H.ease((now - tween.t0) / tween.dur);
      const { from, to } = tween;
      cam.x = from.x + (to.x - from.x) * k;
      cam.z = from.z + (to.z - from.z) * k;
      cam.yaw = H.lerpAngle(from.yaw, to.yaw, k);
      cam.pitch = from.pitch + (to.pitch - from.pitch) * k;
      if (k >= 1) tween = null;
      moving = true;
    }
    const input = H.keyInput(pressed);
    if (input.forward || input.strafe) {
      tween = null;
      [cam.x, cam.z] = H.clampPosition(H.moveStep([cam.x, cam.z], cam.yaw, input, dt), layout);
      setCurrent(H.nearestIndex(layout, [cam.x, cam.z]));
      moving = true;
    }
    camera.position.set(cam.x, H.PLAN.eye, cam.z);
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
    const hit = raycaster.intersectObjects(pickable, false)[0];
    if (!hit) return;
    const i = hit.object.userData.index;
    if (i === current && !tween) openRead();
    else goTo(i);
  });
  on(canvas, "pointercancel", () => (drag = null));

  const readDialog = $("#hall-read-dialog");
  const listDialog = $("#hall-list-dialog");
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
  on($("#hall-list-open"), "click", () => {
    help.hidden = true;
    listDialog.showModal();
  });
  on(listDialog, "click", (ev) => {
    const btn = ev.target.closest("[data-spot]");
    if (!btn) return;
    listDialog.close();
    goTo(Number(btn.dataset.spot));
  });
  for (const btn of stage.querySelectorAll("[data-close]")) on(btn, "click", () => btn.closest("dialog").close());
  on($("#hall-exit"), "click", exit);
  on(document, "keydown", (ev) => {
    if (!isMuseumKey(ev) || document.querySelector("dialog[open]")) return;
    const key = ev.key.toLowerCase();
    if (key === "escape") return exit();
    if (key === "enter" && ev.target === document.body) return openRead();
    if (H.stepKey(key)) return step(H.stepKey(key));
    if (!H.keyInput([key]).forward && !H.keyInput([key]).strafe) return;
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
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    stage.hidden = true;
    root.classList.remove("hall-on");
    enterBtn.disabled = false;
    statusEl.textContent = "";
    root.dataset.hall = "";
    document.getElementById(order[Math.max(current, 0)].id)?.scrollIntoView({ block: "center" });
    enterBtn.focus({ preventScroll: true });
  }

  statusEl.textContent = "";
  if (current >= 0) setCurrent(current);
  resize();
  requestAnimationFrame(() => {
    root.dataset.hall = "ready";
    if (poster === null) $("#hall-list-open").focus({ preventScroll: true });
  });
}

if (mode.enter) {
  enterBtn.addEventListener("click", enter);
  if (new URLSearchParams(location.search).has("poster")) enter();
} else {
  enterBtn.hidden = true;
  statusEl.textContent = t[mode.message];
  root.dataset.hall = "off";
}

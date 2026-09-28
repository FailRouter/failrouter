// Page glue for /hall/: decides whether to offer 3D, and on Enter downloads three.js, the exhibit
// data and hall-scene.js (the 3D world). Decisions live in hall-mode.js and hall.js (unit-tested);
// keep this branch-light.
import { STRINGS, langOf } from "./i18n.js";
import { VENDOR, hallMode } from "./hall-mode.js";

const $ = (sel) => document.querySelector(sel);
const root = document.documentElement;
const lang = langOf(root.lang);
const t = STRINGS[lang];
const enterBtn = $("#hall-enter");
const statusEl = $("#hall-status");

const probe = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
const signals = {
  coarsePointer: matchMedia("(pointer: coarse)").matches,
  devicePixelRatio: window.devicePixelRatio,
  hardwareConcurrency: navigator.hardwareConcurrency,
  maxTextureSize: probe?.getParameter(probe.MAX_TEXTURE_SIZE),
  renderer: probe?.getParameter(probe.getExtension("WEBGL_debug_renderer_info")?.UNMASKED_RENDERER_WEBGL ?? probe.RENDERER),
};
probe?.getExtension("WEBGL_lose_context")?.loseContext();
const mode = hallMode({
  webgl: Boolean(probe),
  saveData: navigator.connection?.saveData === true,
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
});

async function enter() {
  enterBtn.disabled = true;
  statusEl.textContent = t.hallLoading;
  root.dataset.hall = "loading";
  try {
    const [THREE, data, scene] = await Promise.all([import(VENDOR), import("./exhibits.js"), import("./hall-scene.js")]);
    scene.start({ THREE, data, lang, mode, signals, onExit });
    statusEl.textContent = "";
  } catch (err) {
    console.error(err);
    statusEl.textContent = t.hallFailed;
    enterBtn.disabled = false;
    root.dataset.hall = "failed";
  }
}

function onExit(id) {
  enterBtn.disabled = false;
  root.dataset.hall = "";
  if (id) document.getElementById(id)?.scrollIntoView({ block: "center" });
  enterBtn.focus({ preventScroll: true });
}

if (mode.enter) {
  enterBtn.addEventListener("click", enter);
  // The page's map walks into the chosen room in 3D; without 3D its links scroll to the room list.
  $(".hall-plan .hall-map").addEventListener("click", (ev) => {
    const link = ev.target.closest("[data-room]");
    if (!link || enterBtn.disabled) return;
    ev.preventDefault();
    history.replaceState(null, "", `#room-${link.dataset.room}`);
    enter();
  });
  if (new URLSearchParams(location.search).has("poster")) enter();
} else {
  enterBtn.hidden = true;
  statusEl.textContent = t[mode.message];
  root.dataset.hall = "off";
}

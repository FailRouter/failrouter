// DOM glue only. All decisions live in museum.js (unit-tested); keep this file branch-light.
import { EXHIBITS, ROOMS } from "./exhibits.js";
import {
  ALL,
  TRACE,
  galleryHtml,
  isMuseumKey,
  roomsHtml,
  stepId,
  traceDelay,
  visibleIn,
  wrongTurnId,
} from "./museum.js";

const $ = (sel) => document.querySelector(sel);
const gallery = $("#gallery");
const roomsNav = $("#rooms");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hashId = () => location.hash.slice(1);

let currentRoom = ALL;

async function playTrace() {
  const el = $("#trace");
  for (const line of TRACE) {
    if (!reducedMotion) await new Promise((r) => setTimeout(r, traceDelay(line)));
    el.textContent += `\n${line}`;
  }
}

function render() {
  roomsNav.innerHTML = roomsHtml(EXHIBITS, ROOMS, currentRoom);
  gallery.innerHTML = galleryHtml(EXHIBITS, ROOMS, currentRoom);
  observe();
}

// Fade exhibits in as the visitor walks past them.
let io;
function observe() {
  if (reducedMotion || !("IntersectionObserver" in window)) {
    for (const el of gallery.children) el.classList.add("lit");
    return;
  }
  io?.disconnect();
  io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) if (en.isIntersecting) en.target.classList.add("lit");
    },
    { threshold: 0.15 },
  );
  for (const el of gallery.children) io.observe(el);
}

function focusExhibit(id, push = true) {
  if (!id) return;
  if (!document.getElementById(id)) {
    currentRoom = ALL;
    render();
  }
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("lit");
  el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  el.focus({ preventScroll: true });
  for (const x of gallery.querySelectorAll(".spot")) x.classList.remove("spot");
  el.classList.add("spot");
  if (push) history.replaceState(null, "", `#${id}`);
}

const wrongTurn = () => focusExhibit(wrongTurnId(visibleIn(EXHIBITS, currentRoom), hashId(), Math.random()));

roomsNav.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-room]");
  if (!btn) return;
  currentRoom = btn.dataset.room;
  render();
});

$("#wrong-turn").addEventListener("click", wrongTurn);

document.addEventListener("keydown", (ev) => {
  if (!isMuseumKey(ev)) return;
  if (ev.key === "r") wrongTurn();
  else focusExhibit(stepId(visibleIn(EXHIBITS, currentRoom), hashId(), ev.key));
});

window.addEventListener("hashchange", () => focusExhibit(hashId(), false));

render();
playTrace();
focusExhibit(hashId(), false);

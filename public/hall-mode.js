// The only decisions /hall/ makes before the visitor presses Enter: whether to offer 3D, where
// three.js lives, and what Enter downloads. Tiny on purpose; everything else loads with the scene.

/** Vendored three.js, and roughly what Enter downloads (gzip KB, checked in test/site.test.js). */
export const VENDOR = "/vendor/three.module.min.js";
export const DOWNLOAD_KB = 175;

/**
 * Whether to offer the 3D hall, which message (STRINGS key) to show instead, and whether to jump
 * between plaques instead of walking (reduced motion).
 */
export function hallMode({ webgl, saveData, reducedMotion }) {
  if (!webgl) return { enter: false, message: "hallNoWebgl", jump: true };
  if (saveData) return { enter: false, message: "hallSaveData", jump: true };
  return { enter: true, message: null, jump: Boolean(reducedMotion) };
}

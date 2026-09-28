---
name: hall-interaction-check
description: Verify 3D hall (/hall/) interactions end to end in headless Chrome over the DevTools protocol — floor taps, hover ring, grab-to-look drag, arrow-key turning, touch taps in a room — with synthetic mouse / key / touch input and screenshots, no new dependencies. Use when asked "3D 场景交互测一下", "点地板能不能走", "拖动方向对不对", "验证 hall 控制", "check the hall controls in Chrome", after changing public/hall-scene.js or the movement / picking functions in public/hall.js, or when a hall screenshot looks wrong (only a wall on screen, camera in the wrong place). Covers the run.mjs driver beside this file (reuses scripts/viewport.js helpers), reading the "you are here" map dot + caption + hash as position proof, the same-document hash navigation trap (no Page.loadEventFired), Input.dispatchTouchEvent for pointer type "touch", temporary window.__ debug hooks and removing them, and the portrait ~52° vertical FOV that makes a close wall fill the screen.
---

# hall-interaction-check

结果：一条命令在 headless Chrome（SwiftShader 软件 WebGL）里走一遍 3D 大厅的主要交互，打印位置证据并在输出目录留截图，人工看图确认。

## 机制
- 复用 `scripts/viewport.js` 的 `findChrome` / `chromeFlags` / `devtoolsUrl` / `HALL_ENTER` / `HALL_STATE` / `resolveFile`，自带一个本地静态服务器读 `public/`，和 `pnpm viewport` 同一套路子，不联网。
- 相机状态在 `hall-scene.js` 闭包里拿不到。位置证据用：小地图 `.map-you` 的 `cx/cy`、`#hall-caption` 文本、`location.hash`（深入房间后切到最近展品 id）。
- 朝向没法读，只能靠截图判断（拖动方向、转身）。

## 步骤
```sh
mkdir -p /tmp/hallcheck
node .opencode/skills/hall-interaction-check/run.mjs /tmp/hallcheck
```
用 opencode 预批准的临时目录代替 `/tmp/hallcheck`。脚本依次做这些事：
1. 900×600 桌面：进大厅（在大堂），截图 `1-lobby`。
2. 鼠标悬停在地板上，截图 `2-hover`（应该有淡金色圈），打印 cursor。
3. 点地板，等 2.5 s，截图 `3-walked`：小地图位置点的 `cy` 应该变小（沿主廊往前走了）。
4. 往右拖 200 px，截图 `4-dragged-right`：抓取式视角下应该向左转。
5. 按住 ArrowRight 600 ms，截图 `5-key-right`：应该向右转。
6. 390×780 触屏：用 `?t=2#room-routing` 进房间，截图 `6-room`。点一下地板，截图 `7a/7b/7c`（松手后 0 / 300 ms），2.5 s 后截图 `7-room-walked`：caption 和 hash 应该变成最近的展品。

截图用 `sips -Z 300 x.png --out small-x.png` 缩小后再 Read，省 token。

## 验证
- 终端打印的 `[cx, cy, hash, caption]` 每一步都符合预期。
- 截图人工确认：有落点圈；拖动和转身方向正确；走完后不是满屏墙。

## 坑
- **只改 hash 的跳转卡死**：从 `/hall/` 导航到 `/hall/#room-x` 属于同文档跳转，不会触发 `Page.loadEventFired`，脚本会一直等。修法：加一个无关 query，比如 `/hall/?t=2#room-x`，强制整页加载（`posterParam` 会忽略未知参数）。
- **macOS 没有 `timeout` 命令**：用 `(node run.mjs out & PID=$!; sleep 140; kill $PID)` 兜底。脚本结尾已经 `process.exit(0)`。
- **截图满屏是墙，不一定是 bug**：竖屏手机的纵向视野只有约 52°（`fovFor(0.5)`），不是 80°。离墙 3 m 以内就看不到地板和墙顶的房间牌。先临时加 `window.__cam = cam`，并在 `walkTo` 里把 `floorTarget` 的输入输出记到 `window.__dbg`，用 `Runtime.evaluate` 读出来，确认相机到底在哪（2026-09 的这次正是这样定出 `STAND_OFF = 4`）。**提交前 `grep -c "__" public/hall-scene.js` 必须为 0。**
- **触摸输入**：先 `Emulation.setTouchEmulationEnabled`，再用 `Input.dispatchTouchEvent` 发 touchStart / touchEnd，页面收到的是 `pointerType: "touch"`。鼠标悬停逻辑只认 `"mouse"`，所以触屏不会出现悬停圈，这是正常的。
- 脚本从 `.opencode/skills/...` 往上三层定位仓库根目录。移动脚本位置时要同步改 `repo`。

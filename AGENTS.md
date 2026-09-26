# AGENTS.md

Instructions for AI coding agents (and humans) working in this repository.

## What this is

Failrouter, the Museum of Failed Routes: a static site of famous outages, each told hop by hop, in English and Simplified Chinese. Production is `https://failrouter.com` (English) and `https://failrouter.com/zh/` (Chinese). `https://www.failrouter.com` serves the same files; every page declares the apex as canonical.

Stack: a Cloudflare Worker with static assets only (`wrangler.jsonc` → `assets.directory = ./public`), plain HTML/CSS/ES modules, `node:test` with built-in coverage, headless Chrome over the DevTools protocol for the narrow-screen check, pnpm, GitHub Actions.

## Public repository: no sensitive data (hard rule)

This repo is public under the MIT license. Never commit:

- API tokens, secrets, `.env` / `.dev.vars` contents (both are gitignored);
- Cloudflare account IDs, zone IDs, database / namespace IDs, workers.dev subdomains;
- personal or company email addresses, local paths (`/Users/...`), internal ticket keys, colleague names;
- screenshots or sample data taken from a real account.

This file, commit messages and PR descriptions are public too: no hosting plans, account names, business strategy or anything else that belongs in a private note.

Credentials live only in GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (environment `production`), and `SMOKE_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` (repository) for the post-deploy smoke test. If you find anything above in a diff or in history, stop and tell the maintainer before doing anything else.

Commits use the GitHub noreply identity configured in the local git config. Never commit with a work or personal email.

## Git and release flow (hard rule)

Merging to `main` deploys to production (`.github/workflows/ci.yml`, job `deploy`, which waits for `test` and `viewport`).

1. Before changing code, ask whether to create a branch and what to name it. Don't work on `main` directly.
2. On the branch: implement → `pnpm check` green (and `pnpm viewport` when page output changed) → commit.
3. **Pushing, opening a PR and merging each need explicit approval from the maintainer.** Never run `gh pr create` or merge on your own. Remind them that merge = production deploy.
4. Docs-only changes (`README.md`, `AGENTS.md`) may be committed on `main`; pushing still needs approval.
5. This repo is pinned to its GitHub account via local git config (`gh.configDir`, credential helper). Use plain `gh`; before the first write, `gh api user -q .login` must print the maintainer's account.
6. Commit messages: `<scope>: <summary>`, scope one of `exhibits`, `site`, `style`, `i18n`, `seo`, `ci`, `docs`.

## How to weigh a decision

Hard rules in this file sit above any trade-off. Inside them:

- **Questions with an objectively right answer** (facts in an exhibit, security, accessibility, SEO rules, performance, test coverage): facts and standards first, then the visitor, then maintenance cost.
- **Judgement calls** (copy, which exhibit next, layout, interaction): the visitor first, then maintenance cost and reach, then implementation elegance.
- If unsure which kind a question is, ask "is there a correct answer?" and say in your reply which order you used.

Audience (a working assumption, not measured data; write "assumed" when you rely on it):

1. Developers and SREs who arrive from search or a shared link wanting "what happened in the X outage", often on a phone, reading one exhibit and maybe one more. **Default anchor.**
2. Chinese-speaking developers arriving from Chinese search engines or communities; same need, in Chinese.
3. People who cite an exhibit in a talk, a postmortem or a class and need a stable link and a named source.

Not optimising for: people looking for blame, live incident status, or vendor comparisons.

## Generated pages (hard rule)

`public/index.html`, `public/exhibits/<id>/index.html`, `public/zh/index.html`, `public/zh/exhibits/<id>/index.html`, `public/sitemap.xml` and `public/robots.txt` are **generated** by `scripts/site.js` (pure) via `scripts/build.js` (I/O). Never hand-edit them.

- After changing `public/exhibits.js`, `public/i18n.js`, `public/museum.js` or `scripts/site.js`: run `pnpm build` and commit the output. `test/site.test.js` fails when a committed file is stale, so deploy needs no build step.
- `public/og.png` and `public/og-zh.png` are rendered from `scripts/og.svg` and `scripts/og-zh.svg` with `pnpm build --og` (needs `rsvg-convert` and a Simplified Chinese system font). Commit the PNGs.
- `public/404.html` is hand-written, bilingual on one page (Workers assets serve a single 404), and stays `noindex`.

## Tests and coverage gate (hard rule)

- **Core code = `public/*.js` and `scripts/*.js`, except `public/app.js`, `scripts/build.js` and `scripts/viewport-run.js`. Lines, branches and functions must each stay ≥ 90%.** `pnpm coverage` enforces it locally and in CI.
- The three excluded files are glue: `app.js` wires the DOM, `build.js` writes files, `viewport-run.js` drives Chrome. Keep them that way: any decision (filtering, formatting, navigation, escaping, page markup, metadata, language choice, what counts as a narrow-screen failure) goes into `public/museum.js`, `public/i18n.js`, `scripts/site.js` or `scripts/viewport.js` as a pure function with tests. Don't move logic into glue to dodge the gate.
- Never widen `--test-coverage-exclude`, lower a threshold, or delete tests to get green. If an exclusion is truly needed, explain why in the PR.
- Unit tests make no network calls. `pnpm viewport` only talks to a local server and a local Chrome.

```sh
pnpm install
pnpm coverage                 # unit tests + coverage gate
pnpm check                    # coverage + wrangler deploy --dry-run (run before every commit)
pnpm viewport                 # every page at 320 / 375 / 430 px in headless Chrome (CI job `viewport`)
pnpm viewport --shots <dir>   # same, plus 375 px full-page screenshots for review
```

## Bilingual: English + Simplified Chinese (hard rule)

- **URLs**: English at the root, Chinese under `/zh/` (`/zh/`, `/zh/exhibits/<id>/`). Both sets are permanent. The variant is Simplified Chinese only (`zh-Hans`); don't add Traditional without the maintainer's approval.
- **No automatic language redirect.** It would need Worker code (see performance rules) and hides pages from crawlers. Every page links to the same page in the other language (`.lang-switch`); on the home page `app.js` keeps the `#<id>` anchor on that link.
- **UI strings** live only in `public/i18n.js` (`STRINGS.en` / `STRINGS.zh`). Both dictionaries have exactly the same keys and the same `{placeholders}`; `test/i18n.test.js` enforces it. No user-visible string literals in `app.js`, `museum.js` or `site.js`: add a key.
- **Exhibit text**: each exhibit carries `zh: { subject, title, duration, hops, lesson }`, room names in `ROOMS_ZH`. English is the source of truth. The Chinese version has the same number of hops, states the same facts, and adds nothing. `source` stays in its original language and is marked `lang="en"` on Chinese pages.
- **Chinese `subject`** is written the way Chinese speakers search for the event (`CrowdStrike 蓝屏事件（2024 年 7 月）`), not a word-for-word translation.
- **Chinese `title`** is rewritten for Chinese readers, not translated. It is the page `h1`, the card link text on the home page and the JSON-LD headline, and only reaches `<title>` when `subject：title` fits 60 weighted characters. So: phrasing a person would actually say, plus a cause keyword `subject` doesn't already carry when possible (`一条 BGP 路由，把 YouTube 引向了巴基斯坦`, `整数溢出，火箭 37 秒后自毁`). English puns and names Chinese readers don't search for (`Pounds, Meet Newtons`, `Channel File 291`) are replaced, not kept. Facts stay within the English hops. Offer the maintainer 2–3 options per title rather than picking alone.
- A new exhibit or UI string ships in both languages in the same PR. A Chinese page that is an English copy fails `test/site.test.js`.
- Terminal output in the traceroute animation stays English: it imitates a real tool.

## Narrow screens (hard rule)

- Every page must fit **320, 375 and 430 px** wide with no sideways scrolling. `pnpm viewport` checks all pages, including the 404, and runs in CI.
- **Two breakpoints only**, both in `public/style.css`: `(max-width: 480px)` for layout and `(max-width: 480px), (hover: none)` for touch sizing. No other breakpoints, no user-agent sniffing, no JS layout switches. A test pins the list.
- **Touch targets ≥ 44 px high** on narrow or touch screens: room buttons, the wrong-turn button, the language switch, and the previous / next / main-hall links. Inline text links in sentences are exempt. Add any new control to `TOUCH_SELECTOR` in `scripts/viewport.js` and to the touch block in the CSS.
- Long unbreakable text (hostnames, commands, `rm -rf`) must wrap: cards and the trace use `overflow-wrap: anywhere`; grid children need `min-width: 0`.
- Keyboard hints are hidden on touch screens (`.keys-hint`).
- Anything fixed to a screen edge must clear `env(safe-area-inset-*)`. There is none today; keep it that way unless it's needed.
- Chinese typography: `body:lang(zh)` line height 1.75, **system CJK fonts only** (`--serif-zh`), no italics on Chinese text. Set fonts on `body` / `article`, never on a bare `:lang(zh)` rule (it overrides every component's own font).
- Before opening a PR that changes page output, look at the `--shots` screenshots at 375 px for both languages.

## UI / UX / SEO review before page changes (hard rule)

Every page here is both the product and its only distribution channel. Before implementing anything that changes page output (`scripts/site.js` markup, `public/*.html`, `public/style.css`, `public/app.js`, `public/i18n.js`, exhibit text), write a short review (≤ 15 lines) covering the three lenses below. Paste it unchanged into the PR description. PRs with no page output change say so in one line ("Three lenses: no page output change").

Priority when they conflict: **facts and no-blame > house style > SEO > UX > visual polish**. An SEO idea that needs speculation, blame, clickbait or keyword stuffing loses.

- **SEO**: the search query this page answers, quoted; title ≤ 60 and description 70–155 (weighted length, CJK = 2); canonical, hreflang `en` + `zh-Hans` + `x-default`, `og:locale` + `og:locale:alternate`; JSON-LD types and `inLanguage`; in the sitemap with alternates; at least one in-site link to it (no orphans); the content is in the HTML, not injected by JS; URL never changes after launch (redirect first if it must); no new render-blocking script, web font or heavy image.
- **UX**: what a visitor understands in 3 seconds and what they do next; works with JS off; switching language lands on the same exhibit; a shared link points at a specific exhibit (`/exhibits/<id>/` or `/#<id>`); dead ends offer a way back (the 404 links both main halls); reduced motion respected; keyboard walk still works.
- **UI**: existing colours only (the `:root` variables); contrast ≥ 4.5:1 for text; one `h1`, headings in order; breadcrumb matches `BreadcrumbList`; checked at 375 px in both languages.

Four weeks after an SEO change, check the per-page numbers in Google Search Console before calling it a win. No analytics scripts on the site (see performance rules).

## SEO rules (machine-checked in `test/site.test.js`)

- Every indexable page is static HTML with its content in the markup; JS only adds filters, keyboard and motion. Pages must read fine with JS off (`.js` class gates the dim/fade effect).
- Per page: title ≤ 60, description 70–155, both measured on visible text with `weightedLength` (CJK and full-width punctuation count 2); exactly one `h1`; absolute canonical with trailing slash; `<html lang>` matching the path (`en` / `zh-Hans`); hreflang `en`, `zh-Hans`, `x-default` (→ English), identical on both twins; `og:*` + `og:locale` + `og:locale:alternate` + `twitter:card`; `og:image` = `/og.png` (English) or `/og-zh.png` (Chinese); ≥ 2 JSON-LD blocks with `inLanguage` (home: `WebSite` + `CollectionPage`/`ItemList`; exhibit: `Article` + `BreadcrumbList`); a link to the GitHub repo; a link to the other language; no render-blocking `<script src>`.
- `sitemap.xml` lists exactly the generated HTML pages in both languages, each with the same three `xhtml:link` alternates as the page; `robots.txt` declares it.
- URLs are permanent: `/exhibits/<id>/`, `/zh/exhibits/<id>/` and the `#<id>` anchor on both home pages. Renaming an `id` breaks all of them; if unavoidable, add a redirect first.
- Exhibit page titles come from `subject` plus the exhibit title, falling back to "`subject`, hop by hop" / "`subject`：原因与经过" when too long; write `subject` the way people search for it, in each language.
- `www` also serves the site; canonical is always the apex.

## Content rules for exhibits

- Facts come only from public postmortems, official incident reports or investigation reports; `source` names it.
- No speculation, no blame on named individuals, no insider information.
- Each exhibit: unique url-safe `id`, `subject`, `added` (ISO date it went live here), a known `room`, ISO `date`, ≥ 3 `hops` ending at the failure, a one-line `lesson`, a `source`, and a complete `zh` block with the same number of hops. Tests enforce the shape.
- Once an exhibit `id` is live, it's a public URL. Don't rename it.

## Performance and cost constraints

- The Worker's `workers.dev` URL stays behind Cloudflare Access (all traffic; account members + a service token for CI). The smoke test fails if it answers 200 without the token. Never write that URL into the repo; it lives in `SMOKE_URL`.
- Stay assets-only: no Worker `main` script, no fetch handler, no bindings (KV / D1 / R2 / Cron) without the maintainer's approval. Assets-only requests don't count against Workers request quotas.
- No third-party scripts, trackers, analytics beacons, web fonts (a CJK web font is megabytes) or CDNs. No deploy-time build step: generated pages are committed (see above).
- Page weight budget, gzipped, enforced by `test/site.test.js`: home page HTML + CSS + all JS ≤ 50 KB; exhibit page HTML + CSS ≤ 15 KB. Raise `BUDGET` in `scripts/site.js` only with a reason in the PR.
- All user-visible strings rendered into HTML go through `esc()`. Dictionary values ending in `Html` are trusted markup and must not contain data.

## Keep these in sync

| What | Where it lives |
|---|---|
| Site origin, repo URL | `SITE` in `scripts/site.js` ↔ `README.md` ↔ JSON-LD output |
| UI strings | `public/i18n.js` `STRINGS.en` ↔ `STRINGS.zh` (same keys, same placeholders) |
| Room names | `ROOMS` ↔ `ROOMS_ZH` in `public/exhibits.js` (same keys) |
| Exhibit facts | English fields ↔ the exhibit's `zh` block (same hops, same facts) |
| Language codes, share images | `LOCALES` in `public/i18n.js` ↔ `scripts/og*.svg` ↔ `public/og*.png` |
| Touch-sized controls | `TOUCH_SELECTOR` in `scripts/viewport.js` ↔ the `(hover: none)` block in `public/style.css` |
| Breakpoints | `public/style.css` ↔ `test/viewport.test.js` ↔ this file |
| Page weight budget | `BUDGET` in `scripts/site.js` ↔ this file |
| 404 page | `public/404.html` English card ↔ Chinese card |
| Commands | `package.json` scripts ↔ `README.md` ↔ this file |

## Style

- English copy on the site: short, plain, American spelling. No exclamation marks, no marketing adjectives.
- Chinese copy on the site: Simplified Chinese, the same plain register as the English (a museum plaque, not a blog). Full-width punctuation next to Chinese; a space between Chinese and Latin letters or digits (`约 6 小时`, `DNS 服务器`); corner brackets 「」 for quotes; no exclamation marks, no internet slang, no filler words (此外、综上所述、值得一提). Product and protocol names stay in English (BGP, DNS, WAF, CrowdStrike). `test/i18n.test.js` checks punctuation, spacing, quotes and exclamation marks.
- Code comments in English. Keep functions small and pure where possible.

## Wrapping up a task

Report: what changed, the commands you ran and their results, anything not verified (mark it ⚠), and the three-lens review if page output changed.

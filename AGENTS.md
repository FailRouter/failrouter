# AGENTS.md

Instructions for AI coding agents (and humans) working in this repository.

## What this is

Failrouter, the Museum of Failed Routes: a static site of famous outages, each told hop by hop. Production is `https://failrouter.com` and `https://www.failrouter.com` (both serve the site; every page declares the apex as canonical).

Stack: a Cloudflare Worker with static assets only (`wrangler.jsonc` → `assets.directory = ./public`), plain HTML/CSS/ES modules, `node:test` with built-in coverage, pnpm, GitHub Actions.

## Public repository: no sensitive data (hard rule)

This repo is public under the MIT license. Never commit:

- API tokens, secrets, `.env` / `.dev.vars` contents (both are gitignored);
- Cloudflare account IDs, zone IDs, database / namespace IDs, workers.dev subdomains;
- personal or company email addresses, local paths (`/Users/...`), internal ticket keys, colleague names;
- screenshots or sample data taken from a real account.

Credentials live only in GitHub Actions secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, environment `production`). If you find anything above in a diff or in history, stop and tell the maintainer before doing anything else.

Commits use the GitHub noreply identity configured in the local git config. Never commit with a work or personal email.

## Git and release flow (hard rule)

Merging to `main` deploys to production (`.github/workflows/ci.yml`, job `deploy`).

1. Before changing code, ask whether to create a branch and what to name it. Don't work on `main` directly.
2. On the branch: implement → `pnpm check` green → commit.
3. **Pushing, opening a PR and merging each need explicit approval from the maintainer.** Never run `gh pr create` or merge on your own. Remind them that merge = production deploy.
4. Docs-only changes (`README.md`, `AGENTS.md`) may be committed on `main`; pushing still needs approval.
5. This repo is pinned to its GitHub account via local git config (`gh.configDir`, credential helper). Use plain `gh`; before the first write, `gh api user -q .login` must print the maintainer's account.

## Tests and coverage gate (hard rule)

- **Core code = every `public/*.js` except `public/app.js`. Lines, branches and functions must each stay ≥ 90%.** `pnpm coverage` enforces it locally and in CI.
- `public/app.js` is DOM glue and the only excluded file. Keep it that way: any decision (filtering, formatting, navigation, escaping) goes into `public/museum.js` as a pure function with tests. Don't move logic into `app.js` to dodge the gate.
- Never widen `--test-coverage-exclude`, lower a threshold, or delete tests to get green. If an exclusion is truly needed, explain why in the PR.
- Tests make no network calls.

```sh
pnpm install
pnpm coverage   # unit tests + coverage gate
pnpm check      # coverage + wrangler deploy --dry-run (run before every commit)
```

## Content rules for exhibits

- Facts come only from public postmortems, official incident reports or investigation reports; `source` names it.
- No speculation, no blame on named individuals, no insider information.
- Each exhibit: unique url-safe `id`, a known `room`, ISO `date`, ≥ 3 `hops` ending at the failure, a one-line `lesson`. Tests enforce the shape.
- Once an exhibit `id` is live, it's a public URL fragment (`/#<id>`). Don't rename it.

## Performance and cost constraints

- Stay assets-only: no Worker `main` script, no fetch handler, no bindings (KV / D1 / R2 / Cron) without the maintainer's approval. Assets-only requests don't count against Workers request quotas.
- No third-party scripts, trackers, web fonts or CDNs. No build step unless agreed.
- All user-visible strings rendered into HTML go through `esc()`.

## Style

- English copy on the site: short, plain, American spelling. No exclamation marks, no marketing adjectives.
- Code comments in English. Keep functions small and pure where possible.

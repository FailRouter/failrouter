# Failrouter: Museum of Failed Routes

A small museum of famous outages, each told as the route it took: one small change, a few hops, then a very bad day. Live at [failrouter.com](https://failrouter.com), and in Simplified Chinese at [failrouter.com/zh/](https://failrouter.com/zh/).

Every exhibit is condensed from a public postmortem or investigation report, and each card names its source. Each one also has its own page, for example [the CrowdStrike outage](https://failrouter.com/exhibits/crowdstrike-2024/).

## How the site works

It's a static site served by a Cloudflare Worker with only static assets, so no Worker code runs per request. There's no framework and no runtime dependencies. A small Node script renders every page to plain HTML ahead of time, and the output is committed, so the site reads fine with JavaScript off and deploys without a build step.

| File | What it holds |
|---|---|
| `public/exhibits.js` | The collection: rooms and exhibits, each with its Chinese text in `zh` |
| `public/i18n.js` | Interface strings in English and Chinese, plus locale helpers |
| `public/museum.js` | Card markup, room filters and keyboard walk, as pure functions |
| `public/app.js` | DOM wiring only |
| `scripts/site.js` | Page, sitemap and structured-data generator for both languages, pure |
| `scripts/build.js` | Writes the generated files into `public/` |
| `scripts/viewport.js` | Rules for the phone-width check; `viewport-run.js` runs it in headless Chrome |
| `test/` | `node:test` suites, no extra test dependencies |

## Run it locally

You need Node 22 or newer and pnpm.

```sh
pnpm install
pnpm dev        # http://localhost:8787
pnpm build      # regenerate pages after editing exhibits
pnpm coverage   # tests + coverage gate (90% lines, branches, functions)
pnpm viewport   # every page at 320 / 375 / 430 px wide in headless Chrome
```

`pnpm viewport` needs Google Chrome installed (or `CHROME_PATH` pointing at a Chrome or Chromium binary). It fails if a page scrolls sideways or a button is shorter than 44 px, and `pnpm viewport --shots <dir>` also saves screenshots so you can look for yourself.

## Add an exhibit

Append an object to `EXHIBITS` in `public/exhibits.js`, run `pnpm build`, and commit both. The tests check the shape: a url-safe unique `id`, a `subject` written the way people search for the event, the `added` date, a known `room`, an ISO `date`, at least three `hops` where the last hop is the failure, a one-line `lesson` and a `source`. They also fail if you forget the build.

Every exhibit also needs a `zh` block with the Chinese `subject`, `title`, `duration`, `hops` and `lesson`: same facts, same number of hops. The tests fail without it. If you don't write Chinese, open the PR anyway and say so in the description; the maintainer can add it before merging.

Keep to what the public report says. Describe systems and decisions, not individual people. Not sure an incident fits? [Open an issue](https://github.com/FailRouter/failrouter/issues/new) first.

## Deploy

Merging to `main` runs the workflow in `.github/workflows/ci.yml`: tests and the coverage gate plus the phone-width check, then `wrangler deploy`. Pull requests run the same checks with a deploy dry run. Cloudflare credentials live in repository secrets only.

## License

[MIT](LICENSE)

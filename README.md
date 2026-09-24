# Failrouter: Museum of Failed Routes

A small museum of famous outages, each told as the route it took: one small change, a few hops, then a very bad day. Live at [failrouter.com](https://failrouter.com).

Every exhibit is condensed from a public postmortem or investigation report, and each card names its source.

## How the site works

It's a static site served by a Cloudflare Worker with only static assets, so no Worker code runs per request. There's no build step, no framework and no runtime dependencies. Everything the browser loads sits in `public/` as hand-written files.

| File | What it holds |
|---|---|
| `public/exhibits.js` | The collection: rooms and exhibits |
| `public/museum.js` | Rendering, room filters and keyboard walk, as pure functions |
| `public/app.js` | DOM wiring only |
| `test/` | `node:test` suites, no extra test dependencies |

## Run it locally

You need Node 22 or newer and pnpm.

```sh
pnpm install
pnpm dev        # http://localhost:8787
pnpm coverage   # tests + coverage gate (90% lines, branches, functions)
```

## Add an exhibit

Append an object to `EXHIBITS` in `public/exhibits.js`. The tests check the shape: a url-safe unique `id`, a known `room`, an ISO `date`, at least three `hops` where the last hop is the failure, a one-line `lesson` and a `source`.

Keep to what the public report says. Describe systems and decisions, not individual people.

## Deploy

Merging to `main` runs the workflow in `.github/workflows/ci.yml`: tests and the coverage gate, then `wrangler deploy`. Pull requests run the same checks with a deploy dry run. Cloudflare credentials live in repository secrets only.

## License

[MIT](LICENSE)

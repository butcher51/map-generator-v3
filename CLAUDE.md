# map-generator-v3

A seeded map generator as a zero-build static site, plus a dashboard that shows the
issue → agent → PR → deploy pipeline.

## Rules

**Stack.** Vanilla JavaScript, native ES modules, no framework, no bundler, no build step.
`src/` and `dashboard/` must have **zero runtime dependencies** — everything in `package.json`
is a dev tool. If a task seems to need a library, say so in the PR instead of adding one.

**Structure.** Keep logic pure and separate from the DOM:

- `src/generator.js`, `src/viewport.js` and `dashboard/lib.js` are pure — no DOM, no `fetch`,
  no module state. These are the modules under a coverage floor, so new logic belongs here.
- `src/render.js`, `src/main.js` and `dashboard/dashboard.js` do canvas, DOM and I/O.
  These are covered by the Playwright smoke test rather than unit tests.

**Determinism.** The same seed must always produce the same map. Never call `Math.random()`
inside generation — take an rng from `makeRng(seed)`.

**Safety.** Never build DOM from GitHub API data with `innerHTML`; issue titles are
user-supplied. Use `textContent` and `createElement`, as `dashboard.js` already does.

**Tests.** Any change to a pure module needs unit tests. Any change to the page needs the
smoke test to still pass. Do not lower the coverage thresholds in `vitest.config.js` to make
a build go green.

## Before opening a PR

```bash
npm run verify   # vitest + coverage, eslint, prettier --check, html-validate
npm run test:smoke
```

`npm run format` fixes formatting. CI runs exactly these commands, so a green `verify` locally
means a green PR.

## Pull requests

- One issue per PR. Keep the diff scoped to what the issue asks for; note anything else you
  spotted in the PR body rather than fixing it here.
- The body **must** contain `Closes #<issue-number>` — the dashboard uses it to link the PR
  back to its issue, and without it the card shows up unattached.
- Say what you changed and how you verified it. If you made an assumption because the issue
  was ambiguous, state the assumption explicitly at the top of the PR body.
- If the issue is too ambiguous to act on, ask on the issue and stop rather than guessing.

## Layout

```
index.html            app shell
src/generator.js      pure seeded generation (unit tested)
src/viewport.js       pure zoom/pan maths (unit tested)
src/render.js         canvas drawing
src/main.js           DOM wiring
dashboard/lib.js      pure pipeline logic (unit tested)
dashboard/dashboard.js  GitHub API fetch + render
tests/*.test.js       vitest
tests/smoke.spec.js   playwright
```

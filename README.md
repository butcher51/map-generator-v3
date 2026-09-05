# map-generator-v3

A seeded map generator built as a zero-build static site, wired to an AI development
workflow: describe work as a GitHub issue, an agent picks it up, CI gates the result,
you review the PR, merge, and it deploys.

- **App** — `/` · same seed, same map
- **Dashboard** — `/dashboard/` · live pipeline board, works on a phone

## The loop

```
Issue labelled `agent:ready`
   ↓  claude-orchestrator polls GitHub (running on your machine)
Claude Code agent in its own git worktree   ← you watch, steer and answer it
   ↓  dashboard link commented on the issue; label flips to `agent:running`
claude/* branch → pull request ("Closes #N")
   ↓
CI: unit tests + coverage · eslint · prettier · html-validate · browser smoke
   ↓
you review → merge to main → deploy to GitHub Pages
```

Agents are driven by [claude-orchestrator](https://github.com/butcher51/claude-orchestrator),
which runs locally under your own Claude Code login. That is what lets you talk to an agent
mid-run — it holds an open session and waits, rather than ending a job to ask a question.

This repository holds no agent credentials and no dispatch workflow: the orchestrator pulls
from GitHub rather than GitHub pushing to it. The Pages dashboard at `/dashboard/` reads
GitHub as the single source of truth, so it stays accurate whether a change came from an agent
or from you — and it keeps working when your machine is off.

## Develop

```bash
npm install
npm run dev          # http://localhost:4173
npm run verify       # unit tests + coverage, lint, format check, HTML validation
npm run test:smoke   # Playwright browser tests
npm run format       # fix formatting
```

CI runs exactly what `verify` and `test:smoke` run, so green locally means green on the PR.

> `npm install` needs npm 11 or newer to resolve the dependency tree (npm 10.9's peer
> resolver crashes on it). `npm ci` against the committed lockfile works on any version.
> If `npm install` fails with `Cannot read properties of null (reading 'edgesOut')`, run
> `npx npm@11 install`.

## One-time setup

1. **Authenticate the CLI** — `gh auth login`. The orchestrator borrows this token.

2. **Enable Pages** — Settings → Pages → Source: **GitHub Actions**. Do this before the first
   push to `main`, or the deploy job fails with `Get Pages site failed`.

3. **Create the labels:**

   ```bash
   gh label create agent:ready   --color 0e8a16 --description "Hand this to an agent"
   gh label create agent:running --color fbca04 --description "An agent is working on it"
   gh label create agent:blocked --color d93f0b --description "Needs a human"
   ```

4. **Set up the orchestrator** — clone
   [claude-orchestrator](https://github.com/butcher51/claude-orchestrator), point its
   `config.json` at this repository's local checkout, and `npm start`. Its README covers the
   rest, including reaching the dashboard from your phone.

5. **Protect `main`** — Settings → Branches: require a pull request, and require the
   `Unit tests`, `Lint`, `HTML validation` and `Browser smoke test` checks.

## Using it

Open an issue, then add the `agent:ready` label. With the orchestrator running, it picks the
issue up within a poll interval, comments its dashboard link on the issue, and starts work in a
dedicated worktree. Open that link to watch the agent, approve what it asks for, or answer a
question. Its PR then appears in this repository's own dashboard, moving to **Needs review**
once CI passes.

To re-run an agent on an issue, swap `agent:running` back to `agent:ready`.

If the orchestrator is not running, nothing happens — the label just sits there until it is.

## Notes

- Agents run on your machine, so the loop only advances while the orchestrator is running.
  Everything else here — CI, deploy, the dashboard — is independent of it.
- Agent commits are authored by your GitHub user; the `claude/*` branch prefix and the
  `Closes #N` convention are the markers that distinguish them.
- The dashboard polls the GitHub API with conditional requests (`If-None-Match`), and GitHub
  does not count `304` responses against the rate limit, so unauthenticated polling is
  effectively free. If you do hit the 60/hour ceiling, click **API token** on the dashboard
  and paste a read-only fine-grained token; it is kept in `localStorage` on that device only.
- The dashboard is `noindex` but is served from the public Pages site. It exposes nothing
  that is not already public on the repository.

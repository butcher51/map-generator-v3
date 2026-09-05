/**
 * Pure pipeline logic for the dashboard.
 *
 * Everything here takes plain GitHub API objects and returns plain data, with
 * no fetching and no DOM, so the interesting behaviour is unit-testable.
 * dashboard.js does only I/O and rendering on top of this.
 */

/** Board columns, left to right. */
export const COLUMNS = ['backlog', 'agent', 'ci', 'review', 'live'];

export const COLUMN_LABELS = {
  backlog: 'Backlog',
  agent: 'Agent working',
  ci: 'CI',
  review: 'Needs review',
  live: 'Live',
};

export const LABEL_READY = 'agent:ready';
export const LABEL_RUNNING = 'agent:running';
export const LABEL_BLOCKED = 'agent:blocked';

const CLOSES_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)/i;
const SESSION_RE = /https:\/\/claude\.ai\/code\/(?:session|cse)_[A-Za-z0-9]+/g;

/**
 * The /issues endpoint returns pull requests too. They carry a pull_request
 * key; plain issues do not.
 */
export function isPullRequest(item) {
  return Boolean(item && item.pull_request);
}

/** Label names of an issue or PR, as a plain string array. */
export function labelNames(item) {
  const labels = item?.labels ?? [];
  return labels.map((label) => (typeof label === 'string' ? label : label.name)).filter(Boolean);
}

/**
 * Issue number a PR closes, parsed from its body or title, or null.
 * Matches "Closes #12", "fixes #12", "Resolved #12".
 */
export function linkedIssueNumber(pr) {
  const match = CLOSES_RE.exec(`${pr?.title ?? ''}\n${pr?.body ?? ''}`);
  return match ? Number(match[1]) : null;
}

/**
 * The claude.ai session URL an agent run announced on the issue. Comments are
 * scanned newest-last, so a re-run's link wins over an earlier one.
 */
export function extractSessionUrl(comments = []) {
  let found = null;
  for (const comment of comments) {
    const matches = String(comment?.body ?? '').match(SESSION_RE);
    if (matches) found = matches[matches.length - 1];
  }
  return found;
}

/** Reduce a workflow run to a coarse state. */
export function runState(run) {
  if (!run) return 'unknown';
  if (run.status !== 'completed') return 'pending';
  return run.conclusion === 'success' ? 'success' : 'failure';
}

/**
 * Most recent run of `workflow` for a given commit. Passing a workflow name
 * keeps unrelated workflows (agent dispatch, for one) out of the answer.
 */
export function latestRunFor(runs = [], sha, { workflow = null } = {}) {
  if (!sha) return null;
  const candidates = runs.filter(
    (run) => run.head_sha === sha && (!workflow || run.name === workflow),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((newest, run) =>
    new Date(run.created_at ?? 0) >= new Date(newest.created_at ?? 0) ? run : newest,
  );
}

/**
 * Assemble the board.
 *
 * An open issue with an open PR against it is represented by the PR card only,
 * so a single unit of work never appears in two columns at once.
 *
 * @returns {Record<string, Array<object>>} keyed by column name
 */
export function buildBoard({
  issues = [],
  openPulls = [],
  mergedPulls = [],
  runs = [],
  sessionUrls = {},
  workflow = 'CI',
} = {}) {
  const board = Object.fromEntries(COLUMNS.map((column) => [column, []]));
  const claimedIssues = new Set();

  for (const pr of openPulls) {
    const issueNumber = linkedIssueNumber(pr);
    if (issueNumber) claimedIssues.add(issueNumber);

    const run = latestRunFor(runs, pr.head?.sha, { workflow });
    const state = runState(run);
    const column = state === 'success' ? 'review' : 'ci';

    board[column].push({
      id: `pr-${pr.number}`,
      kind: 'pr',
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      updatedAt: pr.updated_at,
      draft: Boolean(pr.draft),
      issueNumber,
      sessionUrl: issueNumber ? (sessionUrls[issueNumber] ?? null) : null,
      checks: { state, url: run?.html_url ?? null },
    });
  }

  for (const issue of issues) {
    if (isPullRequest(issue) || claimedIssues.has(issue.number)) continue;
    const labels = labelNames(issue);
    const running = labels.includes(LABEL_RUNNING);

    board[running ? 'agent' : 'backlog'].push({
      id: `issue-${issue.number}`,
      kind: 'issue',
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      updatedAt: issue.updated_at,
      labels,
      blocked: labels.includes(LABEL_BLOCKED),
      queued: labels.includes(LABEL_READY),
      sessionUrl: sessionUrls[issue.number] ?? null,
      checks: null,
    });
  }

  for (const pr of mergedPulls) {
    const run = latestRunFor(runs, pr.merge_commit_sha, { workflow });
    board.live.push({
      id: `merged-${pr.number}`,
      kind: 'merged',
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      updatedAt: pr.merged_at ?? pr.updated_at,
      issueNumber: linkedIssueNumber(pr),
      sessionUrl: null,
      checks: { state: runState(run), url: run?.html_url ?? null },
    });
  }

  for (const column of COLUMNS) {
    board[column].sort((a, b) => new Date(b.updatedAt ?? 0) - new Date(a.updatedAt ?? 0));
  }
  return board;
}

/** Human-readable "3m ago" style age. */
export function relativeTime(value, now = Date.now()) {
  const then = new Date(value ?? 0).getTime();
  if (!Number.isFinite(then) || then === 0) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

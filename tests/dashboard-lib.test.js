import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  buildBoard,
  extractSessionUrl,
  isPullRequest,
  labelNames,
  latestRunFor,
  linkedIssueNumber,
  relativeTime,
  runState,
} from '../dashboard/lib.js';

const issue = (number, overrides = {}) => ({
  number,
  title: `Issue ${number}`,
  html_url: `https://github.com/o/r/issues/${number}`,
  updated_at: '2026-09-01T10:00:00Z',
  labels: [],
  ...overrides,
});

const pull = (number, overrides = {}) => ({
  number,
  title: `PR ${number}`,
  html_url: `https://github.com/o/r/pull/${number}`,
  updated_at: '2026-09-01T11:00:00Z',
  head: { sha: `sha${number}` },
  ...overrides,
});

const run = (sha, overrides = {}) => ({
  head_sha: sha,
  name: 'CI',
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-09-01T11:30:00Z',
  html_url: `https://github.com/o/r/actions/runs/${sha}`,
  ...overrides,
});

describe('isPullRequest', () => {
  it('separates pull requests from plain issues', () => {
    expect(isPullRequest({ pull_request: { url: 'x' } })).toBe(true);
    expect(isPullRequest({})).toBe(false);
    expect(isPullRequest(null)).toBe(false);
  });
});

describe('labelNames', () => {
  it('accepts object labels and string labels', () => {
    expect(labelNames({ labels: [{ name: 'bug' }, 'agent:ready'] })).toEqual([
      'bug',
      'agent:ready',
    ]);
  });

  it('is safe on missing labels', () => {
    expect(labelNames({})).toEqual([]);
    expect(labelNames(null)).toEqual([]);
  });
});

describe('linkedIssueNumber', () => {
  it.each([
    ['Closes #12', 12],
    ['fixes #7', 7],
    ['Resolved #99', 99],
    ['Fix #3', 3],
    ['closes: #5', 5],
  ])('parses %s', (body, expected) => {
    expect(linkedIssueNumber({ body })).toBe(expected);
  });

  it('reads the title too', () => {
    expect(linkedIssueNumber({ title: 'Legend, closes #4', body: '' })).toBe(4);
  });

  it('returns null when nothing is linked', () => {
    expect(linkedIssueNumber({ body: 'related to #12' })).toBeNull();
    expect(linkedIssueNumber({})).toBeNull();
    expect(linkedIssueNumber(null)).toBeNull();
  });
});

describe('extractSessionUrl', () => {
  it('finds a session link in a comment', () => {
    const url = 'https://claude.ai/code/session_01ABCdef';
    expect(extractSessionUrl([{ body: `Agent started: ${url}` }])).toBe(url);
  });

  it('accepts the cse_ session prefix', () => {
    const url = 'https://claude.ai/code/cse_01XYZ';
    expect(extractSessionUrl([{ body: url }])).toBe(url);
  });

  it('prefers the most recent link', () => {
    const first = 'https://claude.ai/code/session_first0';
    const second = 'https://claude.ai/code/session_second0';
    expect(extractSessionUrl([{ body: first }, { body: second }])).toBe(second);
  });

  it('returns null when there is none', () => {
    expect(extractSessionUrl([{ body: 'no link here' }])).toBeNull();
    expect(extractSessionUrl([])).toBeNull();
    expect(extractSessionUrl()).toBeNull();
  });
});

describe('runState', () => {
  it('maps status and conclusion onto a coarse state', () => {
    expect(runState(null)).toBe('unknown');
    expect(runState({ status: 'in_progress' })).toBe('pending');
    expect(runState({ status: 'queued' })).toBe('pending');
    expect(runState({ status: 'completed', conclusion: 'success' })).toBe('success');
    expect(runState({ status: 'completed', conclusion: 'failure' })).toBe('failure');
    expect(runState({ status: 'completed', conclusion: 'cancelled' })).toBe('failure');
  });
});

describe('latestRunFor', () => {
  it('returns null without a sha or a match', () => {
    expect(latestRunFor([run('a')], undefined)).toBeNull();
    expect(latestRunFor([run('a')], 'b')).toBeNull();
    expect(latestRunFor(undefined, 'a')).toBeNull();
  });

  it('ignores runs from other workflows', () => {
    const runs = [run('a', { name: 'Agent dispatch' })];
    expect(latestRunFor(runs, 'a', { workflow: 'CI' })).toBeNull();
    expect(latestRunFor(runs, 'a', { workflow: null })).not.toBeNull();
  });

  it('picks the newest run for the commit', () => {
    const older = run('a', { created_at: '2026-09-01T10:00:00Z', conclusion: 'failure' });
    const newer = run('a', { created_at: '2026-09-01T12:00:00Z' });
    expect(latestRunFor([older, newer], 'a').conclusion).toBe('success');
    expect(latestRunFor([newer, older], 'a').conclusion).toBe('success');
  });
});

describe('buildBoard', () => {
  it('always returns every column', () => {
    const board = buildBoard();
    expect(Object.keys(board)).toEqual(COLUMNS);
    expect(Object.values(board).every((cards) => cards.length === 0)).toBe(true);
  });

  it('splits issues between backlog and agent by label', () => {
    const board = buildBoard({
      issues: [issue(1), issue(2, { labels: [{ name: 'agent:running' }] })],
    });
    expect(board.backlog.map((c) => c.number)).toEqual([1]);
    expect(board.agent.map((c) => c.number)).toEqual([2]);
  });

  it('skips pull requests returned by the issues endpoint', () => {
    const board = buildBoard({ issues: [issue(1, { pull_request: { url: 'x' } })] });
    expect(board.backlog).toHaveLength(0);
  });

  it('attaches the live session link to a running agent', () => {
    const board = buildBoard({
      issues: [issue(2, { labels: [{ name: 'agent:running' }] })],
      sessionUrls: { 2: 'https://claude.ai/code/session_abc' },
    });
    expect(board.agent[0].sessionUrl).toBe('https://claude.ai/code/session_abc');
  });

  it('flags queued and blocked issues', () => {
    const board = buildBoard({
      issues: [issue(1, { labels: [{ name: 'agent:ready' }, { name: 'agent:blocked' }] })],
    });
    expect(board.backlog[0]).toMatchObject({ queued: true, blocked: true });
  });

  it('sends a PR to review only once its checks pass', () => {
    const green = pull(10, { body: 'Closes #1' });
    const red = pull(11, { body: 'Closes #2' });
    const board = buildBoard({
      openPulls: [green, red],
      runs: [run('sha10'), run('sha11', { conclusion: 'failure' })],
    });
    expect(board.review.map((c) => c.number)).toEqual([10]);
    expect(board.ci.map((c) => c.number)).toEqual([11]);
    expect(board.ci[0].checks.state).toBe('failure');
  });

  it('parks a PR in CI while checks are still unknown', () => {
    const board = buildBoard({ openPulls: [pull(12)], runs: [] });
    expect(board.ci[0].checks.state).toBe('unknown');
  });

  it('shows an issue only once, as its PR, when one is open', () => {
    const board = buildBoard({
      issues: [issue(1, { labels: [{ name: 'agent:running' }] })],
      openPulls: [pull(10, { body: 'Closes #1' })],
      runs: [run('sha10')],
    });
    expect(board.agent).toHaveLength(0);
    expect(board.backlog).toHaveLength(0);
    expect(board.review[0].issueNumber).toBe(1);
  });

  it('carries the session link onto the PR that replaced the issue', () => {
    const board = buildBoard({
      issues: [issue(1)],
      openPulls: [pull(10, { body: 'Closes #1' })],
      sessionUrls: { 1: 'https://claude.ai/code/session_abc' },
    });
    expect(board.ci[0].sessionUrl).toBe('https://claude.ai/code/session_abc');
  });

  it('puts merged pull requests in live with their deploy result', () => {
    const board = buildBoard({
      mergedPulls: [
        pull(9, { body: 'Closes #3', merged_at: '2026-09-02T09:00:00Z', merge_commit_sha: 'm9' }),
      ],
      runs: [run('m9')],
    });
    expect(board.live[0]).toMatchObject({ number: 9, issueNumber: 3 });
    expect(board.live[0].checks.state).toBe('success');
  });

  it('orders each column newest first', () => {
    const board = buildBoard({
      issues: [
        issue(1, { updated_at: '2026-09-01T09:00:00Z' }),
        issue(2, { updated_at: '2026-09-03T09:00:00Z' }),
        issue(3, { updated_at: '2026-09-02T09:00:00Z' }),
      ],
    });
    expect(board.backlog.map((c) => c.number)).toEqual([2, 3, 1]);
  });

  it('marks draft pull requests', () => {
    const board = buildBoard({ openPulls: [pull(10, { draft: true })] });
    expect(board.ci[0].draft).toBe(true);
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-09-05T12:00:00Z');

  it.each([
    ['2026-09-05T11:59:30Z', '30s ago'],
    ['2026-09-05T11:45:00Z', '15m ago'],
    ['2026-09-05T09:00:00Z', '3h ago'],
    ['2026-09-02T12:00:00Z', '3d ago'],
  ])('renders %s as %s', (value, expected) => {
    expect(relativeTime(value, now)).toBe(expected);
  });

  it('is blank for missing or unparseable timestamps', () => {
    expect(relativeTime(undefined, now)).toBe('');
    expect(relativeTime('not a date', now)).toBe('');
  });

  it('never reports a negative age', () => {
    expect(relativeTime('2026-09-05T12:30:00Z', now)).toBe('0s ago');
  });
});

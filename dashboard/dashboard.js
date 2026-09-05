/**
 * Pipeline dashboard: fetch GitHub state, hand it to lib.js, render the board.
 *
 * Requests are conditional (If-None-Match). GitHub does not count a 304
 * against the rate limit, so steady-state polling on an unauthenticated
 * connection stays effectively free. A read-only token can be supplied to
 * raise the 60/hour unauthenticated ceiling; it lives in localStorage on this
 * device only and is never committed or sent anywhere but api.github.com.
 */

import {
  COLUMNS,
  COLUMN_LABELS,
  LABEL_RUNNING,
  buildBoard,
  extractSessionUrl,
  labelNames,
  relativeTime,
} from './lib.js';

const DEFAULT_REPO = 'butcher51/map-generator-v3';
const WORKFLOW_NAME = 'CI';
const POLL_MS = 30_000;
const TOKEN_KEY = 'mgv3.gh_token';

const params = new URLSearchParams(window.location.search);
const REPO = params.get('repo') || DEFAULT_REPO;
const API = `https://api.github.com/repos/${REPO}`;

const cache = new Map();
let remaining = null;
const els = {
  board: document.querySelector('#board'),
  status: document.querySelector('#status'),
  repo: document.querySelector('#repo'),
  token: document.querySelector('#token'),
};

els.repo.textContent = REPO;
els.repo.href = `https://github.com/${REPO}`;

function storedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

/** Conditional GET that returns cached data unchanged on a 304. */
async function ghFetch(path) {
  const url = `${API}${path}`;
  const entry = cache.get(url);
  const headers = { Accept: 'application/vnd.github+json' };
  if (entry?.etag) headers['If-None-Match'] = entry.etag;
  const token = storedToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers, cache: 'no-store' });

  if (response.status === 304 && entry) return entry.data;
  if (response.status === 403 || response.status === 429) {
    throw new Error('GitHub rate limit reached — add a read-only token to poll more often.');
  }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} on ${path}`);

  const data = await response.json();
  cache.set(url, { etag: response.headers.get('etag'), data });
  remaining = response.headers.get('x-ratelimit-remaining') ?? remaining;
  return data;
}

async function loadBoard() {
  const [issues, openPulls, closedPulls, runsPayload] = await Promise.all([
    ghFetch('/issues?state=open&per_page=50'),
    ghFetch('/pulls?state=open&per_page=30'),
    ghFetch('/pulls?state=closed&sort=updated&direction=desc&per_page=15'),
    ghFetch('/actions/runs?per_page=40'),
  ]);

  const mergedPulls = closedPulls.filter((pr) => pr.merged_at).slice(0, 6);
  const runs = runsPayload.workflow_runs ?? [];

  // Only running agents need their session link resolved, so this stays a
  // handful of extra conditional requests at most.
  const running = issues.filter((issue) => labelNames(issue).includes(LABEL_RUNNING));
  const sessionUrls = {};
  await Promise.all(
    running.map(async (issue) => {
      try {
        const comments = await ghFetch(`/issues/${issue.number}/comments?per_page=30`);
        const url = extractSessionUrl(comments);
        if (url) sessionUrls[issue.number] = url;
      } catch {
        /* a missing session link is not worth failing the board over */
      }
    }),
  );

  return buildBoard({ issues, openPulls, mergedPulls, runs, sessionUrls, workflow: WORKFLOW_NAME });
}

function checkBadge(checks) {
  const badge = document.createElement('span');
  badge.className = `badge badge-${checks.state}`;
  badge.textContent = {
    success: 'checks passed',
    failure: 'checks failed',
    pending: 'checks running',
    unknown: 'no checks yet',
  }[checks.state];
  return checks.url ? wrapLink(badge, checks.url) : badge;
}

function wrapLink(node, href) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.append(node);
  return link;
}

function renderCard(card) {
  const article = document.createElement('article');
  article.className = `card card-${card.kind}`;

  const title = document.createElement('a');
  title.className = 'card-title';
  title.href = card.url;
  title.target = '_blank';
  title.rel = 'noopener';
  // textContent, never innerHTML: issue titles are user-supplied.
  title.textContent = `#${card.number} ${card.title}`;
  article.append(title);

  const meta = document.createElement('div');
  meta.className = 'card-meta';

  if (card.kind === 'pr' && card.issueNumber) {
    const closes = document.createElement('span');
    closes.textContent = `closes #${card.issueNumber}`;
    meta.append(closes);
  }
  if (card.queued) meta.append(tag('queued'));
  if (card.blocked) meta.append(tag('blocked', 'tag-blocked'));
  if (card.draft) meta.append(tag('draft'));
  if (card.checks) meta.append(checkBadge(card.checks));

  const age = document.createElement('time');
  age.dateTime = card.updatedAt ?? '';
  age.textContent = relativeTime(card.updatedAt);
  meta.append(age);
  article.append(meta);

  if (card.sessionUrl) {
    const session = document.createElement('a');
    session.className = 'session';
    session.href = card.sessionUrl;
    session.target = '_blank';
    session.rel = 'noopener';
    session.textContent = 'Open live agent session';
    article.append(session);
  }

  return article;
}

function tag(text, className = '') {
  const span = document.createElement('span');
  span.className = `tag ${className}`.trim();
  span.textContent = text;
  return span;
}

function renderBoard(board) {
  els.board.replaceChildren();
  for (const column of COLUMNS) {
    const section = document.createElement('section');
    section.className = 'column';

    const heading = document.createElement('h2');
    heading.textContent = COLUMN_LABELS[column];
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(board[column].length);
    heading.append(count);
    section.append(heading);

    if (board[column].length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '—';
      section.append(empty);
    } else {
      for (const card of board[column]) section.append(renderCard(card));
    }
    els.board.append(section);
  }
}

async function refresh() {
  try {
    renderBoard(await loadBoard());
    const quota = remaining ? ` · ${remaining} API calls left this hour` : '';
    els.status.textContent = `Updated ${new Date().toLocaleTimeString()}${quota}`;
    els.status.classList.remove('error');
  } catch (error) {
    els.status.textContent = error.message;
    els.status.classList.add('error');
  }
}

els.token.addEventListener('click', () => {
  const current = storedToken();
  const next = window.prompt(
    'Optional GitHub read-only token (raises the polling rate limit).\nLeave empty to clear.',
    current,
  );
  if (next === null) return;
  try {
    if (next.trim()) localStorage.setItem(TOKEN_KEY, next.trim());
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — carry on unauthenticated */
  }
  cache.clear();
  refresh();
});

refresh();
setInterval(refresh, POLL_MS);

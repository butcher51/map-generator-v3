import { expect, test } from '@playwright/test';

/** Collect console errors and uncaught exceptions for the life of a page. */
function watchForErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('map generator', () => {
  test('renders a map with no console errors', async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto('/index.html');

    const canvas = page.locator('#map');
    await expect(canvas).toHaveAttribute('data-rendered', 'true');

    // The canvas must actually have paint on it, not just exist.
    const painted = await canvas.evaluate((el) => {
      const { data } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return seen.size;
    });
    expect(painted).toBeGreaterThan(1);

    await expect(page.locator('#legend li')).toHaveCount(6);
    expect(errors).toEqual([]);
  });

  test('is deterministic for a seed and changes when the seed changes', async ({ page }) => {
    await page.goto('/index.html?seed=coast');
    const first = await page.locator('#map').evaluate((el) => el.toDataURL());

    await page.reload();
    const again = await page.locator('#map').evaluate((el) => el.toDataURL());
    expect(again).toBe(first);

    await page.fill('#seed', 'desert');
    await page.click('#controls button[type="submit"]');
    await expect(page.locator('#map')).toHaveAttribute('data-seed', 'desert');
    const different = await page.locator('#map').evaluate((el) => el.toDataURL());
    expect(different).not.toBe(first);

    // The seed round-trips through the URL so a map can be shared.
    expect(new URL(page.url()).searchParams.get('seed')).toBe('desert');
  });

  test('the random button reseeds', async ({ page }) => {
    await page.goto('/index.html?seed=coast');
    await page.click('#random');
    await expect(page.locator('#map')).not.toHaveAttribute('data-seed', 'coast');
  });

  test('the canvas fills the viewport and the legend floats over it', async ({ page }) => {
    await page.goto('/index.html?seed=coast');
    const viewport = page.viewportSize();

    const canvasBox = await page.locator('#map').boundingBox();
    expect(canvasBox).toMatchObject({ x: 0, y: 0 });
    expect(canvasBox.width).toBe(viewport.width);
    expect(canvasBox.height).toBe(viewport.height);

    // The legend sits inside the canvas area, near the bottom, not below it.
    const legendBox = await page.locator('#legend').boundingBox();
    expect(legendBox.y).toBeGreaterThan(viewport.height / 2);
    expect(legendBox.y + legendBox.height).toBeLessThanOrEqual(viewport.height);

    // No scrolling: nothing is pushed outside the window.
    const scrollable = await page.evaluate(
      () =>
        document.documentElement.scrollHeight > window.innerHeight ||
        document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(scrollable).toBe(false);
  });

  test('the zoom buttons zoom in and back out to fit', async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto('/index.html?seed=coast');

    const canvas = page.locator('#map');
    // A freshly generated map is fitted, so zooming out is already exhausted.
    await expect(canvas).toHaveAttribute('data-zoom', '100');
    await expect(page.locator('#zoom-out')).toBeDisabled();

    const fitted = await canvas.evaluate((el) => el.toDataURL());

    await page.click('#zoom-in');
    await expect(canvas).not.toHaveAttribute('data-zoom', '100');
    await expect(page.locator('#zoom-level')).toContainText('125%');
    await expect(page.locator('#zoom-out')).toBeEnabled();
    expect(await canvas.evaluate((el) => el.toDataURL())).not.toBe(fitted);

    // Zooming never re-generates: the seed is untouched.
    await expect(canvas).toHaveAttribute('data-seed', 'coast');

    await page.click('#zoom-out');
    await expect(canvas).toHaveAttribute('data-zoom', '100');
    expect(await canvas.evaluate((el) => el.toDataURL())).toBe(fitted);
    expect(errors).toEqual([]);
  });

  test('the mouse wheel zooms', async ({ page }) => {
    await page.goto('/index.html?seed=coast');
    const canvas = page.locator('#map');
    const viewport = page.viewportSize();

    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, -400);
    await expect(canvas).not.toHaveAttribute('data-zoom', '100');

    await page.mouse.wheel(0, 4000);
    await expect(canvas).toHaveAttribute('data-zoom', '100');
  });

  test('right-drag pans a zoomed-in map and stops at the edge', async ({ page }) => {
    await page.goto('/index.html?seed=coast');
    const canvas = page.locator('#map');
    const viewport = page.viewportSize();
    const midX = viewport.width / 2;
    const midY = viewport.height / 2;

    // Zoom in until the map overflows both axes, so a drag has somewhere to go.
    for (let i = 0; i < 4; i += 1) await page.click('#zoom-in');
    const before = await canvas.getAttribute('data-pan');

    await page.mouse.move(midX, midY);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(midX - 120, midY - 90);
    await page.mouse.up({ button: 'right' });

    const after = await canvas.getAttribute('data-pan');
    expect(after).not.toBe(before);

    // Dragging far past the corner clamps instead of exposing empty space.
    await page.mouse.move(midX, midY);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(midX + 5000, midY + 5000);
    await page.mouse.up({ button: 'right' });
    await expect(canvas).toHaveAttribute('data-pan', '0,0');
  });

  test('a fitted map cannot be panned', async ({ page }) => {
    await page.goto('/index.html?seed=coast');
    const canvas = page.locator('#map');
    const viewport = page.viewportSize();
    const fitted = await canvas.evaluate((el) => el.toDataURL());

    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(viewport.width / 2 - 200, viewport.height / 2);
    await page.mouse.up({ button: 'right' });

    expect(await canvas.evaluate((el) => el.toDataURL())).toBe(fitted);
  });
});

test.describe('pipeline dashboard', () => {
  const SESSION_URL = 'https://claude.ai/code/session_01SMOKE';

  const fixtures = {
    issues: [
      {
        number: 1,
        title: 'Backlog item',
        html_url: 'https://github.com/o/r/issues/1',
        updated_at: '2026-09-01T10:00:00Z',
        labels: [],
      },
      {
        number: 2,
        title: 'Agent is on this',
        html_url: 'https://github.com/o/r/issues/2',
        updated_at: '2026-09-01T10:30:00Z',
        labels: [{ name: 'agent:running' }],
      },
    ],
    openPulls: [
      {
        number: 10,
        title: 'Add a legend',
        body: 'Closes #3',
        html_url: 'https://github.com/o/r/pull/10',
        updated_at: '2026-09-01T11:00:00Z',
        head: { sha: 'sha10' },
      },
    ],
    closedPulls: [],
    runs: {
      workflow_runs: [
        {
          head_sha: 'sha10',
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          created_at: '2026-09-01T11:30:00Z',
          html_url: 'https://github.com/o/r/actions/runs/1',
        },
      ],
    },
    comments: [{ body: `Agent session started: ${SESSION_URL}` }],
  };

  async function stubGitHub(page) {
    await page.route('**://api.github.com/**', async (route) => {
      const url = route.request().url();
      const json = (body) => route.fulfill({ status: 200, json: body });

      if (url.includes('/comments')) return json(fixtures.comments);
      if (url.includes('/actions/runs')) return json(fixtures.runs);
      if (url.includes('/pulls?state=closed')) return json(fixtures.closedPulls);
      if (url.includes('/pulls?state=open')) return json(fixtures.openPulls);
      if (url.includes('/issues?state=open')) return json(fixtures.issues);
      return json([]);
    });
  }

  test('renders the board and links to the live agent session', async ({ page }) => {
    const errors = watchForErrors(page);
    await stubGitHub(page);
    await page.goto('/dashboard/index.html');

    await expect(page.locator('.column')).toHaveCount(5);
    await expect(page.locator('.column h2').first()).toContainText('Backlog');

    await expect(page.locator('.card-title', { hasText: 'Backlog item' })).toBeVisible();
    await expect(page.locator('.card-title', { hasText: 'Add a legend' })).toBeVisible();
    await expect(page.locator('.badge-success')).toBeVisible();

    const session = page.locator('a.session');
    await expect(session).toHaveAttribute('href', SESSION_URL);

    expect(errors).toEqual([]);
  });

  test('surfaces an API failure instead of rendering a stale board', async ({ page }) => {
    await page.route('**://api.github.com/**', (route) =>
      route.fulfill({ status: 403, json: { message: 'rate limited' } }),
    );
    await page.goto('/dashboard/index.html');
    await expect(page.locator('#status')).toHaveClass(/error/);
    await expect(page.locator('#status')).toContainText('rate limit');
  });
});

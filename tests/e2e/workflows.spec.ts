import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { calculationField, openPage } from './helpers';

const calculators = [
  'ipv4-subnet',
  'ipv4-split',
  'vlsm',
  'aggregate',
  'range-to-cidr',
  'cidr-to-range',
  'overlap',
  'wildcard',
  'convert',
  'classify',
  'reverse-dns',
  'netmask-table',
  'ipv6-subnet',
  'ipv6-format',
  'eui64',
  'ipv6-plan',
  'ipv4-map',
  'bandwidth',
  'mtu',
  'mac',
];

for (const tool of calculators) {
  test(`loads the ${tool} calculator and its default result`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openPage(page, `/tools/${tool}`);
    await expect(page.getByRole('region', { name: 'Calculation result' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'JSON', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('all public workspaces and reference pages resolve', async ({ page }) => {
  for (const route of [
    '/',
    '/tools',
    '/learn',
    '/glossary',
    '/practice',
    '/cheatsheets',
    '/toolkit',
    '/templates',
    '/assistant',
    '/projects',
    '/account',
    '/auth',
    '/blog',
    '/about',
    '/contact',
    '/privacy',
    '/terms',
    '/cookies',
  ]) {
    await test.step(route, async () => {
      await openPage(page, route);
      await expect(page.locator('main h1').first()).not.toHaveText(
        /not found|something went wrong/i,
      );
    });
  }
});

test('the landing calculator updates its network and capacity from the submitted address', async ({
  page,
}) => {
  await openPage(page, '/');
  await page.getByRole('textbox', { name: 'IP address / prefix' }).fill('10.9.8.7/20');
  await page.getByRole('button', { name: 'Calculate preview' }).click();
  await expect(page.locator('.live-result-grid')).toContainText('10.9.0.0');
  await expect(page.locator('.live-result-grid')).toContainText('4094');
  await page.getByRole('link', { name: 'Full results' }).click();
  await expect(calculationField(page, 'Network')).toHaveText('10.9.0.0/20');
});

test('bad IPv4 input clears stale output and recovers without a reload', async ({ page }) => {
  await openPage(page, '/tools/ipv4-subnet');
  await page.getByRole('textbox', { name: 'IPv4 address / prefix' }).fill('999.1.1.1/24');
  await expect(page.getByRole('heading', { name: 'Check your input' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Calculation result' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'IPv4 address / prefix' }).fill('192.0.2.4/31');
  await page
    .getByRole('combobox', { name: 'Address capacity policy' })
    .selectOption('point-to-point');
  await expect(calculationField(page, 'Usable under policy')).toHaveText('2');
  await expect(calculationField(page, 'Broadcast')).toHaveText('Not applicable');
});

test('VLSM reports overcommit and produces a plan after the requirement is corrected', async ({
  page,
}) => {
  await openPage(page, '/tools/vlsm');
  await page.getByRole('spinbutton', { name: 'Segment 1 hosts', exact: true }).fill('10000');
  await expect(page.getByRole('heading', { name: 'Check your input' })).toBeVisible();
  await expect(page.getByText(/Engineering needs.*larger than the parent/)).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Segment 1 hosts', exact: true }).fill('80');
  await expect(page.getByRole('region', { name: 'Calculation result' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Address-space map' })).toBeVisible();
});

test('copy, share, JSON, CSV, PDF, and print use the current result', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(window, '__printCalls', { value: 0, writable: true });
    window.print = () => {
      const state = window as unknown as { __printCalls: number };
      state.__printCalls += 1;
    };
  });
  await openPage(page, '/tools/ipv4-subnet');
  await page.getByRole('textbox', { name: 'IPv4 address / prefix' }).fill('172.16.32.1/21');
  await expect(calculationField(page, 'Network')).toHaveText('172.16.32.0/21');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('172.16.32.0/21');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  const sharedUrl = new URL(shared);
  expect(sharedUrl.pathname).toBe('/tools/ipv4-subnet');
  expect(JSON.parse(sharedUrl.searchParams.get('input') || '{}').address).toBe('172.16.32.1/21');
  for (const format of ['JSON', 'CSV', 'PDF'] as const) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: format, exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format.toLowerCase()}$`));
    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();
    const bytes = await readFile(downloadedPath!);
    expect(bytes.length).toBeGreaterThan(100);
    if (format === 'JSON')
      expect(JSON.parse(bytes.toString()).normalizedInput.address).toBe('172.16.32.1/21');
    if (format === 'CSV') expect(bytes.toString()).toContain('172.16.32.0/21');
    if (format === 'PDF') expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  }
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls))
    .toBe(1);
  await page.goto(shared);
  await expect(calculationField(page, 'Network')).toHaveText('172.16.32.0/21');
});

test('the keyboard command palette opens a matching tool', async ({ page }) => {
  await openPage(page, '/');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Find a tool or resource' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search tools and resources' }).fill('NAT64');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/tools\/ipv4-map$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('IPv4 / IPv6 mapping');
});

test('the glossary filters real definitions and opens a related concept', async ({ page }) => {
  await openPage(page, '/glossary');
  await page.getByRole('textbox', { name: 'Search glossary' }).fill('CIDR');
  await expect(page.locator('.glossary-entry').first()).toContainText(/CIDR|Classless/i);
  const related = page
    .locator('.glossary-entry')
    .first()
    .locator('.glossary-related button')
    .first();
  const term = await related.textContent();
  await related.click();
  await expect(page).toHaveURL(/term=/);
  await expect(page.locator('.glossary-entry h2')).toHaveText(term || '');
});

test('DNS failures are recoverable and fixture answers remain source-labeled', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/lookups/dns', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ name: 'example.com', type: 'A' });
    calls += 1;
    if (calls === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message: 'The test resolver is temporarily unavailable.',
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        toolId: 'dns',
        title: 'DNS lookup test fixture',
        normalizedInput: { name: 'example.com', type: 'A' },
        summary: [
          { label: 'Resolver', value: 'Controlled test fixture' },
          { label: 'Query', value: 'example.com' },
        ],
        columns: [
          { key: 'data', label: 'Answer' },
          { key: 'ttl', label: 'TTL' },
        ],
        rows: [{ data: '192.0.2.10', ttl: 300 }],
        steps: [
          {
            title: 'Read the answer',
            description: 'This controlled fixture exercises the display and retry workflow.',
          },
        ],
        warnings: ['Synthetic test fixture; no live DNS measurement.'],
        sources: ['https://www.rfc-editor.org/rfc/rfc1035.html'],
        engineVersion: '1.0.0',
      }),
    });
  });
  await openPage(page, '/toolkit/dns');
  await page.getByRole('button', { name: 'Look up records', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('The test resolver is temporarily unavailable.');
  await expect(page.getByRole('region', { name: 'Calculation result' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Look up records', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Calculation result' })).toContainText(
    '192.0.2.10',
  );
  await expect(page.getByRole('region', { name: 'Calculation result' })).toContainText(
    'Controlled test fixture',
  );
  expect(calls).toBe(2);
});

test('the assistant streams a labeled demonstration through the real API with calculation context', async ({
  page,
}) => {
  const input = encodeURIComponent(
    JSON.stringify({ address: '192.0.2.4/31', policy: 'point-to-point' }),
  );
  await openPage(page, `/tools/ipv4-subnet?input=${input}`);
  await page.getByRole('link', { name: 'Discuss this result' }).click();
  await expect(page.getByText('IPv4 subnet calculation attached')).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Message the assistant' })
    .fill('Explain the endpoint count in this calculation.');
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/ai/chat') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/event-stream');
  const body = await response.text();
  expect(body).toMatch(/"type"\s*:\s*"delta"/);
  expect(body).toMatch(/"mode"\s*:\s*"demo"/);
  await expect(page.getByRole('log', { name: 'Conversation messages' })).toContainText(
    'AI not configured — demo response',
  );
  await expect(page.getByRole('log', { name: 'Conversation messages' })).toContainText(
    'Your attached calculation was recomputed',
  );
  await expect(page.getByRole('log', { name: 'Conversation messages' })).toContainText(
    'Usable under policy: 2',
  );
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
});

test('unconfigured accounts explain setup and unknown routes provide recovery', async ({
  page,
}) => {
  await openPage(page, '/auth');
  await expect(page.getByText(/Accounts are not configured in this installation/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email address' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Continue with free tools' }).click();
  await expect(page).toHaveURL(/\/tools$/);
  await openPage(page, '/this-page-does-not-exist');
  await expect(page.locator('main')).toContainText('404 · NO ROUTE TO THIS PAGE');
  await expect(page.locator('main a[href="/"]')).toBeVisible();
});

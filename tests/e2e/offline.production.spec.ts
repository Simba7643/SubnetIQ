import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { calculationField, openPage } from './helpers';

test('the production service worker supports offline calculations without caching private or API responses', async ({
  page,
  context,
}) => {
  await openPage(page, '/tools/ipv4-subnet');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const health = await page.evaluate(() =>
    fetch('/api/health', { cache: 'no-store' }).then((response) => response.status),
  );
  expect(health).toBe(200);
  await page.evaluate(async () => {
    await Promise.all(
      ['/projects', '/account', '/auth', '/assistant'].map((path) =>
        fetch(path, { cache: 'no-store' }).then((response) => response.arrayBuffer()),
      ),
    );
  });
  const paths = await page.evaluate(async () => {
    const names = await caches.keys();
    const entries = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return entries.flat().map((request) => new URL(request.url).pathname);
  });
  expect(paths).toContain('/index.html');
  expect(
    paths.some((path) => /^\/(api|auth|account|projects|share|assistant)(?:\/|$)/.test(path)),
  ).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('IPv4 subnet calculator');
  await expect(page.locator('.offline-indicator')).toContainText('Offline');
  await page.getByRole('textbox', { name: 'IPv4 address / prefix' }).fill('10.9.8.7/20');
  await expect(calculationField(page, 'Network')).toHaveText('10.9.0.0/20');
  await expect(calculationField(page, 'Usable under policy')).toHaveText('4094');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const download = await downloadEvent;
  const target = await download.path();
  expect(target).not.toBeNull();
  expect((await readFile(target!)).subarray(0, 4).toString()).toBe('%PDF');
  await page.goto('/tools/vlsm');
  await expect(page.getByRole('region', { name: 'Calculation result' })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Segment 1 hosts', exact: true }).fill('80');
  await expect(page.getByRole('heading', { name: 'Address-space map' })).toBeVisible();
  const offlineApi = await page.evaluate(() =>
    fetch('/api/health', { cache: 'no-store' })
      .then(() => 'response')
      .catch(() => 'unavailable'),
  );
  expect(offlineApi).toBe('unavailable');
  const finalPaths = await page.evaluate(async () => {
    const names = await caches.keys();
    const entries = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return entries.flat().map((request) => new URL(request.url).pathname);
  });
  expect(
    finalPaths.some((path) => /^\/(api|auth|account|projects|share|assistant)(?:\/|$)/.test(path)),
  ).toBe(false);
});

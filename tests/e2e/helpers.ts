import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export function calculationField(page: Page, label: string): Locator {
  return page
    .getByRole('region', { name: 'Calculation result' })
    .locator('.result-field')
    .filter({
      has: page
        .locator('dt')
        .filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }),
    })
    .locator('dd');
}

export async function openPage(page: Page, route: string) {
  await page.goto(route);
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

export async function screenshotArtifact(
  page: Page,
  filename: string,
  testInfo: TestInfo,
  fullPage = false,
) {
  const directory = path.resolve('docs/screenshots');
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, filename);
  await page.screenshot({ path: target, fullPage, animations: 'disabled' });
  await testInfo.attach(filename, { path: target, contentType: 'image/png' });
}

export async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
}

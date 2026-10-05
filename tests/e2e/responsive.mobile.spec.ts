import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  calculationField,
  openPage,
  screenshotArtifact,
} from './helpers';

test('mobile navigation opens, navigates, and closes without off-screen focus targets', async ({
  page,
}, testInfo) => {
  await openPage(page, '/');
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.locator('.sidebar').getByRole('link', { name: 'Calculators', exact: true }).click();
  await expect(page).toHaveURL(/\/tools$/);
  await expect(page.locator('.sidebar')).toBeHidden();
  await assertNoHorizontalOverflow(page);
  await screenshotArtifact(page, 'mobile-tool-catalog.png', testInfo);
});

test('a mobile calculation remains usable in dark mode and Arabic layout', async ({
  page,
}, testInfo) => {
  await openPage(page, '/tools/ipv4-subnet');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('textbox', { name: 'IPv4 address / prefix' }).fill('192.0.2.4/31');
  await page
    .getByRole('combobox', { name: 'Address capacity policy' })
    .selectOption('point-to-point');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(calculationField(page, 'Usable under policy')).toHaveText('2');
  await assertNoHorizontalOverflow(page);
  await screenshotArtifact(page, 'mobile-dark-rtl-calculator.png', testInfo);
});

test('mobile visual controls pass automated accessibility checks', async ({ page }, testInfo) => {
  await openPage(page, '/tools/ipv4-subnet');
  await page.getByRole('button', { name: 'Show visual lab' }).click();
  await page.locator('.binary-visualizer').scrollIntoViewIfNeeded();
  await assertNoHorizontalOverflow(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  await testInfo.attach('axe-mobile.json', {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
  expect(results.violations).toEqual([]);
  await screenshotArtifact(page, 'mobile-binary-visualizer.png', testInfo);
});

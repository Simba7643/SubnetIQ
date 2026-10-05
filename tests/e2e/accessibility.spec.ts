import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openPage } from './helpers';

const pages = [
  '/',
  '/tools',
  '/tools/ipv4-subnet',
  '/tools/vlsm',
  '/tools/ipv6-plan',
  '/learn',
  '/glossary',
  '/practice',
  '/toolkit/dns',
  '/assistant',
  '/auth',
];

for (const route of pages) {
  test(`WCAG 2.1 A/AA automated checks: ${route}`, async ({ page }, testInfo) => {
    await openPage(page, route);
    if (route === '/tools/ipv4-subnet')
      await page.getByRole('button', { name: 'Show visual lab' }).click();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    await testInfo.attach('axe-results.json', {
      body: JSON.stringify(
        {
          route,
          violations: result.violations,
          incomplete: result.incomplete,
          passes: result.passes.length,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    expect(
      result.violations,
      JSON.stringify(
        result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          description: violation.description,
          nodes: violation.nodes.map((node) => ({
            target: node.target,
            summary: node.failureSummary,
          })),
        })),
        null,
        2,
      ),
    ).toEqual([]);
  });
}

test('the dark calculator visualizer passes automated contrast and control checks', async ({
  page,
}, testInfo) => {
  await openPage(page, '/tools/ipv4-subnet');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.getByRole('button', { name: 'Show visual lab' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  await testInfo.attach('axe-dark-results.json', {
    body: JSON.stringify(result.violations, null, 2),
    contentType: 'application/json',
  });
  expect(result.violations).toEqual([]);
});

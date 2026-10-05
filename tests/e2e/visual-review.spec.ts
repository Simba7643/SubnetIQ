import { expect, test } from '@playwright/test';
import { assertNoHorizontalOverflow, openPage, screenshotArtifact } from './helpers';

test('desktop pages produce reviewable screenshots with usable layouts', async ({
  page,
}, testInfo) => {
  await openPage(page, '/');
  await assertNoHorizontalOverflow(page);
  await screenshotArtifact(page, 'desktop-home.png', testInfo);
  await openPage(page, '/tools/ipv4-subnet');
  await page.getByRole('button', { name: 'Show visual lab' }).click();
  await assertNoHorizontalOverflow(page);
  await screenshotArtifact(page, 'desktop-ipv4-calculator.png', testInfo);
  await openPage(page, '/tools/vlsm');
  await assertNoHorizontalOverflow(page);
  await screenshotArtifact(page, 'desktop-vlsm-planner.png', testInfo);
  await openPage(page, '/learn');
  await screenshotArtifact(page, 'desktop-learning-path.png', testInfo);
  await openPage(page, '/assistant');
  await expect(page.getByRole('textbox', { name: 'Message the assistant' })).toBeVisible();
  await screenshotArtifact(page, 'desktop-assistant.png', testInfo);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await openPage(page, '/tools/ipv6-plan');
  await assertNoHorizontalOverflow(page);
  await screenshotArtifact(page, 'desktop-dark-ipv6-planner.png', testInfo);
});

import { expect, test } from '@playwright/test';
import { generatePracticeQuestion } from '../../packages/shared/src/practice';
import { openPage } from './helpers';

test('the binary lesson toggles bit weights and hands an address to the calculator', async ({
  page,
}) => {
  await openPage(page, '/learn/binary-math#visualizer');
  const weight = page.getByRole('button', { name: 'Toggle weight 128', exact: true });
  await expect(weight).toHaveAttribute('aria-pressed', 'true');
  await weight.click();
  await expect(weight).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('01000000', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(page.getByText('00000000', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Set all', exact: true }).click();
  await expect(page.getByText('11111111', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Use this octet in a subnet' }).click();
  await expect(page).toHaveURL(/\/tools\/ipv4-subnet\?input=/);
  await expect(page.getByRole('region', { name: 'Calculation result' })).toBeVisible();
});

test('generated practice reproduces a seed, locks the answer, and advances to the next question', async ({
  page,
}) => {
  await openPage(page, '/practice');
  await page.getByLabel('Question source', { exact: true }).selectOption('generated');
  await page.getByLabel('Questions', { exact: true }).selectOption('5');
  await page.getByText('Reproducible session seed', { exact: true }).click();
  await page.getByLabel('Seed', { exact: true }).fill('42');
  await page.getByRole('button', { name: 'Start practice' }).click();
  const first = generatePracticeQuestion(42, 'beginner', 0);
  await expect(page.getByRole('heading', { name: first.question, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check answer' })).toBeDisabled();
  await page.getByRole('radio').nth(first.correctIndex).check();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByText(first.explanation, { exact: true })).toBeVisible();
  await expect(page.getByRole('radio').nth(first.correctIndex)).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Correct. Keep the reasoning.' })).toBeVisible();
  await page.getByRole('button', { name: 'Next question' }).click();
  const next = generatePracticeQuestion(42, 'beginner', 1);
  await expect(page.getByRole('heading', { name: next.question, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check answer' })).toBeDisabled();
});

test('glossary query links search terms and related concepts', async ({ page }) => {
  await openPage(page, '/glossary?q=longest-prefix');
  await expect(page.getByRole('textbox', { name: 'Search glossary' })).toHaveValue(
    'longest-prefix',
  );
  const heading = page.getByRole('heading', { name: 'Longest-prefix match', exact: true });
  await heading.getByRole('button').click();
  await expect(page).toHaveURL(/term=longest-prefix-match/);
  await expect(page.getByText('One connected concept', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Routing table', exact: true }).click();
  await expect(page).toHaveURL(/term=routing-table/);
  await expect(page.getByRole('heading', { name: 'Routing table', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show all terms', exact: true }).click();
  await expect(page.getByText('302 matching entries', { exact: true })).toBeVisible();
});

test('cheat sheets switch references and validate CIDR bounds', async ({ page }) => {
  await openPage(page, '/cheatsheets');
  await page.getByLabel('First prefix', { exact: true }).fill('25');
  await page.getByLabel('Last prefix', { exact: true }).fill('26');
  await expect(
    page.getByRole('region', { name: 'Calculation result' }).locator('tbody tr'),
  ).toHaveCount(2);
  await page.getByLabel('First prefix', { exact: true }).fill('28');
  await expect(page.getByRole('alert')).toHaveText(
    'The first prefix cannot be greater than the last.',
  );
  await page.getByRole('button', { name: 'Powers of two', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Powers of two and octet weights', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: '4294967296', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Common ports', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Common service ports', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Transport', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'OSI & TCP/IP', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'OSI and TCP/IP models', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeVisible();
});

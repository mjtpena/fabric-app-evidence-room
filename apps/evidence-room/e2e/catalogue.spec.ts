import { expect, test, type Page } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

const DANA = 'demo-coord-dana';
const SAM = 'demo-owner-sam';

/** Today lives in the side panel on desktop and behind a "Today" button (bottom sheet) on phones. */
async function openToday(page: Page) {
  const panel = page.getByRole('complementary', { name: 'Today' });
  if (await panel.isVisible()) return panel;
  await page.getByRole('button', { name: /^Today/ }).click();
  return page.getByRole('dialog');
}

const svg = (page: Page) => page.getByTestId('catalogue-svg');

test('the catalogue renders a drawer per area and the engagement plaque', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/', DANA);
  await expect(page.getByTestId('drawer')).toHaveCount(7);
  await expect(page.getByTestId('plaque')).toHaveAttribute('aria-label', /18 of 46 accepted, 21 outstanding, 11 late/);
  // Every request shows as a card top above its drawer.
  await expect(page.getByTestId('tab')).toHaveCount(48);
  // Brass strips filled to each area's progress.
  await expect(page.locator('[data-testid="drawer"][data-code="INV"] [data-testid="strip"]')).toHaveAttribute('data-pct', '14');
  await expect(page.locator('[data-testid="drawer"][data-code="PAY"] [data-testid="strip"]')).toHaveAttribute('data-pct', '60');
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('lenses re-colour the same cards (click and number keys)', async ({ page }) => {
  await openApp(page, '/', DANA);
  await expect(svg(page)).toHaveAttribute('data-lens', 'status');
  await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Ageing/ }).click();
  await expect(svg(page)).toHaveAttribute('data-lens', 'ageing');
  await page.keyboard.press('3');
  await expect(svg(page)).toHaveAttribute('data-lens', 'owner');
  await page.keyboard.press('4');
  await expect(svg(page)).toHaveAttribute('data-lens', 'priority');
});

test('opening a drawer shows its cards: clips on queries, stamps on accepted, red tabs on overdue', async ({ page }) => {
  await openApp(page, '/', DANA);
  await page.locator('[data-testid="drawer"][data-code="REV"]').click();
  await expect(page.getByTestId('tray')).toHaveAttribute('data-area', 'Revenue');
  await expect(page.getByRole('heading', { level: 1, name: 'Revenue' })).toBeVisible();
  const cards = page.getByTestId('tray').getByTestId('card');
  await expect(cards).toHaveCount(9);
  await expect(page.locator('[data-testid="card"][data-clip="true"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="card"][data-stamped="true"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="card"][data-overdue="true"]')).toHaveCount(3);
  // Lift a card out, then open it at the reading desk.
  await page.locator('[data-testid="card"][data-ref="REV-03"]').click();
  await expect(page.locator('[data-testid="card"][data-ref="REV-03"]')).toHaveAttribute('data-focused', 'true');
  await expect(page.getByTestId('card-face')).toContainText('Query open');
  await page.getByTestId('focus-open').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Revenue cut-off: invoices either side of period end' })).toBeVisible();
  await expect(page.getByTestId('thread-item').filter({ hasText: 'signed delivery notes' })).toHaveAttribute('data-kind', 'query');
});

test('a Today item opens the drawer, lifts its card and switches to its lens', async ({ page }) => {
  await openApp(page, '/', DANA);
  const today = await openToday(page);
  await today.getByRole('button', { name: /REV-09 Bad debt provision calculation is 17 days late/ }).click();
  await expect(page.getByTestId('tray')).toHaveAttribute('data-area', 'Revenue');
  await expect(page.locator('[data-testid="card"][data-ref="REV-09"]')).toHaveAttribute('data-focused', 'true');
  await expect(svg(page)).toHaveAttribute('data-lens', 'ageing');
  await expect(page.getByRole('heading', { level: 1, name: 'Bad debt provision calculation' })).toBeVisible();
  // Escape puts the card back, then closes the drawer.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="card"][data-ref="REV-09"]')).toHaveAttribute('data-focused', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tray')).toHaveCount(0);
});

test('the lowest-progress area on Today opens that drawer', async ({ page }) => {
  await openApp(page, '/', DANA);
  const today = await openToday(page);
  await today.getByRole('button', { name: /Inventory is the least complete drawer/ }).click();
  await expect(page.getByTestId('tray')).toHaveAttribute('data-area', 'Inventory');
});

test('view as owner ranks the owner’s own work and dims the rest', async ({ page }) => {
  await openApp(page, '/', SAM);
  await expect(page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: 'Owner', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(svg(page)).toHaveAttribute('data-view-as', 'owner');
  const today = await openToday(page);
  await expect(today.getByRole('button', { name: /Query on REV-03/ })).toBeVisible();
  await today.getByRole('button', { name: /Query on REV-03/ }).click();
  await expect(page.locator('[data-testid="card"][data-ref="REV-05"]')).toHaveAttribute('data-dim', 'false');
  await page.keyboard.press('v');
  await expect(svg(page)).toHaveAttribute('data-view-as', 'all');
});

test('the list view shows the same 48 requests, with filters', async ({ page }) => {
  await openApp(page, '/', DANA);
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByTestId('list-row')).toHaveCount(48);
  await page.getByLabel('Status').selectOption({ label: 'Query' });
  await expect(page.getByTestId('list-row')).toHaveCount(6);
  await page.getByLabel('Status').selectOption({ label: 'All' });
  await page.getByLabel('Ageing').selectOption({ label: 'Overdue' });
  await expect(page.getByTestId('list-row')).toHaveCount(11);
  await assertNoHorizontalScroll(page);
});

test('without WebGL the catalogue still renders (it is SVG)', async ({ page }) => {
  await page.goto(`/?nowebgl&as=${DANA}#/`);
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await expect(page.getByTestId('drawer')).toHaveCount(7);
});

test('keyboard: arrows open drawers and lift cards, / finds a card', async ({ page }) => {
  await openApp(page, '/', DANA);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('tray')).toHaveAttribute('data-area', 'Revenue');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-testid="card"][data-ref="REV-01"]')).toHaveAttribute('data-focused', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('/');
  await page.keyboard.type('CASH-04');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="card"][data-ref="CASH-04"]')).toHaveAttribute('data-focused', 'true');
});

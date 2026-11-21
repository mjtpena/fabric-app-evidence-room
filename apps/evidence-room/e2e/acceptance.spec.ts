/** The five acceptance criteria in docs/SPEC-2.md, App 19, as UI tests. */
import { expect, test, type Page } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

const DANA = 'demo-coord-dana';
const MORGAN = 'demo-auditor-morgan';
const SAM = 'demo-owner-sam';

async function openToday(page: Page) {
  const panel = page.getByRole('complementary', { name: 'Today' });
  if (await panel.isVisible()) return panel;
  await page.getByRole('button', { name: /^Today/ }).click();
  return page.getByRole('dialog');
}

/** Open a request at the reading desk from the list view. */
async function openDesk(page: Page, persona: string, title: string) {
  await openApp(page, '/', persona);
  await page.getByRole('radio', { name: 'List' }).click();
  await page.getByRole('link', { name: title, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

test('1. an owner adds evidence and submits; the card moves to submitted and reaches the auditor’s queue', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openDesk(page, SAM, 'Bad debt provision calculation');
  await expect(page.getByTestId('status-mark').first()).toHaveAttribute('data-value', 'open');
  await expect(page.getByRole('button', { name: 'Submit to the auditor' })).toBeDisabled();

  const form = page.getByTestId('evidence-form');
  await form.getByLabel('Title').fill('Provision workings and policy');
  await form.getByLabel('Link').fill('https://files.example.com/finance/fy26/bad-debt');
  await form.getByRole('button', { name: 'Add to the card' }).click();
  await expect(page.getByTestId('evidence-row')).toHaveCount(1);
  await expect(page.getByTestId('status-mark').first()).toHaveAttribute('data-value', 'in_progress');

  await page.getByLabel('Note to the auditor (optional)').fill('Workings and the policy are in one folder.');
  await page.getByRole('button', { name: 'Submit to the auditor' }).click();
  await expect(page.getByTestId('status-mark').first()).toHaveAttribute('data-value', 'submitted');
  await expect(page.getByTestId('actions')).toContainText('With the auditor');

  // The card in the catalogue.
  await page.getByTestId('show-in-catalogue').click();
  await expect(page.locator('[data-testid="card"][data-ref="REV-09"]')).toHaveAttribute('data-status', 'submitted');

  // The auditor's queue (returns trolley), as Morgan.
  await openApp(page, '/trolley', MORGAN);
  await expect(page.getByTestId('waiting-count')).toHaveText('8');
  const row = page.locator('[data-testid="trolley-row"][data-ref="REV-09"]');
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Accept' })).toBeVisible();
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('2. an auditor raises a query; the card wears a clip and the coordinator’s Today shows it', async ({ page }) => {
  await openDesk(page, MORGAN, 'Disposals and proceeds');
  await page.getByRole('button', { name: 'Raise a query' }).click();
  await page.getByLabel('Query for the client').fill('Please add the sale agreements for the two vehicles sold.');
  await page.getByRole('button', { name: 'Send the query' }).click();
  await expect(page.getByTestId('status-mark').first()).toHaveAttribute('data-value', 'query');
  await expect(page.getByTestId('thread-item').last()).toHaveAttribute('data-kind', 'query');

  await page.getByTestId('show-in-catalogue').click();
  await expect(page.locator('[data-testid="card"][data-ref="FA-03"]')).toHaveAttribute('data-clip', 'true');

  await openApp(page, '/', DANA);
  const today = await openToday(page);
  const item = today.getByRole('button', { name: /New query on FA-03 Disposals and proceeds waits for the client/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.locator('[data-testid="card"][data-ref="FA-03"]')).toHaveAttribute('data-focused', 'true');
  await expect(page.locator('[data-testid="card"][data-ref="FA-03"]')).toHaveAttribute('data-clip', 'true');
});

test('3. a client persona cannot create or accept requests', async ({ page }) => {
  for (const persona of [SAM, DANA]) {
    await openApp(page, '/slip', persona);
    await expect(page.getByText('Request slips are written by auditors')).toBeVisible();
    await expect(page.getByRole('button', { name: 'File the slip' })).toHaveCount(0);
  }
  // A submitted request: the owner and the coordinator see no Accept or Query.
  await openDesk(page, SAM, 'Deferred revenue roll-forward');
  await expect(page.getByTestId('actions')).toContainText('With the auditor');
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Raise a query' })).toHaveCount(0);
  await openApp(page, '/trolley', DANA);
  await expect(page.getByTestId('trolley-row')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  // The auditor does see them.
  await openApp(page, '/trolley', MORGAN);
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(7);
});

test('4. ageing buckets and per-area progress match the unit-tested figures', async ({ page }) => {
  // The same numbers are asserted in src/domain/catalogue.test.ts ("the seed").
  await openApp(page, '/shelf', DANA);
  await expect(page.getByTestId('overall-progress')).toHaveText('39%');
  await expect(page.getByTestId('bucket-not_due')).toHaveText('10');
  await expect(page.getByTestId('bucket-late_1_7')).toHaveText('5');
  await expect(page.getByTestId('bucket-late_8_14')).toHaveText('3');
  await expect(page.getByTestId('bucket-late_15')).toHaveText('3');
  const expected: Record<string, [string, string]> = {
    Revenue: ['3/9', '33%'],
    Payroll: ['3/5', '60%'],
    'Fixed assets': ['3/6', '50%'],
    Cash: ['3/6', '50%'],
    Inventory: ['1/7', '14%'],
    Tax: ['2/6', '33%'],
    'IT general controls': ['3/7', '43%'],
  };
  for (const [area, [accepted, pct]] of Object.entries(expected)) {
    const row = page.locator(`[data-testid="shelf-area"][data-area="${area}"]`);
    await expect(row.getByTestId('area-accepted')).toHaveText(accepted);
    await expect(row.getByTestId('area-pct')).toHaveText(pct);
  }
  await expect(page.getByTestId('checks-clean')).toBeVisible();
  await assertNoHorizontalScroll(page);
});

test('5. typing "bank reconciliation" as a new title shows the existing similar request', async ({ page }) => {
  await openApp(page, '/slip', MORGAN);
  const hints = page.getByTestId('similar-item').filter({ visible: true });
  await expect(hints).toHaveCount(0);
  await page.getByLabel('Title').fill('bank reconciliation');
  await expect(hints).toHaveCount(1);
  await expect(hints.first()).toHaveAttribute('data-ref', 'CASH-01');
  await expect(hints.first()).toContainText('Bank reconciliations for all operating accounts at period end');
  await assertNoHorizontalScroll(page);
});

test('withdrawing needs a reason, which lands on the thread', async ({ page }) => {
  await openDesk(page, MORGAN, 'Cost of sales reconciliation');
  await page.getByRole('button', { name: 'Withdraw the request…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Withdraw' })).toBeDisabled();
  await dialog.getByLabel('Reason (posted to the thread)').fill('Covered by the INV-01 count work.');
  await dialog.getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByTestId('status-mark').first()).toHaveAttribute('data-value', 'withdrawn');
  await expect(page.getByTestId('thread-item').last()).toHaveAttribute('data-kind', 'withdrawal');
});

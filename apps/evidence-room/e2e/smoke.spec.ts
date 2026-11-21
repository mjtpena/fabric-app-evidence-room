import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

const MORGAN = 'demo-auditor-morgan';

test('loads, creates a record, sees it listed, no console errors', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/', MORGAN);
  await expect(page.getByRole('heading', { level: 1, name: 'The card catalogue' })).toBeVisible();
  await expect(page.getByTestId('drawer')).toHaveCount(7);
  await assertNoHorizontalScroll(page);

  // Create: an auditor files a request slip.
  await openApp(page, '/slip', MORGAN);
  await page.getByLabel('Audit area').selectOption({ label: 'Tax' });
  await expect(page.getByLabel('Ref')).toHaveValue('TAX-07');
  await page.getByLabel('Title').fill('Smoke test: research credit claim workings');
  await page.getByRole('button', { name: 'File the slip' }).click();

  // See it: the catalogue opens the Tax drawer with the new card lifted, and the list holds it.
  await expect(page.getByRole('heading', { level: 1, name: 'Smoke test: research credit claim workings' })).toBeVisible();
  await expect(page.locator('[data-testid="card"][data-ref="TAX-07"]')).toHaveAttribute('data-status', 'open');
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.locator('[data-testid="list-row"][data-ref="TAX-07"]')).toContainText('Smoke test: research credit claim workings');
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

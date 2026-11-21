/**
 * Redesign screenshots (not a test). Run: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 * Writes docs/redesign/<screen>-<theme>-<desktop|phone>.png.
 */
import { test, type Page } from '@playwright/test';

import { openApp } from '@x10/shared/e2e';

const DANA = 'demo-coord-dana';
const MORGAN = 'demo-auditor-morgan';
const SAM = 'demo-owner-sam';

type Shot = { name: string; path: string; persona: string; full?: boolean; act?: (page: Page, phone: boolean) => Promise<void> };

const lens = (name: RegExp) => async (page: Page) => {
  await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name }).click();
};

async function desk(page: Page, title: string) {
  await page.getByRole('radio', { name: 'List' }).click();
  await page.getByRole('link', { name: title, exact: true }).click();
  await page.getByRole('heading', { level: 1, name: title }).waitFor();
}

const SHOTS: Shot[] = [
  { name: 'catalogue-status', path: '/', persona: DANA },
  { name: 'catalogue-ageing', path: '/', persona: DANA, act: lens(/Ageing/) },
  { name: 'catalogue-owner', path: '/', persona: DANA, act: lens(/Owner/) },
  {
    name: 'catalogue-today-focus',
    path: '/',
    persona: DANA,
    act: async (page, phone) => {
      if (phone) await page.getByRole('button', { name: /^Today/ }).click();
      await page.getByRole('button', { name: /REV-09 Bad debt provision calculation is 17 days late/ }).click();
    },
  },
  {
    name: 'catalogue-drawer-open',
    path: '/',
    persona: DANA,
    act: async (page) => {
      await page.locator('[data-testid="drawer"][data-code="CASH"]').click();
      await page.waitForTimeout(700);
      await page.locator('[data-testid="card"][data-ref="CASH-01"]').click();
    },
  },
  {
    name: 'catalogue-view-as-auditor',
    path: '/',
    persona: MORGAN,
  },
  { name: 'catalogue-list', path: '/', persona: DANA, full: true, act: async (page) => void (await page.getByRole('radio', { name: 'List' }).click()) },
  { name: 'reading-desk-owner', path: '/', persona: SAM, full: true, act: (page) => desk(page, 'Bad debt provision calculation') },
  { name: 'reading-desk-query', path: '/', persona: MORGAN, full: true, act: (page) => desk(page, 'Revenue cut-off: invoices either side of period end') },
  { name: 'reading-desk-accepted', path: '/', persona: DANA, full: true, act: (page) => desk(page, 'Bank reconciliations for all operating accounts at period end') },
  { name: 'reading-desk-review', path: '/', persona: MORGAN, full: true, act: (page) => desk(page, 'Deferred revenue roll-forward') },
  { name: 'returns-trolley', path: '/trolley', persona: MORGAN },
  {
    name: 'request-slip',
    path: '/slip',
    persona: MORGAN,
    act: async (page) => {
      await page.getByLabel('Audit area').selectOption({ label: 'Cash' });
      await page.getByLabel('Title').fill('bank reconciliation');
    },
  },
  { name: 'request-slip-client', path: '/slip', persona: SAM },
  { name: 'shelf-list', path: '/shelf', persona: DANA, full: true },
  { name: 'about', path: '/about', persona: DANA, full: true },
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });
    for (const s of SHOTS) {
      test(`${s.name} ${scheme}`, async ({ page }, info) => {
        test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to write the redesign screenshots.');
        const phone = info.project.name === 'phone';
        await openApp(page, s.path, s.persona);
        await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
        if (s.act) await s.act(page, phone);
        await page.waitForTimeout(1400);
        await page.screenshot({ path: `docs/redesign/${s.name}-${scheme}-${phone ? 'phone' : 'desktop'}.png`, fullPage: !!s.full && !phone });
      });
    }
  });
}

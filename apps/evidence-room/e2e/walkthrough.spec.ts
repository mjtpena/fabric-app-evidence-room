/**
 * Dry run of demo/walkthrough.ts: every scene's steps, without narration, at the recorder's 1920×1080, with the
 * recorder's goto semantics (a new persona reloads with ?as=, the same persona only changes the hash).
 */
import { expect, test, type Locator } from '@playwright/test';

import type { DemoHelpers } from '@x10/shared/demo';

import { script } from '../demo/walkthrough';

test.use({ viewport: { width: 1920, height: 1080 } });

test('the walkthrough runs end to end', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The recording is desktop only.');
  test.setTimeout(180_000);
  const resolve = (t: Locator | string) => (typeof t === 'string' ? page.locator(t) : t);
  let current = script.persona ?? '';
  let opened = false;
  const h: DemoHelpers = {
    page,
    async goto(path, persona) {
      const who = persona ?? current;
      if (!opened || who !== current) {
        await page.goto(`/?as=${encodeURIComponent(who)}#${path}`);
        opened = true;
        current = who;
      } else {
        await page.evaluate((p) => {
          window.location.hash = p;
        }, path);
      }
      await expect(page.getByTestId('demo-banner')).toBeVisible();
      await page.waitForTimeout(300);
    },
    async click(t) {
      await resolve(t).click({ timeout: 5000 });
      await page.waitForTimeout(250);
    },
    async type(t, text) {
      const l = resolve(t);
      await l.click();
      await l.pressSequentially(text, { delay: 5 });
    },
    async fill(t, text) {
      await resolve(t).fill(text);
    },
    async select(t, label) {
      await resolve(t).selectOption({ label });
    },
    async hover(t) {
      await resolve(t).hover();
    },
    async scrollTo(t) {
      await resolve(t).scrollIntoViewIfNeeded();
    },
    async spotlight(t) {
      await expect(resolve(t)).toBeVisible();
    },
    async pause(ms) {
      await page.waitForTimeout(Math.min(ms, 300));
    },
  };
  const lines = script.scenes.flatMap((s) => s.say);
  expect(lines.length).toBeGreaterThanOrEqual(14);
  expect(lines.length).toBeLessThanOrEqual(19);
  for (const scene of script.scenes) {
    await test.step(scene.id, () => scene.run(h));
  }
  // The story's payoffs: Sam's submission was queried, so REV-09 wears a clip.
  await h.goto('/', current);
  await page.getByLabel('Find a card').fill('REV-09');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="card"][data-ref="REV-09"]')).toHaveAttribute('data-clip', 'true');
});

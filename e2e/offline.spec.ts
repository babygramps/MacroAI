import { test, expect } from '@playwright/test';

/**
 * Offline app-shell test — needs no credentials.
 *
 * Verifies the service worker (public/sw.js) serves the app shell when the
 * network is gone: first visit online installs the SW and caches the page;
 * a reload with the browser offline must still render MacroAI instead of
 * the browser error page.
 */
test('app shell loads offline after first visit', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText('MacroAI')).toBeVisible();

  // Wait for the service worker to be active and its install pre-warm to finish
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(async () => page.evaluate(async () => (await caches.keys()).length), {
      message: 'service worker caches should be populated',
    })
    .toBeGreaterThan(0);

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByText('MacroAI')).toBeVisible();

  await context.setOffline(false);
});

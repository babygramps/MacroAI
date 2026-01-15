import { test, expect } from '@playwright/test';

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test('login and open food log modal', async ({ page }) => {
  test.skip(!username || !password, 'E2E credentials not set.');

  await page.goto('/');

  const userField = page.getByLabel(/username|email/i);
  const passField = page.getByLabel(/password/i);

  await userField.fill(username as string);
  await passField.fill(password as string);

  await page.getByRole('button', { name: /sign in/i }).click();

  const logFoodButton = page.getByRole('button', { name: /log food/i });
  await expect(logFoodButton).toBeVisible({ timeout: 30000 });

  await logFoodButton.click();
  await expect(page.getByRole('heading', { name: /log food/i })).toBeVisible();

  await page.getByRole('button', { name: /type/i }).click();
  await page.getByRole('button', { name: /photo/i }).click();
});

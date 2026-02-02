import { test, expect, type Page } from '@playwright/test';

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

async function login(page: Page) {
  console.log('[E2E] Navigating to root');
  await page.goto('/');

  const logFoodButton = page.getByRole('button', { name: /log food/i });
  const isLoggedIn = await logFoodButton.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('[E2E] Logged in state (Log Food visible):', isLoggedIn);
  if (isLoggedIn) {
    return;
  }
  if (!username || !password) {
    test.skip(true, 'E2E credentials not set.');
    return;
  }

  const userField = page.locator(
    'input[type="email"], input[name="username"], input[autocomplete="username"], input[placeholder*="email" i], input[placeholder*="username" i]'
  ).first();
  const passField = page.locator(
    'input[type="password"], input[autocomplete="current-password"]'
  ).first();
  console.log('[E2E] Waiting for login form');
  await expect(userField).toBeVisible({ timeout: 15000 });
  await expect(passField).toBeVisible({ timeout: 15000 });
  console.log('[E2E] Filling credentials');

  await userField.fill(username as string);
  await passField.fill(password as string);

  console.log('[E2E] Submitting sign-in');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(logFoodButton).toBeVisible({ timeout: 30000 });
}

test('login and open food log modal', async ({ page }) => {
  console.log('[E2E] Test start: login and open food log modal');
  await login(page);

  const logFoodButton = page.getByRole('button', { name: /log food/i });
  console.log('[E2E] Waiting for Log Food button');
  await expect(logFoodButton).toBeVisible({ timeout: 30000 });

  console.log('[E2E] Opening Food Log modal');
  await logFoodButton.click();
  await expect(page.getByRole('heading', { name: /log food/i })).toBeVisible();

  console.log('[E2E] Switching tabs');
  await page.getByRole('button', { name: /type/i }).click();
  await page.getByRole('button', { name: /photo/i }).click();
});

test('logged meal persists after refresh', async ({ page }) => {
  test.setTimeout(120000);
  console.log('[E2E] Test start: logged meal persists after refresh');

  await login(page);

  const logFoodButton = page.getByRole('button', { name: /log food/i });
  console.log('[E2E] Waiting for Log Food button');
  await expect(logFoodButton).toBeVisible({ timeout: 30000 });
  console.log('[E2E] Opening Food Log modal');
  await logFoodButton.click();

  await expect(page.getByRole('heading', { name: /log food/i })).toBeVisible();
  console.log('[E2E] Selecting Search tab');
  await page.getByRole('button', { name: /search/i }).click();

  const searchInput = page.getByPlaceholder('Search foods...');
  console.log('[E2E] Searching for banana');
  await searchInput.fill('banana');
  await searchInput.press('Enter');

  const firstResult = page.getByRole('button', { name: /kcal per/i }).first();
  console.log('[E2E] Waiting for search results');
  await expect(firstResult).toBeVisible({ timeout: 30000 });
  console.log('[E2E] Selecting first result');
  await firstResult.click();

  const continueButton = page.getByRole('button', { name: /^continue$/i });
  console.log('[E2E] Continuing to category');
  await expect(continueButton).toBeVisible();
  await continueButton.click();

  const mealName = `E2E Meal ${Date.now()}`;
  await expect(page.getByRole('heading', { name: /what is this/i })).toBeVisible({ timeout: 15000 });
  const nameInput = page.locator(
    'input[placeholder*="afternoon snack" i], input[placeholder*="lunch" i], input[placeholder*="snack" i], input.input-field'
  ).first();
  console.log('[E2E] Filling meal name:', mealName);
  await expect(nameInput).toBeVisible({ timeout: 15000 });
  await nameInput.fill(mealName);

  const logButton = page.getByRole('button', { name: /log (meal|snack|drink)/i });
  console.log('[E2E] Logging meal');
  await expect(logButton).toBeEnabled();
  await logButton.click();

  console.log('[E2E] Waiting for meal to appear');
  await expect(page.getByText(mealName)).toBeVisible({ timeout: 30000 });

  console.log('[E2E] Refreshing page');
  await page.reload();
  console.log('[E2E] Verifying meal persists after refresh');
  await expect(page.getByText(mealName)).toBeVisible({ timeout: 30000 });
});

test('type modal logs complex meal', async ({ page }) => {
  test.setTimeout(120000);
  console.log('[E2E] Test start: type modal logs complex meal');

  await login(page);

  const logFoodButton = page.getByRole('button', { name: /log food/i });
  console.log('[E2E] Waiting for Log Food button');
  await expect(logFoodButton).toBeVisible({ timeout: 30000 });
  console.log('[E2E] Opening Food Log modal');
  await logFoodButton.click();

  await expect(page.getByRole('heading', { name: /log food/i })).toBeVisible();
  console.log('[E2E] Selecting Type tab');
  await page.getByRole('button', { name: /type/i }).click();

  const description = '2 scrambled eggs, 3 strips of bacon, and a slice of toast';
  const textArea = page.getByPlaceholder(/2 eggs|bacon/i);
  console.log('[E2E] Entering meal description');
  await expect(textArea).toBeVisible({ timeout: 15000 });
  await textArea.fill(description);

  const analyzeButton = page.getByRole('button', { name: /analyze meal/i });
  console.log('[E2E] Analyzing meal');
  await expect(analyzeButton).toBeEnabled();
  await analyzeButton.click();

  console.log('[E2E] Waiting for review screen');
  await expect(page.getByRole('heading', { name: /review ingredients/i })).toBeVisible({ timeout: 30000 });

  const continueButton = page.getByRole('button', { name: /^continue$/i });
  console.log('[E2E] Continuing to category');
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  await expect(page.getByRole('heading', { name: /what is this/i })).toBeVisible({ timeout: 15000 });
  const mealName = `E2E Type Meal ${Date.now()}`;
  const nameInput = page.locator(
    'input[placeholder*="breakfast" i], input[placeholder*="lunch" i], input[placeholder*="snack" i], input.input-field'
  ).first();
  console.log('[E2E] Filling meal name:', mealName);
  await expect(nameInput).toBeVisible({ timeout: 15000 });
  await nameInput.fill(mealName);

  const logButton = page.getByRole('button', { name: /log (meal|snack|drink)/i });
  console.log('[E2E] Logging meal');
  await expect(logButton).toBeEnabled();
  await logButton.click();

  console.log('[E2E] Waiting for meal to appear');
  await expect(page.getByText(mealName)).toBeVisible({ timeout: 30000 });
});

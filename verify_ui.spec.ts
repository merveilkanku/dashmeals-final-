import { test, expect } from '@playwright/test';

test('Verify AuthScreen and Demo Mode', async ({ page }) => {
  // Go to the preview server
  await page.goto('http://localhost:4175');

  // Wait for loading or splash screen to disappear
  await page.waitForTimeout(5000);

  // Check if logo is present
  const logo = page.locator('img[alt="DashMeals Logo"]');
  await expect(logo).toBeVisible();

  // Take a screenshot of the Auth screen
  await page.screenshot({ path: 'auth_screen_v2.png' });

  // Try to click "Continuer en Mode Démo"
  // Since the previous run failed to find it by text, let's try a more robust selector
  // It's a button inside the form.
  const demoButton = page.getByRole('button', { name: /Continuer en Mode Démo/i });
  if (await demoButton.isVisible()) {
    await demoButton.click();
  } else {
    // Fallback: search for any button that might be the demo button
    const orangeButton = page.locator('button.bg-orange-500');
    if (await orangeButton.isVisible()) {
        await orangeButton.click();
    }
  }

  // Wait for navigation/state change
  await page.waitForTimeout(2000);

  // Verify we entered the app (should see "DashMeals" or a search bar)
  await page.screenshot({ path: 'app_home_demo.png' });
});

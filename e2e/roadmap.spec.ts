import { expect, test } from '@playwright/test';

test.describe('World Cup roadmap', () => {
  test('API returns a normalized tournament', async ({ request }) => {
    const res = await request.get('/api/worldcup');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.error).toBeNull();
    expect(body.data.matches).toHaveLength(104);
    expect(body.data.groups).toHaveLength(12);
  });

  test('landing renders the hero and the bracket canvas', async ({ page }) => {
    await page.goto('/?view=bracket');
    await expect(page.getByRole('heading', { name: 'The Road to the Final' })).toBeVisible();
    // Match cards render inside the React Flow canvas.
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
  });

  test('stage toggle switches views and a match opens the detail panel', async ({ page }) => {
    await page.goto('/?view=bracket');
    await page.getByRole('tab', { name: 'Groups' }).click();
    await expect(page).toHaveURL(/view=groups/);
    await expect(page.getByRole('tab', { name: 'Full roadmap' })).toBeVisible();

    await page.getByRole('tab', { name: 'Bracket' }).click();
    await page.locator('[data-final="true"]').click();
    // Exact locator: getByLabel('Match details') alone is ambiguous because the
    // close button is labelled "Close match details" (substring match), so scope
    // to the panel's complementary role and assert it is exposed (aria-hidden=false).
    const panel = page.getByRole('complementary', { name: 'Match details' });
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('aria-hidden', 'false');
  });
});

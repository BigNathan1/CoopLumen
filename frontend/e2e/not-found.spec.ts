import { expect, test } from '@playwright/test';

test.describe('404 page for unknown routes', () => {
  test('renders the 404 page for an unknown top-level route and navigates back to the homepage', async ({
    page,
  }) => {
    const response = await page.goto('/unknown-route-that-does-not-exist');

    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle('Page not found | CoopLumen');
    await expect(page.getByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible();
    await expect(
      page.getByText("The page you were looking for doesn't exist, or may have moved.")
    ).toBeVisible();

    const dashboardLink = page.getByRole('link', { name: 'Go to dashboard' });
    const homeLink = page.getByRole('link', { name: 'Back to homepage' });

    await expect(dashboardLink).toBeVisible();
    await expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute('href', '/');

    await homeLink.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('renders the 404 page for an unknown nested route and navigates to the dashboard', async ({
    page,
  }) => {
    const response = await page.goto('/communities/unknown-section/non-existent-route');

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible();

    const dashboardLink = page.getByRole('link', { name: 'Go to dashboard' });
    await expect(dashboardLink).toBeVisible();

    await dashboardLink.click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

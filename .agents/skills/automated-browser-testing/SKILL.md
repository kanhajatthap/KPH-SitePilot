---
name: automated-browser-testing
description: >-
  Provides end-to-end browser testing workflows, Playwright configurations, WordPress admin authentication fixtures,
  and visual regression tests. Use when setting up, writing, or debugging automated browser tests for WordPress sites.
---

# Automated Browser Testing with Playwright

This skill governs end-to-end (E2E) testing of WordPress themes, plugins, and admin workflows using [Playwright](https://playwright.dev/).

## Playwright Configuration for LocalWP

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false, // Prevent race conditions on local WordPress databases
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.WP_BASE_URL || 'http://plugin-test.local',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
});
```

## WordPress Admin Authentication Setup

Use a setup fixture to authenticate once and reuse browser storage state:

```typescript
// tests/e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';

const authFile = '.auth/admin.json';

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/wp-login.php');
  
  // Enter credentials from local test environment variables
  await page.fill('#user_login', process.env.WP_ADMIN_USER || 'admin');
  await page.fill('#user_pass', process.env.WP_ADMIN_PASSWORD || 'password');
  await page.click('#wp-submit');

  // Verify successful login
  await expect(page.locator('#wpadminbar')).toBeVisible();

  // Save authenticated state
  await page.context().storageState({ path: authFile });
});
```

## End-to-End Test Example

```typescript
// tests/e2e/plugin-dashboard.spec.ts
import { test, expect } from '@playwright/test';

test.describe('WP Agent Companion Admin', () => {
  test('displays status page in WordPress dashboard', async ({ page }) => {
    await page.goto('/wp-admin/admin.php?page=wp-agent');
    
    const heading = page.locator('h1');
    await expect(heading).toContainText('WP Agent Bridge');

    // Check accessibility with axe
    // const results = await new AxeBuilder({ page }).analyze();
    // expect(results.violations).toEqual([]);
  });
});
```

## Running Browser Tests

```powershell
# Run all E2E tests headless
pnpm test:e2e

# Run with interactive UI mode
pnpm playwright test --ui

# Inspect test trace on failure
pnpm playwright show-trace test-results/trace.zip
```

## Official References

- [Playwright Documentation](https://playwright.dev/)
- [WordPress Core Playwright Integration](https://developer.wordpress.org/block-editor/contributors/code/testing-overview/)
- [Axe-core Playwright Accessibility Testing](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)

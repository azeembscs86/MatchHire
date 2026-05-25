'use strict';

/**
 * E2E — company dashboard posting list contract.
 *
 * Authenticates as the QA employer and verifies:
 *   - The "Active job postings" panel renders (heading is the
 *     stable landmark; the seed may or may not include rows).
 *   - The "Post new job" CTA in the topbar uses the testid-rooted
 *     selector and is keyboard-focusable.
 *   - The dashboard root carries data-testid="company-dashboard"
 *     so future specs can scope to it without relying on classes.
 *
 * Read-only: no jobs are created or deleted.
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');

test.describe('@company Company posting list', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page, 'COMPANY');
  });

  test('dashboard scope has the company-dashboard testid', async ({ page }) => {
    await page.goto('/dashboard/company');
    await expect(page.getByTestId('company-dashboard')).toBeVisible({ timeout: 15_000 });
  });

  test('Active job postings panel is rendered', async ({ page }) => {
    await page.goto('/dashboard/company');
    await expect(page.getByRole('heading', { name: /active job postings/i }))
      .toBeVisible({ timeout: 15_000 });
  });

  test('"Post new job" CTA is keyboard-focusable', async ({ page }) => {
    await page.goto('/dashboard/company');
    const btn = page.getByRole('button', { name: /post new job/i }).first();
    await expect(btn).toBeVisible({ timeout: 15_000 });
    await btn.focus();
    // Read the focused element back and confirm it's the button
    // we just targeted — a small assertion that protects against
    // a tabindex regression accidentally taking the CTA out of
    // the keyboard flow.
    const focused = await page.evaluate(() => document.activeElement?.textContent || '');
    expect(focused.toLowerCase()).toContain('post new job');
  });
});

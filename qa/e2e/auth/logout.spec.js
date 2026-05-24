'use strict';

/**
 * E2E — sign-out clears the session.
 *
 * Authenticates as a candidate via the helper (fast), clicks the
 * Header's "Sign out" button, and verifies the UI flips back to
 * the guest state.
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');

test.describe('@smoke Sign-out', () => {
  test('candidate can sign out from the header', async ({ page }) => {
    await authenticatePage(page, 'CANDIDATE');
    await expect(page.getByRole('button', { name: /^sign out$/i })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /^sign out$/i }).click();

    // Guest header renders the "Sign in" + "Join free" buttons.
    await expect(page.getByRole('button', { name: /^sign in$/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^sign out$/i })).toHaveCount(0);
  });
});

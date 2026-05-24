'use strict';

/**
 * E2E — auth modal sign-in flow.
 *
 * Exercises the real AuthModal as a user would, NOT the API
 * shortcut helper. Verifies:
 *   - The Header's "Sign in" button opens the modal.
 *   - Valid credentials log the candidate in (Header switches
 *     to the signed-in state).
 *   - Invalid credentials surface the FormError alert without
 *     navigating away from the modal.
 *   - The PasswordInput "Show password" toggle flips the field
 *     type so users can confirm what they typed.
 *
 * Keep this spec focused on the modal itself. Role-specific
 * post-login flows live under qa/e2e/candidate/ and
 * qa/e2e/company/ — they short-circuit the modal via the
 * `authenticatePage` helper because re-driving the form per
 * test wastes runtime.
 */

const { test, expect } = require('@playwright/test');
const { qaUser } = require('../../helpers/env');

test.describe('@smoke Auth modal sign-in', () => {
  test('header "Sign in" opens the modal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^sign in$/i }).first().click();
    // The modal toggles `.modal-overlay.open` and renders a form
    // with email + password inputs. Either is enough to prove the
    // modal mounted.
    await expect(page.locator('#auth-modal.modal-overlay.open')).toBeVisible();
    await expect(page.locator('#auth-modal input[type="email"]')).toBeVisible();
    await expect(page.locator('#auth-modal input[type="password"]')).toBeVisible();
  });

  test('invalid credentials surface an inline alert', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^sign in$/i }).first().click();
    await page.locator('#auth-modal input[type="email"]').fill('nobody@example.com');
    await page.locator('#auth-modal input[type="password"]').fill('not-the-password');
    await page.locator('#auth-modal form button[type="submit"]').click();

    // FormError renders with role="alert". Even on a server error
    // the modal stays mounted — we should still see the email
    // field afterwards.
    const alert = page.locator('#auth-modal [role="alert"]').first();
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#auth-modal input[type="email"]')).toBeVisible();
  });

  test('valid candidate credentials sign the user in', async ({ page }) => {
    const user = qaUser('CANDIDATE');
    await page.goto('/');
    await page.getByRole('button', { name: /^sign in$/i }).first().click();
    await page.locator('#auth-modal input[type="email"]').fill(user.email);
    await page.locator('#auth-modal input[type="password"]').fill(user.password);
    await page.locator('#auth-modal form button[type="submit"]').click();

    // Header's signed-in branch renders "Hi, <firstname>" and a
    // "Sign out" button. Either is a stable proof of auth.
    await expect(page.getByRole('button', { name: /^sign out$/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#auth-modal.modal-overlay.open')).toHaveCount(0);
  });

  test('password show/hide toggle flips the input type', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^sign in$/i }).first().click();
    const passwordField = page.locator('#auth-modal input[name="password"], #auth-modal input[type="password"]').first();
    await passwordField.fill('whatever');
    await expect(passwordField).toHaveAttribute('type', 'password');

    // PasswordInput.jsx exposes the toggle with aria-label
    // "Show password" / "Hide password".
    const toggle = page.locator('#auth-modal button[aria-label="Show password"]');
    await toggle.click();
    // After click the type becomes "text" and the aria-label flips.
    await expect(page.locator('#auth-modal input[name="password"], #auth-modal input[type="text"][autocomplete="current-password"]').first())
      .toHaveAttribute('type', 'text');
    await expect(page.locator('#auth-modal button[aria-label="Hide password"]')).toBeVisible();
  });

  test('"Forgot password?" link navigates to the recovery page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^sign in$/i }).first().click();
    await page.locator('#auth-modal').getByRole('link', { name: /forgot password\?/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

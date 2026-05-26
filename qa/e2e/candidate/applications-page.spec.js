'use strict';

/**
 * E2E — candidate /dashboard/candidate/applications page.
 *
 * Three contracts:
 *   1. The page mounts inside the dashboard shell (sidebar +
 *      shell wrapper both visible).
 *   2. The four-card summary row is always rendered (even with
 *      zero applications it displays 0s rather than collapsing).
 *   3. When the QA candidate has any applications, every row
 *      surfaces a status pill via `data-testid="application-status"`
 *      and the data set is scoped to the logged-in candidate —
 *      verified by stubbing the API and asserting the page
 *      renders exactly what the stub returns.
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');

test.describe('@candidate Candidate applications tab', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page, 'CANDIDATE');
  });

  test('renders inside the dashboard shell with the summary row', async ({ page }) => {
    await page.goto('/dashboard/candidate/applications');
    await expect(page.getByTestId('candidate-dashboard-shell')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('candidate-dash-sidebar')).toBeVisible();
    await expect(page.getByTestId('candidate-applications-page')).toBeVisible();
    await expect(page.getByTestId('applications-summary')).toBeVisible();
  });

  test('shows only the candidate-scoped applications returned by the API', async ({ page }) => {
    // Stub the applications list so the assertion below is
    // deterministic regardless of the local DB state. The
    // server-side filter (candidate_user_id = me) is verified by
    // the dedicated API test in qa/api/; this UI test is about
    // wiring the stubbed payload onto cards + badges.
    await page.route('**/api/v1/candidates/applications/list', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          Response: { responseCode: 1, status: 'Success', message: 'OK' },
          Data: {
            records: [
              {
                id: 9001,
                status: 'shortlisted',
                applied_at: new Date().toISOString(),
                job_id: 5101,
                job_title: 'Senior Backend Engineer',
                job_location: 'Karachi',
                is_remote: 0,
                work_mode: 'onsite',
                job_type: 'full_time',
                experience_level: 'senior',
                skills_tags: 'Node.js,MySQL,Redis',
                salary_min: 30000000,
                salary_max: 45000000,
                salary_currency: 'PKR',
                salary_period: 'year',
                application_deadline: null,
                published_at: new Date().toISOString(),
                job_created_at: new Date().toISOString(),
                is_featured: 0,
                company_id: 1,
                company_name: 'QA Test Company',
                company_logo: null,
              },
            ],
            pagination: { page: 1, limit: 50, total: 1 },
          },
        }),
      });
    });

    await page.goto('/dashboard/candidate/applications');
    const grid = page.getByTestId('applications-grid');
    await expect(grid).toBeVisible({ timeout: 15_000 });
    // Exactly one card from the stubbed payload.
    await expect(grid.getByTestId('job-card')).toHaveCount(1);
    await expect(grid.getByTestId('application-status')).toHaveText(/shortlisted/i);
    // Already-applied state means no Apply Now button, ever.
    await expect(grid.getByTestId('apply-now-button')).toHaveCount(0);
  });

  test('empty state renders when the candidate has no applications', async ({ page }) => {
    await page.route('**/api/v1/candidates/applications/list', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          Response: { responseCode: 1, status: 'Success', message: 'OK' },
          Data: { records: [], pagination: { page: 1, limit: 50, total: 0 } },
        }),
      });
    });
    await page.goto('/dashboard/candidate/applications');
    // Summary row still mounts; counts default to 0.
    await expect(page.getByTestId('applications-summary')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/No applications yet/i)).toBeVisible();
  });
});

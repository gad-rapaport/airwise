import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations, openDefault, trackConsole } from './support';

test('loads with provenance, chart, legend and summary and no console errors', async ({ page }) => {
  const errors = trackConsole(page);
  await openDefault(page);
  await expect(
    page.getByRole('status').filter({ hasText: /Live|Offline snapshot|Saved data|Outdated/ }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Fine particles (PM2.5)' })).toBeVisible();
  const legend = page.getByRole('list', { name: 'Locations in the chart' });
  for (const city of ['Tel Aviv-Yafo', 'Jerusalem', 'Haifa', 'Athens'])
    await expect(legend).toContainText(city);
  await expect(page.getByRole('img', { name: /Fine particles \(PM2\.5\) for Tel Aviv-Yafo/ })).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(10);
  await expect(page.getByText(/Licensed CC BY 4\.0/)).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  expect(errors).toEqual([]);
});

test('changing pollutant, window and view updates the data and the URL', async ({ page }) => {
  await openDefault(page);
  await page.getByRole('radio', { name: /^NO₂/ }).check();
  await expect(page.getByRole('heading', { level: 1, name: 'Nitrogen dioxide (NO₂)' })).toBeVisible();
  await expect(page).toHaveURL(/metric=nitrogen_dioxide/);

  await page.getByRole('radio', { name: '7 days' }).check({ force: true });
  await page.getByRole('radio', { name: 'Daily mean' }).check({ force: true });
  await page.getByRole('button', { name: 'Table' }).click();
  await expect(page.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
  const table = page.getByRole('region', { name: 'Data table' }).getByRole('table');
  await expect(table.getByRole('columnheader', { name: 'Athens' })).toBeVisible();
  const rows = await table.locator('tbody tr').count();
  expect(rows).toBeGreaterThanOrEqual(7);
  expect(rows).toBeLessThanOrEqual(12);
  await expect(page).toHaveURL(/hours=168.*resolution=daily.*view=table/);

  // The URL restores the same view.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
});

test('the chart can be read with the keyboard', async ({ page }) => {
  await openDefault(page);
  const chart = page.getByRole('img', { name: /Fine particles/ });
  await chart.focus();
  await page.keyboard.press('End');
  const readout = page.locator('.chart__readout');
  await expect(readout).toContainText('Tel Aviv-Yafo');
  const atEnd = await readout.textContent();
  await page.keyboard.press('ArrowLeft');
  await expect(readout).not.toHaveText(atEnd ?? '');
  await page.keyboard.press('Home');
  await expect(readout).not.toContainText('(forecast)');
});

test('at most four locations can be compared', async ({ page }) => {
  await openDefault(page);
  await expect(page.getByText('4 selected')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Cairo' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Haifa' }).uncheck();
  await page.getByRole('checkbox', { name: 'Cairo' }).check();
  await expect(page.getByRole('list', { name: 'Locations in the chart' })).toContainText('Cairo');
  await page.getByLabel('Region').selectOption('israel');
  await expect(page.getByRole('checkbox', { name: 'Athens' })).toHaveCount(0);
  await expect(page.locator('.card')).toHaveCount(6);
});

test('the status panel explains the cache policy and connection state', async ({ page }) => {
  await openDefault(page);
  await page.getByText('Data source and service status').click();
  await expect(page.getByText(/Fresh for 30 min/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh from provider' })).toBeVisible();
});

test('invalid API input gets a structured 400', async ({ request }) => {
  const res = await request.get('/api/series?locations=atlantis');
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe('VALIDATION_FAILED');
});

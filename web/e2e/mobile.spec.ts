import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations, openDefault, trackConsole } from './support';

test('phone layout shows the chart first and never scrolls sideways', async ({ page }) => {
  const errors = trackConsole(page);
  await openDefault(page);
  const chartBox = await page.locator('.chart__svg').boundingBox();
  const controlsBox = await page.locator('#settings').boundingBox();
  expect(chartBox!.y).toBeLessThan(controlsBox!.y);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('link', { name: 'Change pollutant, window or places' }).click();
  await expect(page.getByRole('radio', { name: /^PM10/ })).toBeInViewport();
  await expectNoSeriousA11yViolations(page);
  expect(errors).toEqual([]);
});

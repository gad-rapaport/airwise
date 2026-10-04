import { expect, test } from '@playwright/test';
import { openDefault } from './support';

// Regenerates README screenshots from the running stack: npm run screenshots
const out = (name: string) => `../docs/screenshots/${name}.png`;

test('capture README screenshots', async ({ page, browser }) => {
  await openDefault(page);
  await page.screenshot({ path: out('overview') });

  await page.goto(
    '/?metric=european_aqi&locations=tel-aviv,jerusalem,athens,cairo&hours=168&resolution=daily&view=chart',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'European Air Quality Index' })).toBeVisible();
  await page.locator('.chart__svg').scrollIntoViewIfNeeded();
  await page.screenshot({ path: out('daily-aqi') });

  await page.goto('/?view=table');
  await page.getByText('Data source and service status').click();
  await page.screenshot({ path: out('table-and-status'), fullPage: true });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await openDefault(phone);
  await phone.screenshot({ path: out('mobile') });
});

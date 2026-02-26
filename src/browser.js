import { chromium } from 'playwright';

export async function browserResearch(url, { headless = true, slowMoMs = 0 } = {}) {
  const browser = await chromium.launch({ headless, slowMo: slowMoMs });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });

  const title = await page.title();
  const text = (await page.locator('body').innerText()).slice(0, 6000);
  const links = await page.locator('a[href]').evaluateAll((els) =>
    [...new Set(els.map((e) => e.href))].slice(0, 200)
  );

  await browser.close();
  return { url, title, text, links };
}

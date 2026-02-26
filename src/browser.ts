import { chromium } from 'playwright';

import type { BrowserConfig, BrowserResearchResult } from './types.js';

export async function browserResearch(
  url: string,
  options: Partial<BrowserConfig> = {}
): Promise<BrowserResearchResult> {
  const browser = await chromium.launch({
    headless: options.headless ?? true,
    slowMo: options.slowMoMs ?? 0
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    const title = await page.title();
    const text = (await page.locator('body').innerText()).slice(0, 6000);
    const links = await page.locator('a[href]').evaluateAll((els) =>
      [...new Set(els.map((e) => (e as HTMLAnchorElement).href))].slice(0, 200)
    );

    return { url, title, text, links };
  } finally {
    await browser.close();
  }
}

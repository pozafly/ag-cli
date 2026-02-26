from __future__ import annotations

from playwright.sync_api import sync_playwright


def browser_research(url: str, headless: bool = True, slow_mo_ms: int = 0) -> dict:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless, slow_mo=slow_mo_ms)
        page = browser.new_page()
        page.goto(url, wait_until="networkidle")
        title = page.title()
        text = page.locator("body").inner_text()[:6000]
        links = page.locator("a[href]").evaluate_all("els => els.map(e => e.href)")
        browser.close()
    return {
        "url": url,
        "title": title,
        "text": text,
        "links": sorted(set(links))[:200],
    }

/**
 * fetch-gear-ratings.js
 *
 * Visits each of this week's gear affiliate links (data/selected-gear.json,
 * written by select-gear-items.js) and pulls the real star rating off the
 * page, so the gear section can show an actual rating instead of the
 * catalog's placeholder value.
 *
 * Why this needs a headless browser instead of a plain HTTP request:
 *   - Amazon blocks simple scrapers outright (amzn.to links returned empty
 *     when fetched directly during testing).
 *   - Arena's product page renders its review widget (Yotpo/Bazaarvoice-style)
 *     with client-side JS, so the rating isn't present in the raw HTML.
 * A rendered browser sees both.
 *
 * Run:
 *   node scripts/fetch-gear-ratings.js
 *
 * Output:
 *   data/gear-ratings.json — one entry per product:
 *     { slug, url, rating (0-5 float or null), reviewCount (int or null) }
 *
 * render-newsletter.js reads this file automatically and overrides the
 * catalog rating for any slug that has a live scraped value.
 *
 * IMPORTANT - selectors need a once-over:
 * Amazon and Arena both change their markup periodically. Every spot marked
 * "ADJUST ME" is worth a quick check against the real page: open the product
 * in your browser, inspect the star rating element, and confirm the
 * selector still matches. If a scrape comes back null, render-newsletter.js
 * just falls back to the catalog's placeholder rating — it won't break the
 * build.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SELECTED_GEAR_PATH = path.join(ROOT, 'data', 'selected-gear.json');
const OUTPUT_JSON = path.join(ROOT, 'data', 'gear-ratings.json');

function detectSite(url) {
  if (/amzn\.to|amazon\./i.test(url)) return 'amazon';
  if (/arenasport\.com/i.test(url)) return 'arena';
  return 'unknown';
}

async function scrapeAmazonRating(page) {
  // ADJUST ME: Amazon's review summary usually lives in an element like
  // <span id="acrPopover" title="4.1 out of 5 stars">, with the review count
  // nearby in <span id="acrCustomerReviewText">12,345 ratings</span>.
  await page.waitForLoadState('networkidle').catch(() => {});

  const rating = await page.evaluate(() => {
    const popover = document.querySelector('#acrPopover, [data-hook="rating-out-of-text"]');
    if (!popover) return null;
    const text = popover.getAttribute('title') || popover.textContent || '';
    const match = text.match(/([\d.]+)\s*out of\s*5/i);
    return match ? parseFloat(match[1]) : null;
  });

  const reviewCount = await page.evaluate(() => {
    const el = document.querySelector('#acrCustomerReviewText, [data-hook="total-review-count"]');
    if (!el) return null;
    const match = el.textContent.replace(/,/g, '').match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  });

  return { rating, reviewCount };
}

async function scrapeArenaRating(page) {
  // ADJUST ME: Arena's product pages typically load a third-party reviews
  // widget (Yotpo or Bazaarvoice) asynchronously.
  await page.waitForTimeout(2000);

  const rating = await page.evaluate(() => {
    const candidates = document.querySelectorAll(
      '.yotpo-star-rating, [data-star-rating], .bv_avgRating, [itemprop="ratingValue"]'
    );
    for (const el of candidates) {
      const text = el.getAttribute('content') || el.textContent || '';
      const match = text.match(/([\d.]+)/);
      if (match) return parseFloat(match[1]);
    }
    return null;
  });

  const reviewCount = await page.evaluate(() => {
    const el = document.querySelector('[itemprop="reviewCount"], .yotpo-reviews-count, .bv_numReviews_component_container');
    if (!el) return null;
    const text = el.getAttribute('content') || el.textContent || '';
    const match = text.replace(/,/g, '').match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  });

  return { rating, reviewCount };
}

async function main() {
  if (!fs.existsSync(SELECTED_GEAR_PATH)) {
    console.error(`Missing ${SELECTED_GEAR_PATH}. Run \`npm run select:gear\` first.`);
    process.exit(1);
  }

  const gearItems = JSON.parse(fs.readFileSync(SELECTED_GEAR_PATH, 'utf8'));
  // NEWSLETTER_CHROMIUM_PATH lets a local run point at a system Chromium
  // instead of downloading Playwright's own build. CI leaves it unset.
  const browser = await chromium.launch({
    executablePath: process.env.NEWSLETTER_CHROMIUM_PATH || undefined,
  });
  const results = [];

  for (const item of gearItems) {
    const site = detectSite(item.url);
    const page = await browser.newPage();
    try {
      await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const { rating, reviewCount } =
        site === 'amazon'
          ? await scrapeAmazonRating(page)
          : site === 'arena'
          ? await scrapeArenaRating(page)
          : { rating: null, reviewCount: null };

      results.push({ slug: item.slug, url: item.url, rating, reviewCount });
      console.log(
        rating
          ? `  - ${item.slug}: ${rating}/5${reviewCount ? ` (${reviewCount} reviews)` : ''}`
          : `  - ${item.slug}: no rating found, keeping catalog placeholder`
      );
    } catch (err) {
      console.warn(`Could not load ${item.url}: ${err.message}`);
      results.push({ slug: item.slug, url: item.url, rating: null, reviewCount: null });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2));
  console.log(`Wrote ${results.length} rating(s) to ${OUTPUT_JSON}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * fetch-blog-posts.js
 *
 * Scrapes the LANE FOUR blog (winlanefour.com/#blog) and picks posts for the
 * weekly newsletter:
 *   - only posts published in the last 7 days
 *   - one post per category, from up to 3 different categories
 *   - never a post that's already been featured in a previous issue
 *   - each post's title, category, date, summary, hero image URL, and permalink
 *
 * The site is a client-rendered single-page app (routes live behind "#"
 * hashes), so a plain HTTP request won't see the rendered post cards or
 * images. This uses a headless browser (Playwright) to actually render the
 * page before reading anything out of it.
 *
 * Run:
 *   node scripts/fetch-blog-posts.js
 *
 * Output:
 *   data/newsletter-blog-picks.json   (structured post data for render-newsletter.js)
 *   public/newsletter-images/*        (downloaded hero images)
 *
 * The selectors below are confirmed against the real markup in this repo's
 * index.html: post cards are `.blog-card` divs that navigate via
 * onclick="navigate('<post-id>')" (there is no <a> tag), category is
 * `.cat-badge`, date/read-time is `.blog-card-date`, the excerpt is
 * `.blog-card-excerpt`, and hero images are painted as an inline
 * background-image on the thumb block by syncBlogMeta() (data-hero="1").
 * If the blog card component in index.html changes shape, update
 * scrapeBlogPosts() to match.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadHistory, usedBlogPosts } = require('./newsletter-dedup');

const ROOT = path.join(__dirname, '..');
// Overridable so the scraper can be pointed at a local copy of the site
// (e.g. NEWSLETTER_SITE_URL=http://localhost:8080 while testing).
const SITE_URL = process.env.NEWSLETTER_SITE_URL || 'https://winlanefour.com';
const BLOG_PATH = '/#blog';
const DAYS_WINDOW = 7;
const POSTS_WANTED = 3;

const OUTPUT_JSON = path.join(ROOT, 'data', 'newsletter-blog-picks.json');
const IMAGE_DIR = path.join(ROOT, 'public', 'newsletter-images');

async function scrapeBlogPosts(page) {
  await page.goto(`${SITE_URL}${BLOG_PATH}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.blog-card', { timeout: 15000 });
  // syncBlogMeta() runs on DOMContentLoaded and rewrites every card's date
  // line and hero image; give it a beat to finish before reading anything.
  await page.waitForTimeout(1000);

  const cards = await page.$$eval('.blog-card', (cards) => {
    return cards.map((card) => {
      // Cards don't contain an <a>; the post id in onclick="navigate('<id>')"
      // doubles as the site's "#<id>" hash route.
      const idMatch = (card.getAttribute('onclick') || '').match(/navigate\('([^']+)'\)/);

      const titleEl = card.querySelector('.blog-card-title');
      const categoryEl = card.querySelector('.cat-badge');
      // After syncBlogMeta() runs, one .blog-card-date span reads
      // "Mon D, YYYY · N min read"; before it runs, the date and read time
      // are separate spans. Split the pieces apart either way.
      const metaText = Array.from(card.querySelectorAll('.blog-card-date'))
        .map((el) => el.textContent.trim())
        .join(' · ');
      const metaParts = metaText.split('·').map((s) => s.trim()).filter(Boolean);
      const dateText = metaParts[0] || null;
      const readTime = metaParts.find((p) => /\bmin\b/.test(p)) || null;
      const summaryEl = card.querySelector('.blog-card-excerpt');

      // Posts with a hero photo get it as an inline background-image on the
      // thumb block (marked data-hero="1"); the rest show an SVG pattern.
      const thumbEl = card.querySelector('.blog-card-thumb-pattern, .blog-card-thumb');
      let imageUrl = null;
      if (thumbEl && thumbEl.dataset.hero === '1') {
        const bgMatch = (thumbEl.style.backgroundImage || '').match(/url\(["']?([^"')]+)["']?\)/);
        if (bgMatch) imageUrl = bgMatch[1];
      }

      return {
        title: titleEl ? titleEl.textContent.trim() : null,
        category: categoryEl ? categoryEl.textContent.trim() : null,
        dateText,
        readTime,
        summary: summaryEl ? summaryEl.textContent.trim() : null,
        imageUrl,
        slug: idMatch ? `#${idMatch[1]}` : null,
      };
    });
  });

  // The same post's card appears on the home page, the blog index, and its
  // category page — keep one copy per post.
  const seen = new Set();
  return cards.filter((card) => {
    if (!card.slug || seen.has(card.slug)) return false;
    seen.add(card.slug);
    return true;
  });
}

function parseDate(dateText) {
  if (!dateText) return null;
  const direct = new Date(dateText);
  if (!isNaN(direct)) return direct;
  const match = dateText.match(/([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/);
  if (match) {
    const parsed = new Date(`${match[1]} ${match[2]}, ${match[3]}`);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

function withinLastNDays(dateText, n) {
  const parsed = parseDate(dateText);
  if (!parsed) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - n);
  return parsed >= cutoff;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickFromDistinctCategories(posts, count) {
  const byCategory = {};
  for (const post of posts) {
    const key = post.category || 'Uncategorized';
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(post);
  }

  const categories = shuffle(Object.keys(byCategory));
  const picks = [];
  for (const category of categories) {
    if (picks.length >= count) break;
    const options = shuffle(byCategory[category]);
    picks.push(options[0]);
  }
  return picks;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function downloadImage(url, destPath) {
  // Image CDNs (e.g. Pexels) 403 requests without a browser-looking UA.
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buffer);
}

function toAbsoluteUrl(maybeRelative) {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, SITE_URL).toString();
  } catch {
    return null;
  }
}

async function main() {
  // NEWSLETTER_CHROMIUM_PATH lets a local run point at a system Chromium
  // instead of downloading Playwright's own build. CI leaves it unset.
  const browser = await chromium.launch({
    executablePath: process.env.NEWSLETTER_CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  let allPosts;
  try {
    allPosts = await scrapeBlogPosts(page);
  } finally {
    await browser.close();
  }

  const withData = allPosts.filter((p) => p.title && p.slug);
  const recentPosts = withData.filter((p) => withinLastNDays(p.dateText, DAYS_WINDOW));

  if (recentPosts.length === 0) {
    console.warn(
      `No posts found published in the last ${DAYS_WINDOW} days. ` +
      `Either nothing new went up this week, or the selectors in this ` +
      `script need adjusting to match the site's real markup.`
    );
  }

  // Never repeat a post that's already run in a previous issue.
  const history = loadHistory();
  const alreadyUsed = usedBlogPosts(history);
  const eligiblePosts = recentPosts.filter((p) => {
    const permalink = p.slug.startsWith('#') ? `${SITE_URL}/${p.slug}` : toAbsoluteUrl(p.slug);
    return permalink && !alreadyUsed.has(permalink.trim().toLowerCase());
  });

  const skippedAsRepeats = recentPosts.length - eligiblePosts.length;
  if (skippedAsRepeats > 0) {
    console.log(`Skipped ${skippedAsRepeats} post(s) already featured in a previous issue.`);
  }

  const picks = pickFromDistinctCategories(eligiblePosts, POSTS_WANTED);

  if (picks.length < POSTS_WANTED) {
    console.warn(
      `Only found ${picks.length} unused, on-topic post(s) for this week (needed ${POSTS_WANTED}). ` +
      `Do not fall back to reusing an older post — publish fewer posts this week instead, ` +
      `or wait for new content.`
    );
  }

  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const enriched = [];
  for (const post of picks) {
    const permalink = post.slug.startsWith('#') ? `${SITE_URL}/${post.slug}` : toAbsoluteUrl(post.slug);
    const absoluteImageUrl = toAbsoluteUrl(post.imageUrl);
    let localImagePath = null;

    if (absoluteImageUrl) {
      const ext = path.extname(new URL(absoluteImageUrl).pathname) || '.jpg';
      const filename = `${slugify(post.title)}${ext}`;
      const dest = path.join(IMAGE_DIR, filename);
      try {
        await downloadImage(absoluteImageUrl, dest);
        localImagePath = `/newsletter-images/${filename}`;
      } catch (err) {
        console.warn(`Could not download image for "${post.title}": ${err.message}`);
      }
    }

    enriched.push({
      title: post.title,
      category: post.category,
      date: post.dateText,
      readTime: post.readTime,
      summary: post.summary,
      imageUrl: absoluteImageUrl,
      localImagePath,
      url: permalink,
    });
  }

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(enriched, null, 2));
  console.log(`Wrote ${enriched.length} post(s) to ${OUTPUT_JSON}`);
  enriched.forEach((p) => console.log(`  - [${p.category}] ${p.title} -> ${p.url}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

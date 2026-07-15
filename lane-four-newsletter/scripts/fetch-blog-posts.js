/**
 * fetch-blog-posts.js
 *
 * Picks this week's blog posts for the newsletter straight from the site's own
 * structured post data (the `const BLOG_POSTS = [...]` array in index.html),
 * read via scripts/site-source.js. This replaces the old headless-browser DOM
 * scrape: the data is already structured (real ISO dates, real hero images),
 * so there's no brittle selector matching and no Playwright.
 *
 * Rules (unchanged):
 *   - only posts published in the last 7 days
 *   - one post per category, from up to 3 different categories
 *   - never a post that's already been featured in a previous issue
 *
 * Run:
 *   node scripts/fetch-blog-posts.js
 *
 * Output:
 *   data/newsletter-blog-picks.json   (structured post data for render-newsletter.js)
 *   public/newsletter-images/*        (downloaded hero images for external hosts)
 */

const fs = require('fs');
const path = require('path');
const { loadHistory, usedBlogPosts } = require('./newsletter-dedup');
const { getBlogPosts, PUBLIC_BASE } = require('./site-source');

const ROOT = path.join(__dirname, '..');
const DAYS_WINDOW = 7;
const POSTS_WANTED = 3;

const OUTPUT_JSON = path.join(ROOT, 'data', 'newsletter-blog-picks.json');
const IMAGE_DIR = path.join(ROOT, 'public', 'newsletter-images');

function withinLastNDays(dateStr, n) {
  if (!dateStr) return false;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsed = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateStr);
  if (isNaN(parsed)) return false;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - n);
  return parsed >= cutoff;
}

// Reduce a permalink to its post id so dedup matches whether history stored the
// old fragment form (…/#swim-snorkel) or the current path form (…/swim-snorkel).
function postKey(url) {
  const m = String(url || '').match(/[#/]([^#/?]+)\/?$/);
  return (m ? m[1] : String(url || '')).trim().toLowerCase();
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
    (byCategory[key] = byCategory[key] || []).push(post);
  }
  const picks = [];
  for (const category of shuffle(Object.keys(byCategory))) {
    if (picks.length >= count) break;
    picks.push(shuffle(byCategory[category])[0]);
  }
  return picks;
}

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

async function main() {
  const allPosts = await getBlogPosts();
  const recentPosts = allPosts.filter((p) => withinLastNDays(p.date, DAYS_WINDOW));

  if (recentPosts.length === 0) {
    console.warn(
      `No posts published in the last ${DAYS_WINDOW} days. Either nothing new ` +
      `went up this week, or BLOG_POSTS dates in index.html need a look.`
    );
  }

  // Never repeat a post that's already run in a previous issue.
  const alreadyUsed = new Set([...usedBlogPosts(loadHistory())].map(postKey));
  const eligiblePosts = recentPosts.filter((p) => !alreadyUsed.has(postKey(p.url)));

  const skipped = recentPosts.length - eligiblePosts.length;
  if (skipped > 0) console.log(`Skipped ${skipped} post(s) already featured in a previous issue.`);

  const picks = pickFromDistinctCategories(eligiblePosts, POSTS_WANTED);
  if (picks.length < POSTS_WANTED) {
    console.warn(
      `Only found ${picks.length} unused, on-topic post(s) for this week (needed ${POSTS_WANTED}). ` +
      `Publish fewer posts this week rather than reusing an older one.`
    );
  }

  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const enriched = [];
  for (const post of picks) {
    let localImagePath = null;
    // Site-hosted images already live on winlanefour.com, so reference them
    // directly; only rehost external hero images (e.g. Pexels) under
    // /newsletter-images so the email isn't hotlinking a third party.
    const isExternal = post.heroImage && !post.heroImage.startsWith(PUBLIC_BASE);
    if (isExternal) {
      try {
        const ext = path.extname(new URL(post.heroImage).pathname) || '.jpg';
        const filename = `${slugify(post.title)}${ext}`;
        await downloadImage(post.heroImage, path.join(IMAGE_DIR, filename));
        localImagePath = `/newsletter-images/${filename}`;
      } catch (err) {
        console.warn(`Could not download image for "${post.title}": ${err.message}`);
      }
    }

    enriched.push({
      title: post.title,
      category: post.category,
      date: post.date,
      readTime: post.readTime,
      summary: post.excerpt,
      imageUrl: post.heroImage,
      localImagePath,
      url: post.url,
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

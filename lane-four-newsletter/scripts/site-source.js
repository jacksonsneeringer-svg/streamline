/**
 * site-source.js
 *
 * Single source of truth for reading the LANE FOUR website's own content into
 * the newsletter pipeline. Both the blog picks and the gear picks now come
 * straight from the site instead of a headless-browser scrape or a hand-kept
 * catalog:
 *
 *   getBlogPosts()    - the site's structured BLOG_POSTS data (inline JS in
 *                       index.html): id, title, category, date, readTime,
 *                       heroImage, excerpt. Reliable ISO dates, real photos.
 *   getGearProducts() - every product reviewed in a gear blog article (the
 *                       static `.product-pick` blocks): name, photo, the
 *                       "Our take" review, and a deep link to that exact
 *                       product's position in the article.
 *
 * Where the HTML comes from:
 *   - By default we read the repo's own index.html (the file that IS the
 *     deployed site), so the pipeline never depends on a live scrape and the
 *     gear anchors are always in sync with what we render.
 *   - Set NEWSLETTER_SITE_URL (e.g. http://localhost:8080 or
 *     https://winlanefour.com) to read a served copy instead.
 *
 * Output URLs (image src, blog permalinks, gear deep links) are always built
 * from PUBLIC_BASE so the email points at the real site even when we read the
 * HTML from a local file or a localhost server.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPO_INDEX = path.join(ROOT, '..', 'index.html');
// Base for every URL that ends up in the email. Defaults to the live site;
// NEWSLETTER_SITE_URL overrides it for local previews.
const PUBLIC_BASE = (process.env.NEWSLETTER_SITE_URL || 'https://winlanefour.com').replace(/\/+$/, '');
const UA = 'lane-four-newsletter/1.0 (+https://winlanefour.com)';

let _htmlCache = null;

async function getIndexHtml() {
  if (_htmlCache != null) return _htmlCache;
  if (process.env.NEWSLETTER_SITE_URL) {
    const res = await fetch(`${PUBLIC_BASE}/`, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${PUBLIC_BASE}/`);
    _htmlCache = await res.text();
  } else {
    _htmlCache = fs.readFileSync(REPO_INDEX, 'utf8');
  }
  return _htmlCache;
}

function publicUrl(maybeRelative) {
  if (!maybeRelative) return '';
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return `${PUBLIC_BASE}/${String(maybeRelative).replace(/^\/+/, '')}`;
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ---- Blog posts (from the inline `const BLOG_POSTS = [ ... ];` literal) ----

// Walk from the opening '[' to its matching ']', respecting string literals so
// SVG paths or prose containing brackets don't end the array early.
function extractArrayLiteral(html, marker) {
  const at = html.indexOf(marker);
  if (at === -1) throw new Error(`Could not find "${marker}" in the site HTML.`);
  let i = html.indexOf('[', at);
  if (i === -1) throw new Error(`Malformed ${marker}: no opening bracket.`);
  const start = i;
  let depth = 0;
  let quote = null;
  for (; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Malformed ${marker}: unterminated array.`);
}

async function getBlogPosts() {
  const html = await getIndexHtml();
  const literal = extractArrayLiteral(html, 'const BLOG_POSTS');
  let posts;
  try {
    // The literal is our own first-party JS (unquoted keys, single quotes), so
    // JSON.parse won't take it; evaluate it as the array literal it is.
    posts = new Function(`return (${literal});`)();
  } catch (err) {
    throw new Error(`Failed to parse BLOG_POSTS from the site HTML: ${err.message}`);
  }
  return posts.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category || null,
    date: p.date || null,
    readTime: p.readTime ? `${p.readTime} min read` : null,
    excerpt: p.excerpt || '',
    heroImage: p.heroImage ? publicUrl(p.heroImage) : null,
    heroAlt: p.heroAlt || p.title,
    // Path-based permalink, matching the site's router (/best-swim-snorkels).
    url: `${PUBLIC_BASE}/${p.id}`,
  }));
}

// ---- Gear products (from static `.product-pick` blocks in gear articles) ----

function condenseReview(quoteHtml) {
  let text = stripTags(quoteHtml).replace(/^Our take:\s*/i, '').trim();
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length) {
    text = sentences.slice(0, 2).map((s) => s.trim()).join(' ').trim();
  }
  if (text.length > 240) {
    const cut = text.slice(0, 240);
    text = cut.slice(0, cut.lastIndexOf(' ')).trim() + '…';
  }
  return text;
}

async function getGearProducts() {
  const html = await getIndexHtml();

  // Where each SPA "page" starts, so a product-pick can be tied to its article.
  const pages = [];
  const pageRe = /<div class="page" id="page-([a-z0-9-]+)"/g;
  let pm;
  while ((pm = pageRe.exec(html)) !== null) {
    pages.push({ id: pm[1], index: pm.index });
  }
  const pageIdAt = (index) => {
    let found = null;
    for (const p of pages) {
      if (p.index <= index) found = p.id;
      else break;
    }
    return found;
  };

  const products = [];
  const pickRe = /<div class="product-pick"([^>]*)>/g;
  let match;
  while ((match = pickRe.exec(html)) !== null) {
    const attrs = match[1] || '';
    const start = match.index;
    // Slice to the next product-pick or the end of this article so the inner
    // regexes stay scoped to this one product.
    const rest = html.slice(start + match[0].length);
    const nextPick = rest.indexOf('<div class="product-pick"');
    const endArticle = rest.indexOf('</article>');
    let end = rest.length;
    if (nextPick !== -1) end = Math.min(end, nextPick);
    if (endArticle !== -1) end = Math.min(end, endArticle);
    const block = rest.slice(0, end);

    const imgMatch = block.match(/<img[^>]*\bsrc="([^"]+)"[^>]*\balt="([^"]*)"/i);
    if (!imgMatch) continue; // not a real product card
    const imageUrl = publicUrl(imgMatch[1]);
    const name = stripTags(imgMatch[2]);

    const quoteMatch = block.match(/<p class="product-pick-quote">([\s\S]*?)<\/p>/i);
    const description = quoteMatch ? condenseReview(quoteMatch[1]) : '';

    const idMatch = attrs.match(/\bid="([^"]+)"/);
    const anchor = idMatch ? idMatch[1] : null;
    const slug = anchor ? anchor.replace(/^pick-/, '') : slugify(name);
    const pageId = pageIdAt(start);

    // Deep link straight to this product's anchor in the article. If the
    // anchor id hasn't been added to the page yet, degrade to the article top
    // rather than emit a broken fragment.
    const url = pageId
      ? `${PUBLIC_BASE}/${pageId}${anchor ? `#${anchor}` : ''}`
      : '';

    if (!name || !url) continue;
    products.push({ slug, name, url, imageUrl, description });
  }
  return products;
}

module.exports = { getBlogPosts, getGearProducts, PUBLIC_BASE, publicUrl, slugify, stripTags };

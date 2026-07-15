/**
 * select-gear-items.js
 *
 * Picks this week's gear straight from the site's own gear blog articles (the
 * `.product-pick` blocks in index.html), read via scripts/site-source.js. Each
 * product already has a photo, a title, and a written review on the site, so
 * the newsletter just condenses that review into a sentence or two (done in
 * site-source.getGearProducts) and links the reader to the exact spot in the
 * article where that product is covered.
 *
 * Gear MAY repeat week to week now — there's no catalog to exhaust and no
 * no-repeat rule. We simply shuffle the products the site currently reviews and
 * take ITEMS_NEEDED of them.
 *
 * Email links point at the article anchor on winlanefour.com, never at an
 * Amazon/affiliate URL (the Associates agreement bars affiliate links in
 * email), so the on-site "Check price" links stay on the site where they
 * belong. A guard below enforces that.
 *
 * Run:
 *   node scripts/select-gear-items.js
 *
 * Output:
 *   data/selected-gear.json — { slug, name, url, imageUrl, description }[]
 */

const fs = require('fs');
const path = require('path');
const { getGearProducts, PUBLIC_BASE } = require('./site-source');

const ROOT = path.join(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'data', 'selected-gear.json');
const ITEMS_NEEDED = 4;

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function main() {
  const products = await getGearProducts();

  if (products.length === 0) {
    console.error(
      'No gear products found on the site. Expected `.product-pick` blocks in a ' +
      'gear blog article in index.html — add a gear roundup (or check the markup).'
    );
    process.exit(1);
  }

  // Affiliate links must never reach email; every pick links to its article
  // anchor on the site instead. Hard-stop if anything else slipped through.
  const offSite = products.filter((p) => !p.url.startsWith(PUBLIC_BASE) || /amzn\.to|[?&]tag=/i.test(p.url));
  if (offSite.length) {
    console.error(
      `Refusing gear whose link is not an on-site article anchor:\n` +
      offSite.map((p) => `  - ${p.name}: ${p.url}`).join('\n')
    );
    process.exit(1);
  }

  const selected = shuffle(products)
    .slice(0, ITEMS_NEEDED)
    .map((p) => ({ slug: p.slug, name: p.name, url: p.url, imageUrl: p.imageUrl, description: p.description }));

  if (selected.length < ITEMS_NEEDED) {
    console.warn(
      `Only ${selected.length} gear product(s) available on the site (wanted ${ITEMS_NEEDED}). ` +
      `Add more products to a gear blog article for a fuller section.`
    );
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(selected, null, 2));
  console.log(`Selected ${selected.length} gear item(s) for this week:`);
  selected.forEach((item) => console.log(`  - ${item.name} -> ${item.url}`));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

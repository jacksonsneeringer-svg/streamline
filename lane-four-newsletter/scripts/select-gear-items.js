/**
 * select-gear-items.js
 *
 * Picks this week's gear items from data/gear-catalog.json, EXCLUDING any
 * slug that has already appeared in a previous issue (per
 * data/newsletter-history.json). This is what makes "gear drops must be
 * different every week" an enforced rule instead of a hope.
 *
 * IMPORTANT — this only works if the catalog has enough unused items in it.
 * If the catalog doesn't have at least ITEMS_NEEDED unused entries, this
 * script deliberately fails instead of silently reusing something — add more
 * real products (with real affiliate links and a real description) to
 * data/gear-catalog.json before running this again.
 *
 * Each catalog entry needs: slug, name, url, imageUrl, and description.
 * No ratings: we have no lawful source for third-party star ratings, and an
 * invented one is a fabricated consumer rating under the FTC's reviews rule.
 *
 * Catalog URL rules (legal, not stylistic):
 *   - NEVER an Amazon Associates "Special Link" (amzn.to or any ?tag= URL):
 *     the newsletter is email, and the Associates Operating Agreement
 *     prohibits affiliate links in email. Untagged amazon.com links are fine.
 *   - Image URLs must point at assets we host or are licensed to use — no
 *     hotlinking manufacturer CDNs.
 *
 * Run:
 *   node scripts/select-gear-items.js
 *
 * Output:
 *   data/selected-gear.json — the gear items chosen for this week, in the
 *   shape render-newsletter.js expects.
 */

const fs = require('fs');
const path = require('path');
const { loadHistory, usedGearItems } = require('./newsletter-dedup');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'data', 'gear-catalog.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'selected-gear.json');
const ITEMS_NEEDED = 4;

function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`Missing ${CATALOG_PATH}. Create a catalog of candidate gear items first.`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const history = loadHistory();
  const used = usedGearItems(history);

  const available = catalog.filter((item) => !used.has(item.slug.trim().toLowerCase()));

  if (available.length < ITEMS_NEEDED) {
    console.error(
      `Only ${available.length} unused gear item(s) left in the catalog, but this week needs ${ITEMS_NEEDED}.\n` +
      `Every other item in data/gear-catalog.json has already been featured in a previous issue.\n` +
      `Add ${ITEMS_NEEDED - available.length} or more new product(s) (with real affiliate links) to ` +
      `data/gear-catalog.json before running this again. Refusing to reuse old gear items.`
    );
    process.exit(1);
  }

  // Pick ITEMS_NEEDED at random from what's available, so the rotation
  // doesn't always drain the catalog in the same fixed order. The first item
  // in the output array becomes the featured "Gear of the Week" hero card;
  // the rest render as compact rows.
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, ITEMS_NEEDED).map((item) => ({
    slug: item.slug,
    name: item.name,
    url: item.url,
    imageUrl: item.imageUrl,
    description: item.description,
  }));

  // Hard stop if an Amazon affiliate link sneaks back into the catalog: the
  // Associates Operating Agreement prohibits Special Links in email.
  const affiliate = selected.filter((i) => /amzn\.to|[?&]tag=/i.test(i.url));
  if (affiliate.length) {
    console.error(
      `Refusing to select Amazon affiliate link(s) for an email:\n` +
      affiliate.map((i) => `  - ${i.slug}: ${i.url}`).join('\n') +
      `\nUse an untagged product/brand URL in data/gear-catalog.json instead.`
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(selected, null, 2));
  console.log(`Selected ${selected.length} gear item(s) for this week:`);
  selected.forEach((item) => console.log(`  - ${item.name} (${item.slug})`));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main();

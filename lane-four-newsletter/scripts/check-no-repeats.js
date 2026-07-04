/**
 * check-no-repeats.js
 *
 * The hard gate for the weekly newsletter. Run this AFTER you've drafted a
 * week's content (athlete of the week, "in the water this week" topics,
 * blog posts, gear, calendar events) and BEFORE rendering/sending it.
 *
 * Rules enforced:
 *   - Athlete of the Week: must never repeat a name from a past issue.
 *   - In the Water This Week: none of the topic slugs may repeat.
 *   - Blog posts: none of the picked posts may repeat.
 *   - Gear: none of the picked gear slugs may repeat.
 *   - Calendar events: MAY repeat an event from a past issue, but only if
 *     that event's date has not already passed. An event whose date is in
 *     the past must be swapped for something new before this will pass.
 *
 * If everything checks out, this script appends the draft to
 * data/newsletter-history.json so next week's run knows about it too, and
 * exits 0. If anything is wrong, it prints exactly what's wrong and exits 1
 * without touching history — nothing gets recorded until it actually clears
 * every check.
 *
 * select-gear-items.js and fetch-blog-posts.js already filter out
 * previously-used gear/posts on their own, so in normal operation this
 * script should always pass on those two categories. It still checks them
 * directly here so a manually-edited draft (e.g., an editor hand-picking the
 * athlete or "in the water" topics) can't slip a repeat through.
 *
 * Draft shape expected at data/draft-issue.json - see
 * data/draft-issue.example.json for the full shape used by render-newsletter.js.
 * Only these fields matter for this check:
 * {
 *   "date": "2026-07-08",
 *   "athleteOfWeek": "Name",           // draft.athlete.name is used if this is absent
 *   "inTheWaterTopics": ["slug1", ...],// topic slugs, one per news item
 *   "blogPosts": ["url1", ...],        // filled in from newsletter-blog-picks.json if absent
 *   "gearItems": ["slug1", ...],       // filled in from selected-gear.json if absent
 *   "events": [{ "name": "...", "date": "YYYY-MM-DD" }, ...]
 * }
 *
 * Run:
 *   node scripts/check-no-repeats.js
 */

const fs = require('fs');
const path = require('path');
const {
  loadHistory,
  saveHistory,
  assertNoRepeats,
  isEventStillValid,
  recordIssue,
} = require('./newsletter-dedup');

const ROOT = path.join(__dirname, '..');
const DRAFT_PATH = path.join(ROOT, 'data', 'draft-issue.json');
const GEAR_PATH = path.join(ROOT, 'data', 'selected-gear.json');
const BLOG_PATH = path.join(ROOT, 'data', 'newsletter-blog-picks.json');

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
}

function main() {
  if (!fs.existsSync(DRAFT_PATH)) {
    console.error(
      `Missing ${DRAFT_PATH}. Create it with this week's draft content ` +
      `(see data/draft-issue.example.json) before running this check.`
    );
    process.exit(1);
  }

  const draft = JSON.parse(fs.readFileSync(DRAFT_PATH, 'utf8'));
  const history = loadHistory();

  // gearItems/blogPosts are normally already-filtered by select-gear-items.js
  // and fetch-blog-posts.js, but pull them in here too so the check is
  // authoritative even if the draft was hand-edited afterward.
  const gearSelection = readJsonIfExists(GEAR_PATH) || [];
  const blogSelection = readJsonIfExists(BLOG_PATH) || [];

  const athleteOfWeek = draft.athleteOfWeek || (draft.athlete && draft.athlete.name);
  const inTheWaterTopics =
    draft.inTheWaterTopics || (draft.newsItems || []).map((item) => item.topicSlug).filter(Boolean);
  const gearItems = draft.gearItems || gearSelection.map((item) => item.slug);
  const blogPosts = draft.blogPosts || blogSelection.map((post) => post.url);

  try {
    assertNoRepeats(history, {
      athleteOfWeek,
      inTheWaterTopics,
      blogPosts,
      gearItems,
    });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // Events are allowed to repeat, but only while their date is still ahead
  // of us. Anything already in the past must be replaced before this passes.
  const today = draft.date ? new Date(draft.date) : new Date();
  const staleEvents = (draft.events || []).filter((e) => !isEventStillValid(e, today));

  if (staleEvents.length > 0) {
    console.error(
      `The following calendar event(s) have already passed and cannot be reused:\n` +
      staleEvents.map((e) => `  - ${e.name} (${e.date})`).join('\n') +
      `\nReplace with an upcoming event before this will pass.`
    );
    process.exit(1);
  }

  // Everything checks out. Lock this issue into history so future weeks
  // can't repeat any of it.
  recordIssue(history, {
    date: draft.date,
    athleteOfWeek,
    inTheWaterTopics,
    blogPosts,
    gearItems,
    events: draft.events,
  });
  saveHistory(history);

  console.log('All checks passed. No repeated content. History updated — this issue is now on record.');
}

main();

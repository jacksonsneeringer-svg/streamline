/**
 * compose-draft.js
 *
 * Generates this week's editorial content (data/draft-issue.json) with zero
 * human input, replacing the old hand-authored weekly draft. It gathers the
 * ground truth locally, asks the streamline-newsletter-compose Lambda (which
 * runs Claude on Bedrock, same as the site's daily set generator) to write
 * the copy, hard-validates the result, and writes the draft the rest of the
 * pipeline already consumes.
 *
 * What comes from where:
 *   - "In the Water" news:   SwimSwam RSS via the Lambda (real stories only)
 *   - Athlete of the Week:   Claude candidates, verified against Wikipedia
 *   - Today's workout blurb: the daily sets/dryland already in DynamoDB
 *   - Calendar events:       data/events-catalog.json (below) — never invented
 *   - No-repeat guarantees:  usedAthletes/usedTopics from newsletter-history.json
 *
 * Run (needs AWS credentials with lambda:InvokeFunction):
 *   node scripts/compose-draft.js [YYYY-MM-DD]
 *
 * Output: data/draft-issue.json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HISTORY_PATH = path.join(ROOT, 'data', 'newsletter-history.json');
const EVENTS_PATH = path.join(ROOT, 'data', 'events-catalog.json');
const DRAFT_PATH = path.join(ROOT, 'data', 'draft-issue.json');
const COMPOSE_FUNCTION = process.env.NEWSLETTER_COMPOSE_FUNCTION || 'streamline-newsletter-compose';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Turn a catalog entry into the shape renderEventRow() needs, deriving the
// date chip and a Google Calendar link so the catalog stays minimal.
function toDraftEvent(entry) {
  const start = new Date(`${entry.date}T12:00:00`);
  const end = entry.endDate ? new Date(`${entry.endDate}T12:00:00`) : start;
  const displayDay =
    entry.endDate && entry.endDate !== entry.date
      ? `${start.getDate()}-${end.getDate()}`
      : String(start.getDate());
  const compact = (d) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  // Google's all-day format uses an exclusive end date.
  const endExclusive = new Date(end);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const calendarUrl =
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(entry.name)}` +
    `&dates=${compact(start)}/${compact(endExclusive)}` +
    (entry.url ? `&details=${encodeURIComponent(entry.url)}` : '') +
    (entry.location ? `&location=${encodeURIComponent(entry.location)}` : '');
  return {
    name: entry.name,
    date: entry.date,
    displayMonth: MONTHS[start.getMonth()],
    displayDay,
    location: entry.location || '',
    calendarUrl,
  };
}

function invokeLambda(functionName, payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-four-'));
  const payloadPath = path.join(dir, 'payload.json');
  const outPath = path.join(dir, 'out.json');
  fs.writeFileSync(payloadPath, JSON.stringify(payload));
  execFileSync(
    'aws',
    [
      'lambda', 'invoke',
      '--function-name', functionName,
      '--cli-binary-format', 'raw-in-base64-out',
      '--payload', `file://${payloadPath}`,
      outPath,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );
  const result = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  if (result && result.errorMessage) {
    throw new Error(`${functionName} failed: ${result.errorMessage}`);
  }
  return result;
}

function validateDraft(draft) {
  const problems = [];
  if (!draft || typeof draft !== 'object') problems.push('draft is not an object');
  if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) problems.push('missing/invalid date');
  if (!draft.subject) problems.push('missing subject');
  if (!draft.heroHeading) problems.push('missing heroHeading');
  if (!draft.workout || !draft.workout.swimSet || !draft.workout.lift) problems.push('missing workout blurbs');
  const items = draft.newsItems || [];
  if (items.length < 3) problems.push(`only ${items.length} news items`);
  for (const item of items) {
    if (!item.topicSlug || !item.title || !item.body) problems.push('news item missing fields');
    // Every news item summarizes someone else's reporting; the source URL is
    // what lets the renderer credit and link the original story. An item
    // without one would ship an uncredited summary, so it hard-fails here.
    if (!item.url || !/^https?:\/\//.test(item.url)) problems.push(`news item [${item.topicSlug}] missing source url`);
  }
  if (!draft.athlete || !draft.athlete.name || !draft.athlete.bio) problems.push('missing athlete');
  if (problems.length) {
    throw new Error(`Composed draft failed validation:\n  - ${problems.join('\n  - ')}`);
  }
}

function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const history = readJson(HISTORY_PATH, { issues: [] });

  const usedAthletes = history.issues.map((i) => i.athleteOfWeek).filter(Boolean);
  const usedTopics = history.issues.flatMap((i) => i.inTheWaterTopics || []);

  const catalog = readJson(EVENTS_PATH, { events: [] });
  const events = (catalog.events || [])
    .filter((e) => e.date >= date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2)
    .map(toDraftEvent);
  if (events.length === 0) {
    console.warn(
      'Warning: no upcoming events left in data/events-catalog.json — the calendar section will be empty this week. Add new meets to the catalog.'
    );
  }

  console.log(`Composing issue for ${date} (${usedAthletes.length} athletes and ${usedTopics.length} topics already used)...`);
  const result = invokeLambda(COMPOSE_FUNCTION, { date, usedAthletes, usedTopics, events });
  const draft = result && result.draft;
  validateDraft(draft);

  fs.writeFileSync(DRAFT_PATH, JSON.stringify(draft, null, 2));
  console.log(`Wrote ${DRAFT_PATH}`);
  console.log(`  subject: ${draft.subject}`);
  console.log(`  athlete: ${draft.athlete.name}${draft.athlete.photoUrl ? '' : ' (no photo found)'}`);
  draft.newsItems.forEach((i) => console.log(`  news: [${i.topicSlug}] ${i.title}`));
}

main();

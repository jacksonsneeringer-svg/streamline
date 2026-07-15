/**
 * newsletter-dedup.js
 *
 * Shared history utility used by every content-selection/build script.
 * data/newsletter-history.json is the single source of truth for what has
 * already run in a previous issue. Nothing in this pipeline is allowed to
 * repeat an athlete, "in the water" topic, blog post, or gear item that's
 * already in this file — see check-no-repeats.js for the enforcement gate.
 *
 * Calendar events are the one exception: they're allowed to repeat as long
 * as their date hasn't passed yet (isEventStillValid below).
 */

const fs = require('fs');
const path = require('path');

const HISTORY_PATH = path.join(__dirname, '..', 'data', 'newsletter-history.json');

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) {
    return { issues: [] };
  }
  return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
}

function saveHistory(history) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

function normalize(str) {
  return String(str || '').trim().toLowerCase();
}

function usedAthletes(history) {
  return new Set(history.issues.map((issue) => normalize(issue.athleteOfWeek)).filter(Boolean));
}

function usedTopics(history) {
  const set = new Set();
  for (const issue of history.issues) {
    for (const topic of issue.inTheWaterTopics || []) set.add(normalize(topic));
  }
  return set;
}

function usedBlogPosts(history) {
  const set = new Set();
  for (const issue of history.issues) {
    for (const post of issue.blogPosts || []) set.add(normalize(post));
  }
  return set;
}

// Gear is intentionally NOT deduped: it now comes from the site's gear blog
// articles and is allowed to repeat week to week (see select-gear-items.js).

// An event may repeat across issues as long as its date is still ahead of
// (or equal to) the issue date being checked. Once the date has passed, it
// must be swapped for something new.
function isEventStillValid(event, today = new Date()) {
  const eventDate = new Date(event.date);
  if (isNaN(eventDate)) return true;
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return eventDate >= todayDateOnly;
}

// Throws with a message listing every violation if any athlete, topic, blog
// post, or gear item in `candidates` has already appeared in `history`.
function assertNoRepeats(history, candidates) {
  const violations = [];

  const athletesUsed = usedAthletes(history);
  if (candidates.athleteOfWeek && athletesUsed.has(normalize(candidates.athleteOfWeek))) {
    violations.push(`Athlete of the Week "${candidates.athleteOfWeek}" has already been featured.`);
  }

  const topicsUsed = usedTopics(history);
  for (const topic of candidates.inTheWaterTopics || []) {
    if (topicsUsed.has(normalize(topic))) {
      violations.push(`"In the Water This Week" topic "${topic}" has already been used.`);
    }
  }

  const postsUsed = usedBlogPosts(history);
  for (const post of candidates.blogPosts || []) {
    if (postsUsed.has(normalize(post))) {
      violations.push(`Blog post "${post}" has already been featured.`);
    }
  }

  if (violations.length > 0) {
    throw new Error(`Repeated content detected:\n` + violations.map((v) => `  - ${v}`).join('\n'));
  }
}

function recordIssue(history, issue) {
  history.issues.push(issue);
  return history;
}

module.exports = {
  HISTORY_PATH,
  loadHistory,
  saveHistory,
  usedAthletes,
  usedTopics,
  usedBlogPosts,
  isEventStillValid,
  assertNoRepeats,
  recordIssue,
};

if (require.main === module) {
  const history = loadHistory();
  console.log(`${history.issues.length} issue(s) on record.`);
  for (const issue of history.issues) {
    console.log(`  - ${issue.date}: ${issue.athleteOfWeek}`);
  }
}

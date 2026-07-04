# LANE FOUR Weekly Newsletter

Code that generates the weekly LANE FOUR newsletter: pulls fresh blog posts and
rotates gear automatically, enforces that nothing repeats week to week, and
renders the final HTML from `data/draft-issue.json`.

## Where this lives in the repo

This folder is the newsletter pipeline inside the `winlanefour.com` website
repo. The Monday automation lives at the repo root in
`.github/workflows/weekly-newsletter.yml` (GitHub only runs workflows from
the root `.github/workflows/`); it `cd`s into this folder for every step.

The site deploy (`.github/workflows/deploy.yml`) excludes this folder from
the website S3 sync but publishes the two outputs readers actually touch:
`public/newsletter-images/` goes live at `winlanefour.com/newsletter-images/`
(rendered issues reference their hero images there) and `issues/` at
`winlanefour.com/issues/`.

To run the pipeline locally:

```
cd lane-four-newsletter
npm install
npx playwright install chromium
npm run weekly
```

Two optional env vars help local runs: `NEWSLETTER_SITE_URL` points the blog
scraper at a local copy of the site (e.g. `http://localhost:8080` while
serving the repo root with `python3 -m http.server 8080`), and
`NEWSLETTER_CHROMIUM_PATH` points Playwright at a system Chromium instead of
downloading one.

## The one thing that stays manual

Blog posts and gear are fully automated (see "How the pieces fit together"
below). Athlete of the Week, "In the Water This Week" news, today's workout
blurb, and calendar events are not scrapeable — they need a person to write
them. Every week, before Monday:

1. Copy `data/draft-issue.example.json` to `data/draft-issue.json` (or just
   edit the existing one from last week).
2. Fill in that week's athlete, news items, workout blurb, and events.
3. Commit and push `data/draft-issue.json` to `main`.

If it's not there when the Monday workflow runs, the workflow fails loudly
with a message telling you exactly that, instead of silently reusing last
week's content.

## How the pieces fit together

```
npm run weekly
  ├─ fetch:blog          scripts/fetch-blog-posts.js
  │                      scrapes winlanefour.com/#blog, picks up to 3 posts
  │                      from the last 7 days (one per category), skipping
  │                      anything already featured before
  │                      → data/newsletter-blog-picks.json
  │
  ├─ select:gear         scripts/select-gear-items.js
  │                      picks 4 items from data/gear-catalog.json that
  │                      haven't been featured before. Fails on purpose if
  │                      fewer than 4 unused items are left in the catalog
  │                      → data/selected-gear.json
  │
  ├─ fetch:gear-ratings  scripts/fetch-gear-ratings.js
  │                      (best effort) scrapes a live star rating for each
  │                      selected item off Amazon/Arena
  │                      → data/gear-ratings.json
  │
  ├─ check:no-repeats    scripts/check-no-repeats.js
  │                      the hard gate: fails if the athlete, any news
  │                      topic, blog post, or gear item in this week's draft
  │                      already appears in data/newsletter-history.json, or
  │                      if any calendar event's date has passed. On success,
  │                      appends this week to history so future weeks can't
  │                      repeat it either
  │
  └─ build               scripts/render-newsletter.js
                         renders templates/newsletter-template.html using
                         data/draft-issue.json + selected-gear.json +
                         newsletter-blog-picks.json (+ gear-ratings.json if
                         present)
                         → issues/<date>.html
```

Run the whole thing locally with `npm run weekly`, or let the Monday GitHub
Action run it and open a pull request for review.

## Why nothing can repeat

`data/newsletter-history.json` is the single source of truth for what's
already run. Athlete of the Week, news topics, blog posts, and gear can
never repeat across issues — `check-no-repeats.js` hard-fails rather than
letting a repeat through. Calendar events are the one exception: they can
appear in back-to-back issues as long as their date hasn't passed yet (e.g.
an event 6 weeks out doesn't need to change every single week). Once the
date passes, it has to be swapped for something new.

## Project layout

```
data/
  draft-issue.example.json   template for the weekly manual editorial input
  draft-issue.json           this week's actual input (gitignored is NOT
                             set — commit this each week so the Action can
                             read it)
  gear-catalog.json          full pool of gear to rotate through; add new
                             products here as the current ones get used up
  newsletter-history.json    permanent record of everything ever featured
  selected-gear.json         generated each run
  newsletter-blog-picks.json generated each run
  gear-ratings.json          generated each run (optional)
templates/
  newsletter-template.html   structure only, no content — every dynamic
                             section is a {{PLACEHOLDER}}
scripts/                     the pipeline described above
issues/                      rendered output, one file per week
public/newsletter-images/    downloaded blog hero images
```

(The Monday workflow itself lives at the repo root:
`.github/workflows/weekly-newsletter.yml`.)

## Keeping the gear catalog stocked

`select-gear-items.js` refuses to reuse a product that's already been
featured. Whenever the catalog runs low on unused items (check the script's
error message — it tells you exactly how many more you need), add more
products to `data/gear-catalog.json` with a real affiliate link, a real
product image, a short description, and a starting rating.

## Adjusting the blog/gear scrapers

The blog scraper's selectors in `scripts/fetch-blog-posts.js` are verified
against the real blog card markup in this repo's `index.html` (`.blog-card`,
`.cat-badge`, `.blog-card-date`, `.blog-card-excerpt`, and the
`onclick="navigate('<post-id>')"` routing). If the blog card component in
`index.html` ever changes shape, update `scrapeBlogPosts()` to match.

The gear-ratings scraper (`scripts/fetch-gear-ratings.js`) targets external
product pages (Amazon/Arena) whose markup changes periodically, so its
selectors remain best-effort — the spots marked `ADJUST ME` are worth a
check in your browser's dev tools if a scrape starts coming back null. A
null rating is harmless: the newsletter falls back to the catalog's
placeholder rating.

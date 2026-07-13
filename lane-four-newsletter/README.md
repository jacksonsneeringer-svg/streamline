# LANE FOUR Weekly Newsletter

Code that generates AND sends the weekly LANE FOUR newsletter with zero human
input: composes the editorial content (news, athlete of the week, workout
blurbs) via the `streamline-newsletter-compose` Lambda, pulls fresh blog posts
and rotates gear automatically, enforces that nothing repeats week to week,
renders the final HTML, publishes it to the site, and emails every subscriber
— all from the Monday GitHub Action.

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

## Nothing stays manual — how the editorial writes itself

The old hand-authored `data/draft-issue.json` is now generated each Monday by
`scripts/compose-draft.js` + the `streamline-newsletter-compose` Lambda
(Claude on Bedrock, the same pattern as the site's daily set generator).
Everything is grounded in a real source so the model can't invent facts:

- **"In the Water This Week"** — summarized from the SwimSwam RSS feed
  (last 7 days only). The topic slug IS the feed post's slug, so the
  no-repeat history works across weeks, and the Lambda hard-rejects any
  item that doesn't reference a real provided story.
- **Athlete of the Week** — Claude proposes candidates not yet featured;
  the first with a Wikipedia photo wins, which doubles as an existence
  check and supplies a real photo.
- **Today's workout blurbs** — read from the daily sets/dryland the site
  already generates at 12:01 AM Pacific (DynamoDB).
- **Calendar events** — taken ONLY from `data/events-catalog.json`, never
  invented, so dates stay trustworthy. Past events drop out automatically.
- **Subject line, preheader, hero teaser, gear headline** — written fresh
  from that week's actual content.

If any grounding source comes up short (fewer than 4 fresh news stories, no
usable athlete), the workflow fails loudly instead of sending a thin or
stale issue.

The two files worth topping up occasionally (each takes a minute, every
month or two): `data/gear-catalog.json` when the unused pool runs low, and
`data/events-catalog.json` as new meets get announced.

## Sending and previews

A real Monday run publishes the hero images and a web-archive copy of the
issue to the site, then emails every subscriber through the
`streamline-newsletter-send` Lambda (Resend) in `rawHtml` mode — the
rendered document is sent verbatim, with each recipient's one-click
unsubscribe link swapped into the `{{UNSUBSCRIBE_URL}}` token. Afterwards
the updated history and issue are committed straight to `main`, which also
acts as re-run protection (a re-run that finds `issues/<date>.html` already
on `main` exits without sending twice).

To preview without touching the list: run the workflow manually from the
Actions tab with a **test_email** — it builds everything, emails only that
address, and commits/publishes nothing.

## How the pieces fit together

```
npm run weekly
  ├─ compose             scripts/compose-draft.js
  │                      gathers used athletes/topics from history and
  │                      upcoming events from the catalog, invokes the
  │                      streamline-newsletter-compose Lambda, validates the
  │                      result, and writes the editorial draft
  │                      → data/draft-issue.json
  │
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
                         newsletter-blog-picks.json; leaves
                         {{UNSUBSCRIBE_URL}} for send time
                         → issues/<date>.html

npm run send             scripts/send-issue.js
                         emails the rendered issue to every subscriber via
                         the streamline-newsletter-send Lambda (rawHtml
                         mode); set NEWSLETTER_TEST_EMAIL for a preview
```

Run the whole thing locally with `npm run weekly` (compose and send need AWS
credentials with `lambda:InvokeFunction`), or let the Monday GitHub Action do
all of it — including the send — unattended.

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
  draft-issue.example.json   reference for the draft shape (kept for docs)
  draft-issue.json           this week's editorial input — now GENERATED by
                             compose-draft.js each run, committed by the
                             workflow for auditability
  gear-catalog.json          full pool of gear to rotate through; add new
                             products here as the current ones get used up
  events-catalog.json        pool of upcoming meets for the calendar
                             section; append new ones as they're announced
  newsletter-history.json    permanent record of everything ever featured
  selected-gear.json         generated each run
  newsletter-blog-picks.json generated each run
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
products to `data/gear-catalog.json` with a product link, an image we host
or are licensed to use, and a short description.

Two hard rules for catalog entries, enforced/documented in
`select-gear-items.js` because they are legal constraints, not style:

- **No Amazon Associates links** (`amzn.to` or any `?tag=` URL). This
  newsletter is email, and Amazon's Associates Operating Agreement prohibits
  affiliate Special Links in email. Untagged product or brand-site URLs only.
- **No star ratings.** There is no lawful source for third-party ratings
  (scraping retailer pages violates their terms), and publishing an invented
  number is a fabricated consumer rating under the FTC's rule on consumer
  reviews. The cards describe the product; the retailer page speaks for its
  own reviews.

## Adjusting the blog scraper

The blog scraper's selectors in `scripts/fetch-blog-posts.js` are verified
against the real blog card markup in this repo's `index.html` (`.blog-card`,
`.cat-badge`, `.blog-card-date`, `.blog-card-excerpt`, and the
`onclick="navigate('<post-id>')"` routing). If the blog card component in
`index.html` ever changes shape, update `scrapeBlogPosts()` to match.


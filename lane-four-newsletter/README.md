# LANE FOUR Weekly Newsletter

Code that generates AND sends the weekly LANE FOUR newsletter with zero human
input: composes the editorial content (news, athlete of the week, workout
blurbs) via the `streamline-newsletter-compose` Lambda, pulls fresh blog posts
and gear straight from the site's own content, enforces that the athlete, news
topics, and blog picks don't repeat week to week, renders the final HTML,
publishes it to the site, and emails every subscriber — all from the Monday
GitHub Action.

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
npm run weekly
```

There's no headless browser anymore — the blog and gear sections read the
site's own HTML directly, so `npm install` pulls nothing (there are no runtime
dependencies). One optional env var helps local runs: `NEWSLETTER_SITE_URL`
points the blog/gear reader at a served copy of the site (e.g.
`http://localhost:8080` while serving the repo root with
`python3 -m http.server 8080`, or `https://winlanefour.com`). Left unset, it
reads the repo's own `index.html` — the exact file that gets deployed.

## Nothing stays manual — how the editorial writes itself

The old hand-authored `data/draft-issue.json` is now generated each Monday by
`scripts/compose-draft.js` + the `streamline-newsletter-compose` Lambda
(Claude on Bedrock, the same pattern as the site's daily set generator).
Everything is grounded in a real source so the model can't invent facts:

- **"In the Water This Week"** — summarized from the **SwimSwam and Swimming
  World** RSS feeds (last 7 days only). The topic slug IS the feed post's
  slug, so the no-repeat history works across weeks; the Lambda hard-rejects
  any item that doesn't reference a real provided story; and each synopsis
  ends with a `(via <Source>)` link back to the outlet that reported it.
- **Athlete of the Week** — Claude proposes candidates (any aquatic or
  endurance athlete — pool, open water, triathlon, para-swimming, diving —
  with a national/international medal and a Wikipedia page). The first
  candidate whose Wikipedia lead photo is **free-licensed** (Creative Commons
  / public domain — legal to reuse in email) wins, and the two-paragraph bio
  is **summarized from that athlete's Wikipedia page** (who they are, then
  their achievements), never invented.
- **Today's workout blurbs** — read from the daily sets/dryland the site
  already generates at 12:01 AM Pacific (DynamoDB).
- **Calendar events** — taken ONLY from `data/events-catalog.json`, never
  invented, so dates stay trustworthy. Past events drop out automatically.
- **Subject line, preheader, hero teaser, gear headline** — written fresh
  from that week's actual content.

If any grounding source comes up short (fewer than 4 fresh news stories, no
athlete with a free-licensed photo and a usable bio), the workflow fails
loudly instead of sending a thin or stale issue.

The one file worth topping up occasionally: `data/events-catalog.json` as new
meets get announced. Gear and blog content now come from the website itself,
so there's no separate catalog to maintain.

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
  │                      reads the site's own BLOG_POSTS data (via
  │                      scripts/site-source.js), picks up to 3 posts from the
  │                      last 7 days (one per category), skipping anything
  │                      already featured before
  │                      → data/newsletter-blog-picks.json
  │
  ├─ select:gear         scripts/select-gear-items.js
  │                      pulls the products reviewed in the site's gear blog
  │                      articles (the `.product-pick` blocks, via
  │                      site-source.js), condenses each "Our take" review, and
  │                      picks 4 — repeats allowed, links straight to the
  │                      product's spot in the article
  │                      → data/selected-gear.json
  │
  ├─ check:no-repeats    scripts/check-no-repeats.js
  │                      the hard gate: fails if the athlete, any news topic,
  │                      or blog post in this week's draft already appears in
  │                      data/newsletter-history.json, or if any calendar
  │                      event's date has passed. On success, appends this week
  │                      to history so future weeks can't repeat it either
  │                      (gear is intentionally not deduped)
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
already run. Athlete of the Week, news topics, and blog posts can never repeat
across issues — `check-no-repeats.js` hard-fails rather than letting a repeat
through. Two exceptions: **gear** may repeat (it comes from the site's gear
blog articles, so there's no pool to exhaust — this is what caused the old
catalog to run dry), and **calendar events** may appear in back-to-back issues
as long as their date hasn't passed yet (an event 6 weeks out doesn't need to
change every week). Once an event's date passes, it has to be swapped out.

## Project layout

```
data/
  draft-issue.example.json   reference for the draft shape (kept for docs)
  draft-issue.json           this week's editorial input — now GENERATED by
                             compose-draft.js each run, committed by the
                             workflow for auditability
  events-catalog.json        pool of upcoming meets for the calendar
                             section; append new ones as they're announced
  newsletter-history.json    permanent record of everything ever featured
  selected-gear.json         generated each run (from the site's gear articles)
  newsletter-blog-picks.json generated each run (from the site's BLOG_POSTS)
templates/
  newsletter-template.html   structure only, no content — every dynamic
                             section is a {{PLACEHOLDER}}
scripts/
  site-source.js             reads the site's own index.html for the blog
                             posts (BLOG_POSTS) and gear (`.product-pick`)
  ...                        the rest of the pipeline described above
issues/                      rendered output, one file per week
public/newsletter-images/    downloaded external blog hero images (site-hosted
                             images are referenced in place, not re-downloaded)
```

(The Monday workflow itself lives at the repo root:
`.github/workflows/weekly-newsletter.yml`.)

## Where gear comes from (and how to add more)

Gear is pulled straight from the **gear blog articles on the site** — the
ranked `.product-pick` blocks inside a gear roundup page in `index.html`
(e.g. `page-best-swim-snorkels`). For each product, `scripts/site-source.js`
reads the photo (`.product-pick-img`), the product name (the image `alt`), and
the on-site "Our take" review (`.product-pick-quote`), condensing the review
into the newsletter's sentence or two. Repeats are fine — there's no pool to
run dry.

To make the email link land **exactly on a product** inside its article, each
`.product-pick` div needs an `id="pick-<slug>"`; `site-source.js` builds the
deep link `winlanefour.com/<article>#pick-<slug>` from it, and the site's
router scrolls straight to that product on load. To add gear, write a normal
gear roundup article with `.product-pick` blocks and give each one a `pick-…`
id — no separate catalog to maintain.

Two things stay true by design:

- **No Amazon/affiliate link ever reaches email.** The email links to the
  article anchor on `winlanefour.com`; the on-site "Check price" affiliate
  links stay on the site. `select-gear-items.js` hard-stops if a pick's link
  isn't an on-site URL.
- **No star ratings** in the newsletter cards — they describe the product and
  let the article's own review and the retailer page speak for themselves.

## How the blog section reads the site

`scripts/fetch-blog-posts.js` (via `site-source.js`) reads the site's own
`const BLOG_POSTS = [...]` data from `index.html` — real ISO dates, categories,
excerpts, and hero images — rather than scraping the rendered page. Site-hosted
hero images are referenced in place; external ones (e.g. Pexels) are downloaded
into `public/newsletter-images/` so the email isn't hotlinking a third party.
If the `BLOG_POSTS` shape in `index.html` ever changes, update `getBlogPosts()`
in `site-source.js` to match.


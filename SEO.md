# SEO on winlanefour.com

## How every page becomes its own Google-indexable URL

The site is a single-page app: one `index.html` whose "pages" are shown and
hidden client-side. It used to route with URL fragments (`/#swim-sets`), and
Google ignores everything after `#`, so the whole site collapsed into one
indexed URL (the homepage). Three pieces now give every page its own URL:

1. **Path routing** — the SPA routes with real paths (`/swim-sets`,
   `/race-week-taper`). Old `/#page` links (bookmarks, sent emails) still work:
   the router recognizes them, shows the page, and rewrites the address bar to
   the canonical path.

2. **Prerendered documents** — on every deploy,
   `scripts/prerender.mjs` (run by `.github/workflows/deploy.yml` before the
   S3 sync) writes one `<route>/index.html` per page and blog post. Each copy
   ships its own `<title>`, meta description, canonical URL, Open Graph /
   Twitter card, structured data, and has its page `<div>` pre-marked active,
   so crawlers get the right content even without executing JavaScript. It
   also regenerates `sitemap.xml` with every indexable URL.

3. **CloudFront URL rewrite** — the `streamline-url-rewrite` CloudFront
   Function (`cloudformation/template.yml`) maps extensionless paths to those
   objects (`/swim-sets` → `swim-sets/index.html`). Unknown paths still fall
   back to the homepage with a 404 status, so they don't pollute the index.

**Publishing a new blog post requires no SEO work.** Follow BLOG.md as usual
(add the page div + `BLOG_POSTS` entry). On the next deploy the post
automatically gets its own URL, title/description (from `title`/`excerpt`),
hero image social card, `BlogPosting` + `BreadcrumbList` structured data, and
a sitemap entry with the publish date.

## Where the metadata lives

- **Static pages**: `PAGE_TITLES` and `PAGE_DESCRIPTIONS` in `index.html`.
  Adding a new static page? Add its title and description there.
- **Blog posts**: the post's `BLOG_POSTS` entry (`title`, `excerpt`,
  `heroImage`, `date`, `keywords`).
- **Noindex list**: `NOINDEX_PAGES` in `index.html` — account, auth, and
  login-gated pages (`/my-training`, `/sign-in`, `/profile`, the archives,
  etc.) are served with `<meta name="robots" content="noindex">` and excluded
  from the sitemap, so Google spends its crawl budget on content pages.
- The SPA also updates title/description/canonical/OG tags live as the user
  navigates (`updateSeoTags` in `index.html`), so JS-rendering crawlers and
  link shares always see the current page's metadata.

## Structured data (schema.org) implemented

| Where | Schema |
|---|---|
| Homepage | `WebSite`, `Organization` (name, logo, contact point) |
| Every blog post | `BlogPosting` (headline, description, image, dates, author/publisher, section, keywords) + `BreadcrumbList` |
| Blog index + category pages | `CollectionPage` with an `ItemList` of posts + `BreadcrumbList` |

Validate after deploy with Google's [Rich Results Test](https://search.google.com/test/rich-results)
and the [Schema Markup Validator](https://validator.schema.org/).

## Schema recommendations (not yet implemented)

Worth adding as content grows, roughly in order of payoff:

1. **`Product` + `AggregateRating`/`Review` on gear roundups** — the snorkel
   roundup (`/best-swim-snorkels`) names five products with editorial
   verdicts. Marking each up as a `Product` with `review` (and `offers` if you
   show prices) is the strongest rich-result opportunity on the site today.
   Caveat: Google requires visible ratings/prices matching the markup.
2. **`FAQPage`** — several articles end in Q&A-shaped sections. Two or three
   real FAQs per article marked up as `FAQPage` can win the expandable FAQ
   rich result. Only mark up questions actually visible on the page.
3. **`HowTo`** — drill walk-throughs and "how to use X" guides
   (`/swim-snorkel`, `/kickboard-training`) fit `HowTo` with steps.
4. **`Person` author profiles** — posts currently credit the Organization.
   If articles get named authors, switch `author` to `Person` with a bio page;
   Google increasingly weighs author E-E-A-T for advice content.
5. **`sameAs` social profiles on `Organization`** — when LANE FOUR has
   Instagram/YouTube/etc., list them in the Organization schema to
   consolidate entity identity.
6. **`VideoObject`** — if technique articles ever embed video, this earns
   video rich results.

## Ongoing SEO checklist

- **Search Console**: after this deploys, submit `https://winlanefour.com/sitemap.xml`
  in Google Search Console and request indexing of the homepage. New posts are
  picked up from the sitemap automatically; expect days-to-weeks for first
  full indexing.
- **One canonical URL per page**: pages declare the no-trailing-slash form
  (`https://winlanefour.com/swim-sets`); the CloudFront function serves both
  slash forms with that canonical. Keep internal links slash-free.
- **Titles/descriptions**: keep titles ≤ 60 chars and descriptions 140–160
  chars; post excerpts double as meta descriptions, so write them like search
  snippets.
- **Internal linking**: link related posts from article bodies with real
  `<a href="/post-id">` anchors — the router upgrades them to instant SPA
  navigations automatically, and crawlers follow them.
- **Images**: keep `heroAlt` meaningful (it's the `alt` text), and prefer the
  Pexels landscape crop — the prerenderer derives the 1200×630 social image
  from `heroImage`.

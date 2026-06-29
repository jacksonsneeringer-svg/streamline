# Blog publishing workflow

The blog is data-driven from a single source of truth: the **`BLOG_POSTS`**
array in `index.html`. Everything the reader sees about a post — its publish
date, read time, ordering, and hero image — is derived from that array on page
load, so the home page, the blog pages, and the article's own page can never
disagree.

## What happens automatically on every load

Once a post is in `BLOG_POSTS`, the pipeline in the `DOMContentLoaded` handler
(in `index.html`) does the rest:

1. **Ordering** — posts are sorted by `date`, newest first. The newest post
   becomes the featured "Recently Published" story and leads its category list.
   The per-category blog pages are re-sorted by date too.
2. **Read time** — recomputed from each article's live body text at ~200 wpm
   (rounded up). It updates whenever the article's text changes (an edit, or a
   push that changes the article HTML). The `readTime` field is only a fallback.
3. **Dates** — the formatted `date` is written into every card (home, blog,
   "continue reading") and into the article header, so all locations match.
4. **Hero image** — if the post has a `heroImage`, it is shown on the post's
   cards and as a banner at the top of the article, above the headline.

The password-gated in-page editor also calls `window.__refreshBlogMeta()` after
saving, so read time updates immediately when an article is edited live.

## Publishing a NEW article

1. **Add the article page.** Insert a `<div class="page" id="my-post-id">` with
   the standard `.post-header` (containing the `<h1>` and a `.post-meta`) and an
   `<article class="post-body">…</article>`. Copy an existing post as a template.
   Do **not** hand-write the date or read time — they are filled in for you.

2. **Add a `BLOG_POSTS` entry** (anywhere in the array — it is sorted by date):

   ```js
   {
     id: 'my-post-id',                 // must match the page id (minus "page-")
     title: 'My Post Title',
     category: 'Training',             // display badge
     homeSection: 'training',          // technique | training | nutrition | gear | guides
     date: '2026-06-29',               // the PUBLISH (push) date, YYYY-MM-DD
     readTime: 5,                      // fallback only; live word count wins
     keywords: ['swim meet taper', 'competitive swimming'],
     heroImage: 'https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg',
     heroAlt: 'Describe the photo for screen readers',
     heroCredit: 'Photo by <Photographer> on Pexels',
     openingText: 'First paragraph, used as the card excerpt…',
     excerpt: 'Short one-line summary.',
     thumbStyle: 'background:…;',       // fallback gradient if no heroImage
     thumbPaths: '<path …/>',          // fallback SVG icon if no heroImage
   }
   ```

   - **`date`** is the publish date. Per the publishing convention, set it to the
     date you push the article; it then sorts to the top automatically.

3. **Pick the hero photo from Pexels using the keywords.**
   - Search Pexels (e.g. `https://www.pexels.com/search/<keywords>/`) for a
     **horizontal / landscape** photo that fits the article.
   - Set `heroImage` to the base image URL of the chosen photo:
     `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg`
     (the code appends sizing/crop params via `_heroSrc`, so any source
     orientation is centre-cropped to landscape for you).
   - Fill in `heroAlt` and `heroCredit` (Pexels asks that you credit the
     photographer).

That's it — commit and push. The new article appears at the top of the blog with
a consistent date everywhere, an accurate read time, and its Pexels hero image.

> Note: this repo has no build step (GitHub Actions just syncs files to S3 on
> push to `main`) and no Pexels API key, so the hero photo is chosen by hand per
> the steps above. If you later add a `PEXELS_API_KEY` secret, this step could be
> automated in CI.

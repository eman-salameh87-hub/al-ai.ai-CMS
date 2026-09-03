# new-aeon.com → New Aeon CMS

The record of the migration: what ran, what it produced, what was deliberately
dropped, and what still needs a decision.

The plan came from **New Aeon Migration Map** (3 September 2026). Where this
document disagrees with that one, this one is what the code actually does.

---

## Running it

Four steps, in order. Every one is idempotent — re-running fixes a mistake
rather than duplicating rows.

```bash
# 0. Extract the SQL Server backup from the delivered archive
bsdtar -xvf NewAeonDataBaseBac.rar -C "New-aeon CMS - 2026/migration/legacy-db"

# 1. Restore it into a throwaway SQL Server (Docker; amd64 under Rosetta on Apple silicon)
./migration/restore-legacy.sh

# 2. Dump every content table to JSON, and the .resx bundles alongside
./migration/dump-legacy.sh              # add --with-submissions for enquiries/applications
python3 migration/extract-resources.py

# 3. Import content, taxonomy and media
npm run migrate:legacy -- --dry-run
npm run migrate:legacy

# 4. Build the pages, menus, theme and settings
npm run migrate:site -- --dry-run
npm run migrate:site
```

Reports land in `migration/out/`:
`_import-report.json`, `_site-seed-report.json`, `_missing-images.json`,
`_unrecoverable-images.json`, `_resources.json`.

When the migration is signed off, take the throwaway database down and delete
the backup — it holds 5,578 real enquiries and 192 job applications:

```bash
docker compose -f migration/docker-compose.legacy.yml down -v
rm -rf migration/legacy-db migration/out
```

---

## What came across

| | |
|---|---|
| Client case studies | **96** |
| Services (`/what-we-do`) | **10** |
| Advanced services | **6** |
| Achievements | **9** |
| Singleton pages | **7** (home, who-we-are, contact, portfolio, careers, training, privacy-policy) |
| Typed content blocks | **1,017** across both locales |
| Categories | **19** |
| Country tags | **14** |
| Category ↔ client links | **106** |
| Country ↔ client links | **125** |
| Media files | **449** (≈156 MB) |
| Legacy URLs still resolving | **240 of 241** |

Every entry has both an Arabic and an English translation, its own per-locale
meta title and description, and its featured image.

### The blog is empty, and always was

`Blogs`, `BlogCategory` and `NewsAndUpDate` all have **zero rows** in the
restored production backup. The migration map lists the blog as COVERED, which
it is — the routes, the archive, the category filter and the home page strip are
all built and working. There is simply nothing to import. `/en/blog` renders an
empty archive, and the home page's blog strip renders nothing at all rather than
a heading over a blank row.

Same for `TrainingApplay` and `TrainingAvailable` (0 rows), and
`LookupDetails` (0 rows). `SlidersImages` and `ImagesDescreption` — both named
in the migration map — **do not exist as tables** in this database; the slider
images were kept in `GlobalResources.resx` instead, and there is no alt-text
table to migrate.

---

## The ten work items

| # | Item | State |
|---|---|---|
| 01 | Redirect map for 241 URLs | **Done** — 240/241 verified against the running site |
| 02 | Custom fields | **Done** — 6 kinds, admin editor, validation, site renderer, 15 fields across the four types |
| 03 | Applications with a file | **Done** — upload route, magic-byte checks, authenticated download, applicant inbox |
| 04 | Bulk path for content | **Done** — `content` entity in the import/export registry |
| 05 | HTML bodies → typed blocks | **Done** — 229 bodies → 1,017 blocks, **zero** html-escape-hatch fallbacks |
| 06 | Portfolio's two-axis filter | **Done** — `client-filter` block, category × country, URL-addressable |
| 07 | Three missing homepage blocks | **Done** — `video-hero`, `logo-carousel`, `blog-strip` |
| 08–10 | — | Not in the delivered PDF (it ends mid-sentence on item 07) |

### 01 — Redirects

Two halves, because the problem has two shapes.

**The rule** (`lib/redirects/legacy-map.ts`) runs in middleware, on the Edge,
with no database query. The 241 indexed URLs are not 241 arbitrary moves; they
are eleven prefix renames plus "lowercase the slug", and a rule expresses that
exactly — it also keeps working for the legacy URLs that were never in the
sitemap. `/WhoWeAre` reaches `/ar/who-we-are` in a single hop.

**The table** (`redirects`) is for moves no rule can express: a legacy numeric
`/Blog/482`, or a slug an editor changes later. It is consulted in Node only
when a page was about to 404, so it costs nothing on the hot path. The importer
recorded **zero** rows, because the rule's output and the imported slugs were
cross-checked and agree on all 121 entries.

`/en/ErrorPage` is the one indexed URL that still 404s, deliberately: the legacy
site served its 404 body at a 200-OK address, which is how it got indexed.
Redirecting it would launder a dead end into a soft 404.

One-off moves are managed at **Admin → Redirects**, which shows a hit count per
rule — a rule with no hits after a month is one you can retire, and a spike on
one source is a link somebody is still publishing. The table is consulted by
`redirectOrNotFound` on the routes that resolve content by URL, immediately
before they would 404.

Verified end-to-end: `tests/redirects/legacy-map.test.ts` drives all 241 URLs
from the real sitemap, and the same list was replayed against the running
server — **240 of 241 answered 200**, the exception being `/en/ErrorPage`.

### 02 — Custom fields

`content_types.customFields` existed in the schema and nothing read or wrote it.
It now carries validated field definitions, and `content.custom_field_values`
holds the values. Six kinds: text, textarea, url, number, boolean, image,
select.

Editable at **Admin → Content types → the sliders icon** on any row, and
rendered on the public page — the five advanced services' YouTube videos and
the ten services' inner images were imported invisible until that renderer
existed.

**Where a field appears is declared, not guessed.** Each definition carries
`display`: `banner` (a full-width image above the body), `inline` (a labelled
row, or an embed for a YouTube/Vimeo URL), or `hidden` (stored and editable,
never rendered). The legacy mobile crops and hover animations are `hidden` —
they are real data an editor may want and they are not sections of a page. A
renderer that special-cased `innerImage` and `videoLink` by name would have put
the meaning of a field in a component instead of in its definition.

Fields defined by the import:

- **Client** — mobile logo
- **Service** — hover animation, inner image, mobile image, mobile animation, mobile inner image
- **Advanced service** — video link (`as_VideoLink`), plus six image slots
- **Achievement** — detail image, mobile image, mobile detail image

A `url` field refuses `javascript:` and `data:` — the value ends up in an
`href`, so that is a stored-XSS check, not a formality.

**This also unblocked something larger.** `POST /api/content` validated its
`type` against `['page','post','resource']`, so the API could not create an
entry of any administrator-defined type. The whole point of
`content_types.routePrefix` is that a custom type gets real URLs, and this route
refusing to write one made the feature unreachable. `lib/db/archives.ts`
`listByType` had the same narrow union.

### 03 — Applications

New form types `career` and `training`, an `attachments` column, and
`POST /api/forms/apply` — multipart, on its own rate-limit bucket (3 per 10
minutes, against the enquiry form's 5), with the same honeypot and origin
checks.

Attachments are **not** media-library rows. The media library is a curated
place an editor browses and reuses; a stranger's CV must never appear in it.
Files go to a separate `form-uploads/` prefix under a generated key, and the
only way back to the bytes is `GET /api/forms/{id}/attachments/{n}`, behind the
admin guard, always `Content-Disposition: attachment`.

The declared MIME type is checked against the file's **magic bytes**. A `.exe`
renamed and posted as `application/pdf` fails at the door.

Applications land in **Admin → Forms**, which now has four tabs; each row lists
its attachments as download links. Verified live:

| Sent | Result |
|---|---|
| Valid PDF | 200, stored at `form-uploads/2026/09/<uuid>.pdf` |
| `MZ…` bytes declared `application/pdf` | 400 — content mismatch |
| 5.7 MB PDF | 400 — "that file is 5.7 MB, the limit is 5 MB" |
| A 4th attempt inside 10 minutes | 429 — rate limit |
| Download without signing in | **403** |

`StorageDriver` gained a `get(key)` method — it moved bytes one way only, and
an authenticated download needs to read them back. Implemented for both local
and S3.

### 05 — HTML → blocks

Measured across all 242 non-empty bodies in the restored database, the legacy
markup uses exactly eight tags:

```
1574 <p>   1404 <br>   412 <strong>   412 <img>
 150 <span>  48 <a>     30 <div>        4 <em>
```

No headings, no lists, no tables. The converter is built for what is actually
there, and `htmlFallback` catches anything that turns up later.

Result: **229 bodies → 1,017 blocks. 412 image, 411 paragraph, 208 rich-text,
0 html.** Nothing landed in the escape hatch, which was the stated bar — a site
imported as opaque HTML is a site editors cannot edit.

Prose with inline marks becomes `rich-text` (TipTap JSON, which the admin's
existing editor opens); plain prose becomes a real `paragraph`. Every `<br>` is
kept as a hardBreak rather than guessed into a paragraph split — 1,404 of them
carry the author's line structure.

### 06 — Portfolio filter

`client-filter` ships the whole catalogue (96 entries with their taxonomy slugs
— a few kilobytes) and narrows it in the browser, which is the behaviour the
legacy page had. Filter state lives in the query string, so a filtered view can
be linked, bookmarked and reached with the back button — which the legacy
jQuery version could not do.

Category **AND** country, OR within each: "banking in the UAE" is the question
two filter groups exist to answer.

### 07 — Homepage blocks

- **`video-hero`** — full-bleed autoplay video with a real skip button.
  `prefers-reduced-motion` is read in JS, not just CSS, so the `<video>` is
  never mounted for someone who asked not to have it and the megabytes are
  never fetched. The poster is required, because it is what those visitors see.
- **`logo-carousel`** — a duplicated CSS track and one `translateX` keyframe,
  replacing the legacy page's 124 KB of Swiper. Pauses on hover, stops entirely
  under reduced motion. Pulls logos from the `client` type, so publishing a
  case study adds its logo with no second edit.
- **`blog-strip`** — posts with category buttons that filter in place. The
  legacy version made an AJAX call per category; the posts are already on the
  page here.

---

## Bugs found and fixed along the way

These were pre-existing and unrelated to the migration brief, but they blocked
or silently damaged it.

1. **`POST /api/content` could not create custom-type entries** — its `type`
   enum was `page | post | resource`. This made `routePrefix` unreachable and
   blocked bulk import entirely.
2. **`listByType` had the same narrow union**, so no custom type could have an
   archive.
3. **`recent-posts` had no type filter at all.** The query was
   `where(status = 'published')` and nothing else — on this site it would have
   listed pages, clients, services and achievements interleaved as one feed.
4. **`recent-posts` ignored its own `category` field**, which was declared in
   the union and never read.
5. **`recent-posts` built `/{locale}/{slug}`**, a 404 for any type with a route
   prefix — a client linked to `/en/stc` instead of `/en/clients/stc`.
6. **`recent-posts` used a `leftJoin` on translations**, rendering an entry's
   raw slug where a title should be.
7. **The home page hardcoded `blocks[0].type === 'slider'`** to decide whether
   to render its generic placeholder hero, so a `video-hero` got a placeholder
   banner above it. Now checks `lib/blocks/layout.ts`.
8. **The form-alert email subject was `isContact ? … : newsletterSubject`**, so
   every job application would have arrived titled "New newsletter signup".
9. **The full-bleed escape hatch was an inline magic string** in `slider.tsx`
   that has to agree with the page container. Extracted to
   `lib/blocks/layout.ts` before it became a third copy.
10. **The demo announcement bar** ("Delivery across Jordan · luxury gift
    wrapping") was rendering above the New Aeon navbar. Cleared, and commerce
    left off — this is an agency site with no shop.
11. **`StorageDriver` could write bytes but not read them.** The interface says a
    driver "moves bytes and nothing else" and only had `put`/`remove`, so an
    authenticated download had no way to fetch a file. `get(key)` added to both
    the local and S3 drivers.
12. **The Portfolio page printed its heading twice** — once from the page's own
    `<header>` and once from the block's `title`. Every page route already
    renders the entry's title and excerpt, so the block carries neither.
13. **The content types screen had no edit path at all.** It could create a type
    and delete one, and nothing in between — so field definitions had no UI.

---

## Deliberately dropped

| What | Why |
|---|---|
| `*_MetaKeywords` / `*_MetaKeywordsAr` | No ranking signal since 2009; no field in the new schema |
| `*_Order` on individual entries | Types and categories have `sortOrder`; entries do not. Preserved as ordered `publishedAt` timestamps so the curated running order survives, but an archive cannot be hand-reordered |
| Mobile image crops (`*PostedImageMob`, `*_Mobail*`) | `next/image` serves a responsive srcset from one source. What is genuinely lost is *art direction* — a crop composed for a narrow screen |
| Slider foreground graphics (`*PostedImageVar*`) | Positioned over the background by hand-written per-slide CSS; no honest block equivalent |
| The seven office descriptions | The legacy value is the literal placeholder "Description" / "الوصف" in both locales — never filled in, so there is nothing to migrate |
| The privacy policy text | The legacy resource is `"this is resource for Privacy Policy"` — placeholder copy that has been live on new-aeon.com. Copying it would put obvious filler on a legal page; the page carries a note instead |
| `indexOurClient1-5`, `index*ServiceImg` | Hardcoded `/MyLayout` paths to sample logos and numbered icons; real logos come from the imported catalogue |
| `Index_Slider1href` / `Slider2href` | Both point at `http://dev.new-aeon.com`, a staging host that no longer resolves |
| `GlobalResources.resx` live editing | **A real regression.** The old CMS let an administrator edit interface strings in the browser; the new one keeps them in `messages/*.json`. Page *copy* became editable CMS content — only interface chrome moved to static files |

---

## Needs a decision

**1. One hero slide is missing: an 8.1 MB animated GIF.**

`Images/SliderImage/7b2ec76f-2bd6-4560-8ce8-268284ef8b18.gif` is 8,500,659
bytes against the CMS's 8 MB image cap, so it was not imported and the home
slider shows two slides instead of three. The importer refuses to re-encode
someone's asset — that is a person's decision, not a script's. Three options:

- Convert it to animated WebP (typically 5–10× smaller, and on the allow-list).
- Raise `MAX_IMAGE_BYTES` in `lib/media/limits.ts` — but the comment there is
  right that this is a hosting decision as much as a code one, and 8 MB before
  anything else loads is poor for the page regardless.
- Replace it with a different slide.

**2. 38 secondary images are absent from the handover.**

All *primary* images resolved. The 38 that did not are mobile GIFs, inner
images and slider images — the slots the migration map already marks as dropped
— plus `Ach_Image` for 2 of the 9 achievements, and 7 inline body images. One
value (`clnt_MobailImage` on one client) is the string `…​.aspx`, which is junk
data rather than a missing file. Listed in
`migration/out/_unrecoverable-images.json`.

**3. The navigation is a horizontal bar, not the legacy side drawer.**

new-aeon.com uses a hamburger that opens a full-height drawer headed "M✕NU".
The rebuilt site uses the CMS's own responsive navbar with the same nine items
and the same labels in both languages. This is the one place the look
deliberately differs, and it is worth a look before launch.

**4. The `drizzle` migration ledger is empty.**

`drizzle.__drizzle_migrations` has zero rows — this database was built with
`db:push`, so `drizzle-kit migrate` would try to replay `0000` and collide with
existing objects. `0015_legacy_migration_support.sql` was therefore applied
directly. Before production, decide whether this install is push-managed or
migrate-managed; it cannot be both.

---

## Verification

```bash
npm test          # 727 tests
npm run typecheck
npm run lint
npm run build
```

The suites that matter for this work:

- `tests/redirects/legacy-map.test.ts` — 255 tests, driven by the real
  `sitemap.xml`; asserts every one of the 241 URLs maps to a served route, that
  no two collide, and that destinations satisfy the CMS's own prefix pattern.
- `tests/blocks/from-html.test.ts` — 20 unit tests plus a corpus test that runs
  every legacy body through the converter and fails if anything reaches the
  `html` escape hatch.
- `tests/blocks/html-round-trip.test.ts` — blocks → HTML → blocks, including the
  guard that stops a spreadsheet re-import blanking a page whose body contains a
  slider or a form.
- `tests/content/custom-fields.test.ts` — 28 tests, including the
  `javascript:`/`data:` refusals.
- `tests/forms/form-types.test.ts` — asserts the hand-written `FORM_TYPES` still
  matches the database enum, since the admin table cannot import the schema.

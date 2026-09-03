# Start here

This is new-aeon.com, rebuilt on the New Aeon CMS. The content is already
imported — 121 entries, both languages, 517 media files — so this runs and
looks like the finished site the moment you start it.

## Run it locally

```bash
npm install                 # node_modules was stripped from this package
docker compose up -d db     # Postgres on :5435
npx drizzle-kit migrate     # creates the schema
npm run dev                 # http://localhost:3000
```

The database starts empty. To fill it with the migrated content:

```bash
npm run migrate:legacy      # 121 entries, taxonomy, media
npm run migrate:site        # the seven pages, menus, theme, settings
```

Then visit `/setup` to create an admin account.

> `migrate:legacy` reads `migration/out/*.json`, which is included. It also
> reads the original media from `../NewAeonWebsite`, which is **not** — ask for
> the legacy archive if you need to re-run the import from source. You should
> not need to: `public/uploads` already has every file the content references.

## Deploying

**→ `deploy/smarterasp/README.md`** — the hosting account already runs Node and
PostgreSQL, so the site does not need a new host. `build-package.sh` assembles
the upload folder; `web.config` is the IIS configuration that starts it.

Two things in there will bite you if you skip them, and both fail silently:
`NEXT_PUBLIC_APP_URL` is baked in at build time, and the native binaries have to
be swapped for win32-x64 or nobody can log in to the admin. The README explains
both.

## What was done, and what was deliberately left out

**→ `migration/README.md`** — the full record: what came across, what was
dropped and why, the bugs found along the way, and three decisions still open
(an oversized hero GIF, the placeholder privacy policy, and rotating the legacy
database credentials).

**→ `migration/GOING-LIVE.md`** — cutover order and the pre-launch checklist.

## Verifying

```bash
npm test        # 727 tests
npm run lint
npm run build
```

`tests/redirects/legacy-map.test.ts` is the important one: it drives all 241
indexed URLs from the old site's real sitemap and asserts each maps to a served
route. All 241 were also replayed against a running build — 240 answered 200,
and `/en/ErrorPage` 404s deliberately.

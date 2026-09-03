# Replacing new-aeon.com

## The short version

You cannot upload this to the current server.

The live site is **ASP.NET MVC 5 on IIS with SQL Server** — a Windows stack that
serves compiled Razor views. This is **Next.js on Node 24 with Postgres**. There
is no folder to copy into `wwwroot`; the new site is a running process, not a
set of files IIS interprets.

So: stand the new site up somewhere else, prove it works on a temporary URL,
then point the domain at it. The old site stays running the whole time and stays
running for a while afterwards, so that a rollback is a DNS change rather than a
recovery.

---

## What you need to provision

Three things. The repo is already set up for all three.

| | What | Why |
|---|---|---|
| 1 | A **Node host** that builds from `docker/Dockerfile` | Railway is pre-configured (`railway.json`, healthcheck on `/api/health`). Render, Fly, or any container host works the same way. A VPS with Docker works too. |
| 2 | A **Postgres** database (15+) | Replaces SQL Server. Most hosts offer one as an add-on. |
| 3 | **S3-compatible object storage** — Cloudflare R2, AWS S3, DigitalOcean Spaces | For the 517 media files. See the media section below; this is the step most likely to be missed. |

The container runs `node migrate.cjs && node server.js` — it applies database
migrations on boot, then serves. You do not run migrations by hand in
production.

---

## Environment variables

Required, with no default — the app refuses to boot without them, deliberately:

```
DATABASE_URL          postgresql://…            from your Postgres add-on
JWT_ACCESS_SECRET     <32+ random chars>        openssl rand -base64 32
JWT_REFRESH_SECRET    <32+ random chars>        a DIFFERENT one
NEXT_PUBLIC_APP_URL   https://new-aeon.com      must be the real domain
DEFAULT_LOCALE        ar                        or en — decides what / redirects to
```

**`NEXT_PUBLIC_APP_URL` is read at BUILD time**, not just at runtime. It ends up
in `og:image` URLs, the sitemap and canonical tags. Set it before the first
build or every share card points at the wrong host.

Storage and mail:

```
STORAGE_DRIVER        s3
S3_BUCKET             new-aeon-media
S3_ENDPOINT           https://<account>.r2.cloudflarestorage.com
S3_PUBLIC_URL         https://media.new-aeon.com    the public read URL
S3_ACCESS_KEY_ID      …
S3_SECRET_ACCESS_KEY  …
S3_REGION             auto                          for R2
MAIL_DRIVER           smtp
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / MAIL_FROM
```

`S3_PUBLIC_URL` is also baked into the build — `next.config.ts` adds its
hostname to `images.remotePatterns`, and a bucket host missing from that list
means every image 400s. Set it before building.

---

## The media, which is the step people miss

The 517 imported files (~156 MB) live in `public/uploads/` locally and are
**gitignored** — they are not in the commit and will not arrive with a deploy.

Two options:

**S3/R2 (recommended).** Point the env at the bucket, then push the local files
up with the script that already exists:

```bash
STORAGE_DRIVER=s3 npm run media:migrate
```

It reads every `media_assets` row, uploads the file, and rewrites the row's URL.

**A persistent volume.** If the host offers one, mount it at `/app/public/uploads`
and copy the folder up once. Simpler, but it does not survive a host migration
and does not work if you ever run more than one instance.

Do **not** deploy with `STORAGE_DRIVER=local` and no volume — container
filesystems are ephemeral, and every upload an editor makes disappears on the
next restart.

---

## Getting the content into production

The production database starts empty. The `migrate.cjs` step on boot creates the
schema; it does not create content.

Run the same three commands you ran locally, with `DATABASE_URL` pointed at
production:

```bash
npm run migrate:legacy -- --dry-run   # read the report first
npm run migrate:legacy
npm run migrate:site
```

They need `migration/out/*.json`, so run them from a machine that has the dumps
— your laptop is fine, pointed at the production database.

Then create the first administrator by visiting `/setup` on the new host. That
route closes itself permanently once an admin exists.

**One note on migrations.** Your *local* database was built with `db:push` and
has an empty migration ledger, so `drizzle-kit migrate` will not run against it.
A fresh production database has no such problem — it replays `0000` through
`0015` cleanly, which is exactly what the container does on boot. Production is
fine; it is only the local dev database that is in an odd state.

---

## Cutover

Order matters. Nothing here touches the live site until the last step.

1. Deploy to the host. It gets a temporary URL like
   `new-aeon-production.up.railway.app`.
2. Run the content import against the production database.
3. Upload the media.
4. **Test on the temporary URL.** Both languages, the contact form, a job
   application with a real CV attached, and a handful of the legacy URLs —
   `/en/ClientSelected/STC` should land on `/en/clients/stc`.
5. Lower the DNS TTL on `new-aeon.com` to 300 seconds and **wait for the old TTL
   to expire** — usually a few hours. Do this the day before, not during the
   cutover.
6. Point the A/CNAME record at the new host. Issue the TLS certificate for
   `new-aeon.com` and `www.new-aeon.com`.
7. **Leave the old IIS server running for at least a week.** Some resolvers
   ignore TTLs. If anything is wrong, reverting the DNS record is the rollback —
   which is only true while the old server is still up.

---

## Before you go live

- [ ] **Rotate the legacy database credentials.** `NewAeonWebsite/Web.config`
      holds three sets in plain text — a live server, a staging one, and a local
      `sa` account. The specifics stay in that file and are deliberately not
      repeated here, so this document is safe to share. They have been sitting
      unencrypted on disk, so treat them as compromised either way.
- [ ] **Decide about the 8.1 MB hero GIF.** It exceeds the 8 MB media cap, so
      the home slider currently shows two slides instead of three. Converting it
      to animated WebP is the cleanest fix — it is also 8 MB before anything
      else on the page loads, so it is worth shrinking regardless.
- [ ] **Write the privacy policy.** The legacy page has been serving the literal
      placeholder "this is resource for Privacy Policy". It was deliberately not
      copied over.
- [ ] **Look at the navigation.** The old site used a hamburger opening a
      full-height drawer headed "M✕NU"; the new one uses a horizontal bar with
      the same nine items and the same labels. It is the one place the look
      deliberately differs.
- [ ] Set `comingSoonMode` in Settings if you want a holding page while you
      review — signed-in staff bypass it.

---

## After the DNS switches

- Submit `https://new-aeon.com/sitemap.xml` in Google Search Console. It is
  generated from the CMS, so it stays current on its own.
- Watch **Coverage → Not found (404)** for two or three weeks. Anything that
  turns up is a legacy URL the rule did not predict — add it at
  **Admin → Redirects**, which tracks a hit count per rule so you can see which
  old links people are still following.
- The 241 indexed URLs were verified against the running build before launch, so
  a 404 there means a link that was never in the sitemap. That is what the
  redirect table is for.
- Keep the SQL Server backup somewhere safe and offline until you are certain
  nothing is missing, then delete the working copies:
  ```bash
  docker compose -f migration/docker-compose.legacy.yml down -v
  rm -rf migration/legacy-db migration/out
  ```
  They hold 5,578 customer enquiries and 192 job applications.

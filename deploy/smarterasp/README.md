# Deploying to SmarterASP.NET

You can host this on the account you already have. SmarterASP runs Node.js
through IIS and offers PostgreSQL 18, which is the whole stack this needs — the
site does not have to move.

The old ASP.NET site and the new one can sit side by side until you switch,
because they are different applications under the same account.

---

## How it runs

IIS's **httpPlatformHandler** starts `node server.js`, gives it a private port
in `%HTTP_PLATFORM_PORT%`, and reverse-proxies every request to it. Next.js
standalone output produces exactly that `server.js`, and it already reads
`process.env.PORT` — so the two fit with no adapter. IIS restarts the process
if it dies.

There is no `npm install` on the server. You upload `node_modules` as part of
the package, which is why the build script exists.

---

## Before you start

In the SmarterASP control panel, check three things:

1. **Hosting Manager → Node.js** — enable it. Note the Node version offered;
   this needs **Node 18.18 or newer** (20+ preferred).
2. **Database → PostgreSQL** — create a database. Note the connection details
   and make sure **remote connections** are allowed; you will load the content
   from your own machine.
3. **Database → MSSQL** — leave the old site's database alone. Nothing here
   touches it, and it is your rollback.

---

## 1. Set up the database

From your laptop, with `DATABASE_URL` pointing at the new PostgreSQL:

```bash
cd "New-aeon CMS - 2026"
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"

npx drizzle-kit migrate      # creates the schema, 0000 → 0015
```

A fresh database replays the whole migration chain cleanly. (Your *local* dev
database was built with `db:push` and has an empty ledger, so this command will
not run against that one — that is a local-only quirk, not a problem here.)

## 2. Load the content

Still from your laptop, still pointed at the remote database:

```bash
npm run migrate:legacy -- --dry-run    # read the report first
npm run migrate:legacy
npm run migrate:site
```

These read `migration/out/*.json`, which is on your machine, so they must run
locally. If you archived the legacy folder, move it back first — see
`~/Desktop/new-aeon-legacy-archive/README.md`.

## 3. Build the upload package

```bash
export NEXT_PUBLIC_APP_URL=https://new-aeon.com
./deploy/smarterasp/build-package.sh
```

`NEXT_PUBLIC_APP_URL` is **baked in at build time** — it ends up in `og:image`,
canonical tags and the sitemap. The script refuses to run without it for that
reason. Set it to the real domain even though you will test on a temporary URL
first.

The script does three things `next build` does not:

- copies `.next/static` and `public/` in, which standalone omits;
- replaces the **macOS** native binaries with **Windows** ones —
  `argon2` (password hashing, and a hard blocker: get this wrong and nobody can
  log in to the admin) and `sharp` (thumbnails, degrades gracefully);
- strips test suites, docs and the TypeScript compiler.

Output lands in `deploy/smarterasp/out/`, about **258 MB**, of which 168 MB is
the imported media.

## 4. Fill in the configuration

Edit `deploy/smarterasp/out/web.config` and replace every `REPLACE_ME`:

- `DATABASE_URL` — the PostgreSQL connection string
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — two *different* random strings,
  32+ characters. `openssl rand -base64 32`
- The `SMTP_*` values, or set `MAIL_DRIVER` to `log` for the first deploy so
  nothing tries to send mail while you are testing

## 5. Upload

FTP the **contents** of `deploy/smarterasp/out/` into your site root — the
folder where `web.config` belongs, usually `wwwroot`.

Two notes that will save you an hour:

- **`public/uploads` is 168 MB.** Upload it once. Later deploys only need
  `.next/`, `server.js` and any changed source — not the media, not
  `node_modules`.
- **Upload `web.config` last.** IIS restarts the app the moment it changes, so
  writing it first means the site tries to boot against a half-uploaded package.

## 6. First run

Visit `https://<your-temp-url>/setup` and create the administrator account.
That route seals itself permanently once an admin exists.

If the site does not come up, read `logs/node_*.log` in the site root — the
`web.config` turns on stdout logging precisely so that file exists.

---

## Switching the domain over

Nothing above touches new-aeon.com. When you are satisfied:

1. Lower the DNS TTL to 300 seconds **the day before**, and wait for the old
   TTL to expire.
2. Point the domain at the new application in the panel.
3. Issue TLS for `new-aeon.com` and `www.new-aeon.com`.
4. **Leave the old ASP.NET application in place for a week.** That is what
   makes the rollback a DNS change rather than a recovery.

---

## Troubleshooting

**502 / "The page cannot be displayed"**
The Node process is not starting. Read `logs/node_*.log`. Almost always a
missing environment variable — the app refuses to boot without the required
ones, deliberately, rather than starting in a half-configured state.

**The site loads but every image is broken**
`.next/static` did not upload, or `public/` did not. Both must be present.

**Admin login always fails, with correct credentials**
The `argon2` native binary. Check
`node_modules/argon2/prebuilds/win32-x64/` exists on the server. This is the
failure the build script exists to prevent.

**Uploads work but produce no thumbnails**
`sharp` could not load. Harmless — the storage layer treats it as optional and
the original file is stored either way.

**A legacy URL 404s**
All 241 indexed URLs were verified before launch, so this is a link that was
never in the sitemap. Add it at **Admin → Redirects**; it tracks a hit count so
you can see which old links people still follow.

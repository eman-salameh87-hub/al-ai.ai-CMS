// migration/seed-al-ai-nav.ts
//
// Fixes the header: it was rendering empty (no HOME/ABOUT/SERVICES/CONTACT
// links, small "al-ai" instead of the real logo) because the site's
// `navigation` menu, `settings.siteName` and `settings.logo` were never
// seeded — the Navbar component itself was already correct, it just had no
// admin-entered data to render. Editable afterwards in
// /admin/settings/navigation and /admin/settings.
//
// Source of truth: the reference index.html's header (.tt-main-menu-list)
// and footer (.tt-footer-widget "Services" column) — Services carries the
// same 6-item dropdown/list in both places.
//
//   npx tsx --env-file=.env migration/seed-al-ai-nav.ts --dry-run
//   npx tsx --env-file=.env migration/seed-al-ai-nav.ts
//
// IDEMPOTENT. Matches existing items by url and updates them; inserts any
// that don't exist yet.
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { navigation, settings } from '@/lib/db/schema';

const DRY_RUN = process.argv.includes('--dry-run');

const HEADER_ITEMS = [
  { label: 'Home', url: '/', order: 0 },
  { label: 'About', url: '/about', order: 1 },
  { label: 'Services', url: '/services', order: 2 },
  { label: 'Contact', url: '/contact', order: 3 },
];

// Same 6 links as index.html's Services submenu AND the footer's "Services"
// column. Slugs match the ones seed-al-ai-pages.ts already links to.
const SERVICE_ITEMS = [
  { label: 'Data Driven', url: '/data-driven', order: 0 },
  { label: 'Agentic AI & Multi-Agent Systems', url: '/agentic-ai-and-multi-agent-systems', order: 1 },
  { label: 'Conversational & Edge Analytics', url: '/conversational-and-edge-analytics', order: 2 },
  { label: 'Automated Decision-Making & BPA', url: '/automated-decision-making-and-bpa', order: 3 },
  { label: 'Polarization & Indoctrination', url: '/polarization-and-pre-indoctrination', order: 4 },
  { label: 'Behavioral Intelligence', url: '/behavioral-intelligence', order: 5 },
];

// Matches index.html's <footer> exactly (col 1 description, social icons,
// and mailto) — not placeholder copy.
const SITE_VALUES = {
  siteName: 'al-ai.ai',
  logo: '/al-ai-pages/al-ai.png',
  siteDescription:
    'A forward-thinking company that leverages artificial intelligence to automate tasks, improve operational efficiency, and drive smarter business decisions.',
  contactEmail: 'info@al-ai.ai',
  socialLinks: {
    facebook: 'https://www.facebook.com/newaeongroup/',
    instagram: 'https://www.instagram.com/newaeongroup/',
    linkedin: 'https://www.linkedin.com/company/new-aeon-digital',
    youtube: 'https://www.youtube.com/@newaeongroup8328',
    twitter: 'https://x.com/newaeongroup',
  },
};

async function seedSiteIdentity() {
  const [existing] = await db.select().from(settings).limit(1);

  if (DRY_RUN) {
    console.log(`   siteName -> "${SITE_VALUES.siteName}", logo -> "${SITE_VALUES.logo}"`);
    console.log(`   siteDescription, contactEmail, socialLinks -> set`);
    return;
  }

  if (existing) {
    await db.update(settings).set({ ...SITE_VALUES, updatedAt: new Date() }).where(eq(settings.id, 1));
  } else {
    await db.insert(settings).values({ id: 1, ...SITE_VALUES });
  }
  console.log(`   siteName -> "${SITE_VALUES.siteName}", logo -> "${SITE_VALUES.logo}"`);
  console.log(`   siteDescription, contactEmail, socialLinks -> set`);
}

/**
 * `header`: HEADER_ITEMS top-level, with SERVICE_ITEMS nested under
 * "Services" (index.html's header dropdown).
 *
 * `footer`: index.html's footer "Services" column is a FLAT list of the
 * same 6 links — no Home/About/Contact, and no "Services" parent row
 * (the footer never links to services.html itself). So the footer call
 * passes SERVICE_ITEMS directly as top-level items, not through the
 * childrenOf nesting header uses.
 */
async function seedNav(
  location: 'header' | 'footer',
  items: { label: string; url: string; order: number }[],
  opts: { childrenOf?: string; children?: typeof SERVICE_ITEMS } = {}
) {
  const existingRows = await db.select().from(navigation).where(eq(navigation.location, location)).orderBy(asc(navigation.order));

  async function upsert(item: { label: string; url: string; order: number }, parentId: string | null) {
    const match = existingRows.find((r) => r.url === item.url);

    if (DRY_RUN) {
      console.log(`   [${location}] ${match ? 'update' : 'insert'}  ${item.label.padEnd(34)} ${item.url}`);
      return match?.id ?? '(dry-run-id)';
    }

    if (match) {
      await db.update(navigation).set({ label: item.label, order: item.order, parentId, isActive: true }).where(eq(navigation.id, match.id));
      return match.id;
    }

    const [created] = await db
      .insert(navigation)
      .values({ label: item.label, url: item.url, order: item.order, location, parentId, isActive: true })
      .returning({ id: navigation.id });
    return created!.id;
  }

  const seededUrls = new Set<string>();

  for (const item of items) {
    const id = await upsert(item, null);
    seededUrls.add(item.url);

    if (opts.childrenOf && item.url === opts.childrenOf && opts.children) {
      for (const child of opts.children) {
        await upsert(child, DRY_RUN ? null : id);
        seededUrls.add(child.url);
      }
    }
  }

  // A previous version of this script seeded the FULL header shape
  // (Home/About/Services/Contact) into `footer` too — deactivate any of
  // those leftovers rather than leaving stale rows getNavigation('footer')
  // would still return.
  const stale = existingRows.filter((r) => !seededUrls.has(r.url) && r.isActive);
  for (const row of stale) {
    if (DRY_RUN) {
      console.log(`   [${location}] deactivate (stale)          ${row.url}`);
      continue;
    }
    await db.update(navigation).set({ isActive: false }).where(eq(navigation.id, row.id));
  }
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — nothing will be written ===\n' : '=== SEEDING al-ai.ai NAV + SITE IDENTITY ===\n');

  console.log('1. Site identity (name + logo)');
  await seedSiteIdentity();

  console.log('\n2. Header navigation (+ Services submenu)');
  await seedNav('header', HEADER_ITEMS, { childrenOf: '/services', children: SERVICE_ITEMS });

  console.log('\n3. Footer navigation (Services column, flat)');
  await seedNav('footer', SERVICE_ITEMS);

  console.log(`\n${DRY_RUN ? 'Dry run complete.' : 'Done.'} Refresh the site to see the header/footer.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

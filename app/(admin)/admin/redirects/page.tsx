// app/(admin)/admin/redirects/page.tsx
//
// The one-off URL moves. Most of the legacy address space is handled by a rule
// in middleware and never appears here — see lib/redirects/legacy-map.ts.
import { db } from '@/lib/db';
import { redirects } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { createTranslator } from '@/lib/admin-i18n';
import { RedirectsManager, type RedirectRow } from '@/components/admin/redirects-manager';

export const dynamic = 'force-dynamic';

export default async function RedirectsPage() {
  const locale = await getAdminLocale();
  const t = createTranslator(locale);

  const rows = await db
    .select()
    .from(redirects)
    // Most-hit first. The useful question about this table is which old links
    // people are still following, not which was added last.
    .orderBy(desc(redirects.hits), desc(redirects.createdAt))
    .limit(500);

  const initial: RedirectRow[] = rows.map((row) => ({
    id: row.id,
    source: row.source,
    destination: row.destination,
    statusCode: row.statusCode,
    isActive: row.isActive,
    hits: row.hits,
    // Dates cross to a Client Component, so they travel as ISO strings.
    lastHitAt: row.lastHitAt?.toISOString() ?? null,
    note: row.note,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('redirects.title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--admin-text-secondary)]">
          {t('redirects.intro')}
        </p>
      </div>

      <RedirectsManager initial={initial} />
    </div>
  );
}

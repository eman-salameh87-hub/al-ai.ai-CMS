// app/(admin)/admin/forms/page.tsx
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { formSubmissions } from '@/lib/db/schema';
import { and, count, desc, eq, isNull, isNotNull } from 'drizzle-orm';
import { verifyAccessToken } from '@/lib/auth/session';
import { createTranslator } from '@/lib/admin-i18n';
import { getAdminLocale } from '@/lib/admin-i18n/server';
import { FormsManager, type SubmissionRow } from '@/components/admin/forms-manager';
import { FORM_TYPES, type FormType } from '@/lib/forms/form-types';

export const dynamic = 'force-dynamic';

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; archived?: string }>;
}) {
  const params = await searchParams;
  const locale = await getAdminLocale();
  const t = createTranslator(locale);

  /*
   * Four tabs now, not two.
   *
   * Validated against FORM_TYPES rather than a chain of ternaries: an
   * unrecognised `?type=` falls back to the inbox instead of reaching a pgEnum
   * comparison, which Postgres rejects with 22P02 as a 500.
   */
  const requested = params.type ?? '';
  const type: FormType = (FORM_TYPES as readonly string[]).includes(requested)
    ? (requested as FormType)
    : 'contact';
  const showArchived = params.archived === '1';

  // Only an admin may delete outright; an editor archives instead.
  let canDelete = false;
  try {
    const token = (await cookies()).get('access_token')?.value;
    if (token) canDelete = (await verifyAccessToken(token)).role === 'admin';
  } catch {
    canDelete = false;
  }

  /*
   * Newsletter signups are a list, never a queue, so the archive filter only
   * applies to the types that ARE a queue — messages and applications. An
   * application is handled and then leaves the inbox, exactly like an enquiry.
   */
  const where =
    type === 'newsletter'
      ? eq(formSubmissions.type, 'newsletter')
      : and(
          eq(formSubmissions.type, type),
          showArchived
            ? isNotNull(formSubmissions.archivedAt)
            : isNull(formSubmissions.archivedAt)
        );

  const [rows, unread] = await Promise.all([
    db
      .select()
      .from(formSubmissions)
      .where(where)
      .orderBy(desc(formSubmissions.createdAt))
      .limit(200),
    db
      .select({ value: count() })
      .from(formSubmissions)
      .where(
        and(
          // The badge counts unread on the CURRENT tab, so an unread job
          // application is visible as one rather than being folded into the
          // contact count.
          eq(formSubmissions.type, type === 'newsletter' ? 'contact' : type),
          eq(formSubmissions.isRead, false),
          isNull(formSubmissions.archivedAt)
        )
      ),
  ]);

  // Dates cross to a Client Component, so they travel as ISO strings.
  const initial: SubmissionRow[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: r.payload ?? {},
    /*
     * The storage key is stripped here, not in the component.
     *
     * `attachments` is a jsonb array of FormAttachment, whose `key` addresses
     * the object in the bucket. This row crosses into a Client Component, so
     * anything left on it ships to the browser — and the key is the one field
     * that can delete an applicant's CV.
     */
    attachments:
      r.attachments?.map((a) => ({
        originalName: a.originalName,
        url: a.url,
        mimeType: a.mimeType,
        size: a.size,
        field: a.field,
      })) ?? null,
    pageSlug: r.pageSlug,
    locale: r.locale,
    isRead: r.isRead ?? false,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--admin-text)]">{t('forms.title')}</h1>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{t('forms.subtitle')}</p>
      </div>

      <FormsManager
        rows={initial}
        type={type}
        showArchived={showArchived}
        unreadCount={unread[0]?.value ?? 0}
        canDelete={canDelete}
      />
    </div>
  );
}

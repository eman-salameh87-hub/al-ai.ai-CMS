// app/api/content/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { content, contentI18n, contentTypes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api-guard';
import {
  checkStatusChange, resolveAuthorId, PERMISSION_MESSAGE,
} from '@/lib/content/permissions';
import type { ContentBlock } from '@/lib/blocks/types';
import { setContentTaxonomy } from '@/lib/content/taxonomy';
import { parseFieldDefinitions, validateFieldValues } from '@/lib/content/custom-fields';

const createContentSchema = z.object({
  /**
   * Any content type's slug, not just the three built-in ones.
   *
   * This was `z.enum(CONTENT_TYPE_SLUGS)` — page, post, resource — which meant
   * the API could not create an entry of a type an administrator had defined.
   * The whole point of `content_types.routePrefix` is that a custom type gets
   * real URLs, and this route refusing to write one made the feature
   * unreachable from anywhere but a hand-written SQL insert. It is also what
   * blocked bulk import: 95 client case studies have no built-in type to be.
   *
   * Nothing is loosened by this. The slug is looked up in `content_types`
   * below and a miss is still a 400 — the database was always the real
   * authority on which types exist, and the enum was a second, staler copy
   * of it.
   */
  type: z.string().trim().min(1).max(255),
  slug: z.string().trim().min(1).max(255),
  status: z.enum(['draft', 'published', 'archived']),
  authorId: z.string().uuid().optional(),
  featuredImage: z.string().max(2048).optional(),
  translations: z
    .array(
      z.object({
        locale: z.enum(['ar', 'en']),
        title: z.string().trim().min(1).max(255),
        excerpt: z.string().optional(),
        // Blocks are validated separately by the block registry; see
        // lib/blocks/. Kept permissive here so this route does not silently
        // reject valid block trees, but it is NOT `z.any()`.
        body: z.array(z.object({ type: z.string() }).passthrough()).optional(),
        metaTitle: z.string().max(255).optional(),
        metaDescription: z.string().optional(),
        ogImage: z.string().max(2048).optional(),
        noIndex: z.boolean().optional(),
      })
    )
    .min(1),
  categoryIds: z.array(z.string().uuid()).max(20).optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
  /**
   * Values for the fields this content type declares. Shape is checked against
   * the type's own definitions once it has been loaded — zod cannot validate
   * these without knowing which type they belong to.
   */
  customFieldValues: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, ['admin', 'editor', 'author']);
  if (!auth.ok) return auth.response;

  try {
    const validated = createContentSchema.parse(await request.json());

    // An author writes drafts; an editor decides what goes live. Refused
    // rather than downgraded, so nobody is told their page published when it
    // did not.
    const allowed = checkStatusChange(auth.user.role, validated.status, null);
    if (!allowed.ok) {
      return NextResponse.json(
        { success: false, error: { message: PERMISSION_MESSAGE[allowed.reason] } },
        { status: 403 }
      );
    }

    const contentType = await db
      .select()
      .from(contentTypes)
      .where(eq(contentTypes.slug, validated.type))
      .limit(1);

    const foundType = contentType[0];
    if (!foundType) {
      return NextResponse.json(
        { success: false, error: { message: `Content type "${validated.type}" not found` } },
        { status: 400 }
      );
    }

    /*
     * Custom field values, checked against THIS type's definitions.
     *
     * validateFieldValues returns only the keys the type declares, so an API
     * caller cannot use this jsonb column as free storage — without that
     * filtering the column rots into a junk drawer within a release.
     */
    const definitions = parseFieldDefinitions(foundType.customFields);
    const fields = validateFieldValues(definitions, validated.customFieldValues ?? {});
    if (!fields.ok) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', fields: fields.errors } },
        { status: 400 }
      );
    }

    const [newContent] = await db
      .insert(content)
      .values({
        typeId: foundType.id,
        slug: validated.slug,
        // Never the client's suggestion for an author: authorId was an
        // optional body field, so anyone could credit a colleague.
        authorId: resolveAuthorId(auth.user.role, validated.authorId, auth.user.sub),
        featuredImage: validated.featuredImage,
        // Only written when the type declares fields, so a page keeps a null
        // column rather than an empty object.
        customFieldValues: definitions.length ? fields.values : null,
        status: validated.status,
        publishedAt: validated.status === 'published' ? new Date() : null,
      })
      .returning();

    if (!newContent) {
      throw new Error('Insert returned no row');
    }

    await db.insert(contentI18n).values(
      validated.translations.map((t) => ({
        ...t,
        contentId: newContent.id,
        // Zod's passthrough() yields a structurally open object. Per-block
        // validation happens in the block registry; this narrows the column
        // type without weakening that check.
        body: (t.body ?? null) as ContentBlock[] | null,
      }))
    );

    await setContentTaxonomy(newContent.id, validated.categoryIds, validated.tagIds);

    return NextResponse.json({ success: true, data: { id: newContent.id } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { message: 'Validation failed', issues: error.issues } },
        { status: 400 }
      );
    }
    // Never return error.message here — it leaks Postgres constraint text.
    console.error('Content creation error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

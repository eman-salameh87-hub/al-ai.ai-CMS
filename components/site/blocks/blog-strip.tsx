'use client';

// components/site/blocks/blog-strip.tsx
//
// Posts with category buttons that filter the row in place — the legacy home
// page's blog section.
//
// The legacy version did this with an AJAX call per category
// (/GetBlogsByCategories/{id}), which meant a spinner on every click and a
// server round trip to hide six cards. The posts are already on the page here,
// so filtering is a `useMemo` and it is instant.
//
// NOTE ON THE LEGACY DATA: the restored database has zero rows in `Blogs` and
// zero in `BlogCategory`. This block is built and wired, and it renders nothing
// until someone publishes a post — which is the correct behaviour for an empty
// section, and better than the legacy page, which rendered its heading and an
// empty row.
import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { FilterOption, StripPost } from '@/lib/db/catalogue';

interface Props {
  posts: StripPost[];
  categories: FilterOption[];
  locale: 'ar' | 'en';
  title?: string;
  count: number;
  layout: 'grid' | 'carousel';
  allLabel: string;
}

export function BlogStrip({
  posts,
  categories,
  locale,
  title,
  count,
  layout,
  allLabel,
}: Props) {
  const [active, setActive] = useState<string | null>(null);

  const visible = useMemo(() => {
    const matching = active
      ? posts.filter((post) => post.categorySlugs.includes(active))
      : posts;
    return matching.slice(0, count);
  }, [posts, active, count]);

  // Nothing published: render nothing at all, rather than a heading over an
  // empty row.
  if (!posts.length) return null;

  return (
    <section className="py-16" data-test-id="blog-strip">
      <div className="mx-auto max-w-6xl px-4">
        {title && (
          <h2 className="font-display mb-8 text-center text-3xl font-bold text-site-ink md:text-4xl">
            {title}
          </h2>
        )}

        {/* One category is not a choice — the buttons only appear when they do
            something. */}
        {categories.length > 1 && (
          <div className="mb-10 flex flex-wrap justify-center gap-2">
            <FilterButton label={allLabel} on={!active} onClick={() => setActive(null)} />
            {categories.map((category) => (
              <FilterButton
                key={category.slug}
                label={category.name}
                on={active === category.slug}
                onClick={() => setActive(active === category.slug ? null : category.slug)}
              />
            ))}
          </div>
        )}

        <ul
          aria-live="polite"
          className={cn(
            layout === 'carousel'
              ? // Scroll-snap rather than a carousel library: it is a native
                // scroller, so it keeps working with a trackpad, a touch screen,
                // arrow keys and a screen reader, none of which a JS carousel
                // gets right for free.
                'flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [scrollbar-width:thin]'
              : 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3'
          )}
        >
          {visible.map((post) => (
            <li
              key={post.slug}
              className={cn(layout === 'carousel' && 'w-72 shrink-0 snap-start')}
            >
              <Link
                href={`/${locale}/blog/${post.slug}`}
                className="group block h-full overflow-hidden rounded-xl border border-site-line bg-site-surface-raised transition hover:border-[var(--site-accent)] hover:shadow-lg"
              >
                {post.featuredImage && (
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image
                      src={post.featuredImage}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                )}
                <div className="p-5">
                  <h3 className="font-semibold leading-snug text-site-ink group-hover:text-[var(--site-accent)]">
                    {post.title}
                  </h3>
                  {post.excerpt && (
                    <p className="mt-2 line-clamp-3 text-sm text-site-ink-muted">{post.excerpt}</p>
                  )}
                  {post.publishedAt && (
                    <time
                      dateTime={new Date(post.publishedAt).toISOString()}
                      className="mt-3 block text-xs text-site-ink-muted"
                    >
                      {new Date(post.publishedAt).toLocaleDateString(
                        locale === 'ar' ? 'ar-EG' : 'en-GB',
                        { year: 'numeric', month: 'long', day: 'numeric' }
                      )}
                    </time>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {/* A filter that empties the row must say so, not leave a blank space. */}
        {visible.length === 0 && (
          <p className="py-8 text-center text-site-ink-muted">
            {locale === 'ar' ? 'لا مقالات في هذا التصنيف بعد.' : 'No posts in this category yet.'}
          </p>
        )}
      </div>
    </section>
  );
}

function FilterButton({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'rounded-full border px-5 py-2 text-sm transition',
        on
          ? 'border-[var(--site-accent)] bg-[var(--site-accent)] font-semibold text-[var(--site-accent-ink)]'
          : 'border-site-line text-site-ink-muted hover:border-[var(--site-accent)] hover:text-site-ink'
      )}
    >
      {label}
    </button>
  );
}

'use client';

// components/site/blocks/client-filter.tsx
//
// The Portfolio page's two-axis filter: category AND country, at once.
//
// WHY IT FILTERS IN THE BROWSER
// The legacy page filtered without a page load, and that is the behaviour being
// reproduced. The whole catalogue is 96 entries with their taxonomy slugs — a
// few kilobytes — so it is shipped once and narrowed in memory. Filtering on
// the server would mean a round trip per click for a data set smaller than the
// page's own CSS.
//
// The URL still changes. Filter state lives in the query string, so a filtered
// view can be linked, bookmarked, shared and reached with the back button —
// which the legacy page's jQuery filtering could not do.
import { useMemo, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { CatalogueEntry, FilterOption } from '@/lib/db/catalogue';

interface Props {
  entries: CatalogueEntry[];
  categories: FilterOption[];
  tags: FilterOption[];
  locale: 'ar' | 'en';
  /** Where an entry's detail page lives, e.g. "clients". */
  routePrefix: string | null;
  title?: string;
  text?: string;
  categoryLabel: string;
  countryLabel: string;
  allLabel: string;
  emptyLabel: string;
  moreLabel: string;
  columns: 3 | 4 | 5;
  pageSize: number;
}

const COLUMN_CLASS: Record<3 | 4 | 5, string> = {
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
};

/**
 * "12 results" / "١٢ نتيجة".
 *
 * Arabic has a dual and a plural that English does not, so this is a lookup
 * rather than an `s` appended to a noun. Numbers go through toLocaleString so
 * the Arabic page shows Arabic-Indic digits, matching the rest of it.
 */
function countLabel(count: number, locale: 'ar' | 'en'): string {
  const number = count.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US');
  if (locale === 'ar') {
    if (count === 1) return 'نتيجة واحدة';
    if (count === 2) return 'نتيجتان';
    if (count <= 10) return `${number} نتائج`;
    return `${number} نتيجة`;
  }
  return `${number} ${count === 1 ? 'result' : 'results'}`;
}

export function ClientFilter({
  entries,
  categories,
  tags,
  locale,
  routePrefix,
  title,
  text,
  categoryLabel,
  countryLabel,
  allLabel,
  emptyLabel,
  moreLabel,
  columns,
  pageSize,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Read from the URL so a shared link opens on the same view.
  const activeCategory = params.get('category');
  const activeCountry = params.get('country');
  const [shown, setShown] = useState(pageSize);

  const setFilter = useCallback(
    (key: 'category' | 'country', value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);

      const query = next.toString();
      // scroll: false — the controls are above the grid, and jumping to the top
      // of the document on every click makes the filter feel broken.
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      setShown(pageSize);
    },
    [params, pathname, router, pageSize]
  );

  const filtered = useMemo(() => {
    if (!activeCategory && !activeCountry) return entries;
    return entries.filter((entry) => {
      // AND across the two axes, OR within one. "Banking in the UAE" is the
      // question the legacy page answered, and it is the only reading that
      // makes two filter groups useful.
      const categoryOk = !activeCategory || entry.categorySlugs.includes(activeCategory);
      const countryOk = !activeCountry || entry.tagSlugs.includes(activeCountry);
      return categoryOk && countryOk;
    });
  }, [entries, activeCategory, activeCountry]);

  const visible = filtered.slice(0, shown);

  return (
    <section className="py-12" data-test-id="client-filter">
      {(title || text) && (
        <header className="mx-auto mb-10 max-w-3xl px-4 text-center">
          {title && (
            <h2 className="font-display text-3xl font-bold text-site-ink md:text-4xl">{title}</h2>
          )}
          {text && <p className="mt-4 text-site-ink-muted">{text}</p>}
        </header>
      )}

      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-8 space-y-4">
          <FilterGroup
            label={categoryLabel}
            options={categories}
            active={activeCategory}
            allLabel={allLabel}
            onSelect={(value) => setFilter('category', value)}
          />
          <FilterGroup
            label={countryLabel}
            options={tags}
            active={activeCountry}
            allLabel={allLabel}
            onSelect={(value) => setFilter('country', value)}
          />
        </div>

        {/*
          A live region, so the result of a filter click is announced. Without
          it a screen-reader user clicks a button and is told nothing at all —
          the grid simply changes somewhere below them.
        */}
        <p aria-live="polite" className="mb-6 text-sm text-site-ink-muted">
          {filtered.length === 0 ? emptyLabel : countLabel(filtered.length, locale)}
        </p>

        {filtered.length > 0 && (
          <ul className={cn('grid gap-4', COLUMN_CLASS[columns])}>
            {visible.map((entry) => {
              const href = routePrefix ? `/${locale}/${routePrefix}/${entry.slug}` : null;

              const card = (
                <div className="group relative flex h-32 items-center justify-center overflow-hidden rounded-lg border border-site-line bg-site-surface-raised p-4 transition hover:border-[var(--site-accent)] hover:shadow-md">
                  {entry.featuredImage ? (
                    <Image
                      src={entry.featuredImage}
                      // The entry's own name. For a client logo that is exactly
                      // the right alt text.
                      alt={entry.title}
                      width={200}
                      height={100}
                      className="max-h-full w-auto object-contain transition group-hover:scale-105"
                    />
                  ) : (
                    <span className="text-center text-sm font-medium text-site-ink-muted">
                      {entry.title}
                    </span>
                  )}
                </div>
              );

              return (
                <li key={entry.slug}>
                  {href ? (
                    <Link href={href} className="block" title={entry.title}>
                      {card}
                    </Link>
                  ) : (
                    card
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {filtered.length > visible.length && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setShown((n) => n + pageSize)}
              className="rounded-full bg-[var(--site-accent)] px-8 py-3 text-sm font-bold text-[var(--site-accent-ink)] transition hover:opacity-90"
            >
              {moreLabel}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function FilterGroup({
  label,
  options,
  active,
  allLabel,
  onSelect,
}: {
  label: string;
  options: FilterOption[];
  active: string | null;
  allLabel: string;
  onSelect: (value: string | null) => void;
}) {
  // A group with nothing to choose between is not a control. The legacy page
  // rendered both headings unconditionally, so a site with no countries showed
  // an empty "Countries" row.
  if (options.length === 0) return null;

  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-site-ink-muted">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        <Chip label={allLabel} on={!active} onClick={() => onSelect(null)} />
        {options.map((option) => (
          <Chip
            key={option.slug}
            label={option.name}
            count={option.count}
            on={active === option.slug}
            // Clicking the active chip clears it, which is what people expect
            // from a chip and saves hunting for the "All" button.
            onClick={() => onSelect(active === option.slug ? null : option.slug)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Chip({
  label,
  count,
  on,
  onClick,
}: {
  label: string;
  count?: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // aria-pressed, not just a colour change: the selected state has to be
      // available to assistive technology, not only visible.
      aria-pressed={on}
      className={cn(
        'rounded-full border px-4 py-1.5 text-sm transition',
        on
          ? 'border-[var(--site-accent)] bg-[var(--site-accent)] font-semibold text-[var(--site-accent-ink)]'
          : 'border-site-line text-site-ink-muted hover:border-[var(--site-accent)] hover:text-site-ink'
      )}
    >
      {label}
      {typeof count === 'number' && <span className="ms-1.5 opacity-60">{count}</span>}
    </button>
  );
}

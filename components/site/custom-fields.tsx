// components/site/custom-fields.tsx
//
// Renders an entry's custom field values on its public page.
//
// Without this, `content.custom_field_values` is a column the migration fills
// and nobody ever sees — 15 field definitions across 121 entries, including
// five real YouTube videos on the advanced services and an inner-page image on
// every one of the ten services.
//
// WHERE EACH FIELD GOES IS DECLARED, NOT GUESSED
// A renderer that special-cased `innerImage` and `videoLink` by name would put
// the meaning of a field in a component instead of in its definition, and an
// editor who added `bannerImage` would get nothing and no explanation. The
// placement comes from `field.display` — see lib/content/custom-fields.ts.
import Image from 'next/image';
import {
  displayableFields, embeddableVideo, fieldLabel, fieldValue,
  type FieldDefinition, type FieldValue,
} from '@/lib/content/custom-fields';
import { youTubeEmbedUrl, youTubeId } from '@/lib/blocks/youtube';

interface Props {
  definitions: FieldDefinition[];
  values: unknown;
  locale: 'ar' | 'en';
}

/**
 * The banner image, for above the body.
 *
 * Separate export from the details list because the two go in different places
 * on the page and the caller decides the order — a banner between the title and
 * the body, the details after it.
 */
export function CustomFieldBanner({ definitions, values }: Omit<Props, 'locale'>) {
  const { banner } = displayableFields(definitions, values);
  if (!banner) return null;

  const src = fieldValue(values, banner.key);
  if (typeof src !== 'string' || !src) return null;

  return (
    <figure className="mb-8 overflow-hidden rounded-xl">
      <Image
        src={src}
        /*
         * Empty alt, and no locale needed.
         *
         * The field's label describes what the slot is FOR — "Inner page
         * image" — which is not a description of the picture. Using it as alt
         * text would announce the CMS's own field name to a screen reader.
         * The legacy data carries no alt text for these (the
         * `ImagesDescreption` table that was meant to hold it does not exist
         * in the database), so decorative is the honest answer.
         */
        alt=""
        width={1200}
        height={600}
        sizes="(max-width: 896px) 100vw, 896px"
        className="h-auto w-full object-cover"
        aria-hidden="true"
      />
    </figure>
  );
}

/** The labelled rows and embeds, for under the body. */
export function CustomFieldDetails({ definitions, values, locale }: Props) {
  const { inline } = displayableFields(definitions, values);
  if (!inline.length) return null;

  // A video gets a section of its own; the rest share a definition list.
  const videos = inline.filter(({ value }) => embeddableVideo(value));
  const rows = inline.filter(({ value }) => !embeddableVideo(value));

  return (
    <div className="mt-10 space-y-8">
      {videos.map(({ field, value }) => (
        <VideoField key={field.key} field={field} value={value} locale={locale} />
      ))}

      {rows.length > 0 && (
        <dl className="divide-y divide-site-line border-y border-site-line">
          {rows.map(({ field, value }) => (
            <div key={field.key} className="grid gap-1 py-3 sm:grid-cols-3">
              <dt className="text-sm font-medium text-site-ink-muted">
                {fieldLabel(field, locale)}
              </dt>
              <dd className="text-site-ink sm:col-span-2">
                <FieldValueView field={field} value={value} locale={locale} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function VideoField({
  field,
  value,
  locale,
}: {
  field: FieldDefinition;
  value: FieldValue;
  locale: 'ar' | 'en';
}) {
  const url = String(value);

  /*
   * YouTube goes through youTubeEmbedUrl, which uses youtube-nocookie and is
   * the host already allowed by the CSP's frame-src. A Vimeo URL is used as
   * given — player.vimeo.com is also on that list.
   *
   * The legacy values are already in /embed/ form (as_VideoLink held
   * "https://www.youtube.com/embed/76J9hgMJcds"), so this normalises rather
   * than converts in most cases.
   */
  const id = youTubeId(url);
  const src = id ? youTubeEmbedUrl(id) : url;

  return (
    <figure>
      <figcaption className="mb-3 font-display text-lg font-bold text-site-ink">
        {fieldLabel(field, locale)}
      </figcaption>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-site-surface-inverted">
        <iframe
          src={src}
          title={fieldLabel(field, locale)}
          // No `allow="autoplay"`: a video that starts itself under body copy
          // is an interruption, not a feature.
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    </figure>
  );
}

function FieldValueView({
  field,
  value,
  locale,
}: {
  field: FieldDefinition;
  value: FieldValue;
  locale: 'ar' | 'en';
}) {
  switch (field.kind) {
    case 'image':
      return (
        <Image
          src={String(value)}
          alt=""
          width={400}
          height={220}
          className="h-auto max-w-[240px] rounded-lg"
          aria-hidden="true"
        />
      );

    case 'url': {
      const href = String(value);
      const external = /^https?:\/\//i.test(href);
      return (
        <a
          href={href}
          // rel is set whenever the link leaves the site, not only when it
          // opens a new tab: an external link should not hand over the opener.
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="break-all text-[var(--site-accent)] underline"
          dir="ltr"
        >
          {href}
        </a>
      );
    }

    case 'boolean':
      // Only ever reached for `true` — displayableFields drops false, because
      // "Featured: No" tells a visitor nothing.
      return <span>{locale === 'ar' ? 'نعم' : 'Yes'}</span>;

    case 'number':
      return <span>{Number(value).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')}</span>;

    case 'select': {
      // The option's translated label, not the stored value. `sa` is a key,
      // not something to show a visitor.
      const option = field.options?.find((o) => o.value === String(value));
      const label = option
        ? locale === 'ar'
          ? option.label.ar || option.label.en
          : option.label.en
        : String(value);
      return <span>{label}</span>;
    }

    default:
      // text and textarea. `whitespace-pre-line` so a textarea's line breaks
      // survive, since the value is plain text and React escapes it.
      return <span className="whitespace-pre-line">{String(value)}</span>;
  }
}

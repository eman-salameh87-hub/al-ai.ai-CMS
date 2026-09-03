'use client';

// components/admin/blocks/legacy-editors.tsx
//
// Editors for the five blocks the new-aeon.com rebuild needed and this CMS had
// no equivalent for: the video hero, the client logo strip, the filterable blog
// strip, the two-axis client grid, and the application form.
//
// In their own module rather than in block-editors.tsx, which is already 900
// lines and dispatches every other type. BlockEditor keeps the `case` labels —
// they are the seam tests/block-editors-coverage.test.ts parses — and delegates
// the bodies here.
import { ItemsEditor, MiniField, MiniSelect } from './items-editor';
import { MediaField } from '../media-field';
import { MAX_VIDEO_BYTES, formatBytes } from '@/lib/media/limits';
import { isSafeUrl } from '@/lib/blocks/defaults';
import type { ContentBlock } from '@/lib/blocks/types';
import { useT } from '../i18n-provider';

type Narrow<K extends ContentBlock['type']> = Extract<ContentBlock, { type: K }>;

interface Props<K extends ContentBlock['type']> {
  block: Narrow<K>;
  onChange: (block: ContentBlock) => void;
}

/** Shared shell so every editor here has the same rhythm. */
function Rows({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

/** A note the editor should read before the field it applies to. */
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs leading-relaxed text-[var(--admin-text-muted)]">{children}</p>
  );
}

export function VideoHeroEditor({ block, onChange }: Props<'video-hero'>) {
  const t = useT();
  return (
    <Rows>
      <MediaField
        label={t('be.videoFile')}
        hint={`${t('be.maxSize')} ${formatBytes(MAX_VIDEO_BYTES)}`}
        value={block.src}
        onChange={(src) => onChange({ ...block, src })}
        testId="video-hero-src"
        preview={false}
      />

      {/*
        Poster is required by the type, and the copy says why rather than just
        marking it mandatory: a visitor who has asked their system for reduced
        motion is shown this INSTEAD of the video, so an empty poster is a blank
        hero for them, not a cosmetic gap.
      */}
      <MediaField
        label={t('be.posterRequired')}
        hint={t('be.posterWhy')}
        value={block.poster}
        onChange={(poster) => onChange({ ...block, poster })}
        testId="video-hero-poster"
      />
      {!block.poster && <Hint>{t('be.posterMissing')}</Hint>}

      <MiniSelect
        label={t('be.height')}
        value={block.height}
        options={[
          { value: 'viewport', label: t('be.heightViewport') },
          { value: 'tall', label: t('be.heightTall') },
          { value: 'medium', label: t('be.heightMedium') },
        ]}
        onChange={(height) =>
          onChange({ ...block, height: height as Narrow<'video-hero'>['height'] })
        }
        testId="video-hero-height"
      />

      <div className="grid grid-cols-2 gap-3">
        <MiniField
          label={t('be.eyebrow')}
          value={block.eyebrow ?? ''}
          onChange={(eyebrow) => onChange({ ...block, eyebrow: eyebrow || undefined })}
        />
        <MiniField
          label={t('be.title')}
          value={block.title ?? ''}
          onChange={(title) => onChange({ ...block, title: title || undefined })}
        />
      </div>

      <MiniField
        label={t('be.text')}
        value={block.text ?? ''}
        onChange={(text) => onChange({ ...block, text: text || undefined })}
      />

      <div className="grid grid-cols-2 gap-3">
        <MiniField
          label={t('be.buttonText')}
          value={block.buttonText ?? ''}
          onChange={(buttonText) => onChange({ ...block, buttonText: buttonText || undefined })}
        />
        <MiniField
          label={t('be.buttonUrl')}
          value={block.buttonUrl ?? ''}
          ltr
          onChange={(buttonUrl) => onChange({ ...block, buttonUrl: buttonUrl || undefined })}
        />
      </div>
      {block.buttonUrl && !isSafeUrl(block.buttonUrl) && <Hint>{t('be.urlUnsafe')}</Hint>}

      <MiniField
        label={t('be.skipLabel')}
        value={block.skipLabel ?? ''}
        onChange={(skipLabel) => onChange({ ...block, skipLabel: skipLabel || undefined })}
      />

      <label className="flex items-center gap-2 text-sm text-[var(--admin-text-secondary)]">
        <input
          type="checkbox"
          checked={block.loop ?? true}
          onChange={(e) => onChange({ ...block, loop: e.target.checked })}
        />
        {t('be.loop')}
      </label>
    </Rows>
  );
}

export function LogoCarouselEditor({ block, onChange }: Props<'logo-carousel'>) {
  const t = useT();
  const usingType = Boolean(block.fromContentType);

  return (
    <Rows>
      <MiniField
        label={t('be.title')}
        value={block.title ?? ''}
        onChange={(title) => onChange({ ...block, title: title || undefined })}
      />

      {/*
        Two sources, and only one can win. Pulling from a content type keeps the
        strip in step with the catalogue — a new client case study appears here
        with no second edit — which is what the legacy home page did. A hand
        list is for logos that are not case studies.
      */}
      <MiniField
        label={t('be.logosFromType')}
        value={block.fromContentType ?? ''}
        ltr
        placeholder="client"
        onChange={(value) => onChange({ ...block, fromContentType: value || undefined })}
      />
      <Hint>{usingType ? t('be.logosFromTypeOn') : t('be.logosFromTypeOff')}</Hint>

      {!usingType && (
        <ItemsEditor
          items={block.logos}
          onChange={(logos) => onChange({ ...block, logos })}
          createItem={() => ({ src: '', alt: '' })}
          addLabel={t('be.addLogo')}
          emptyLabel={t('be.noLogos')}
          testId="logo-carousel-items"
          max={80}
          renderItem={(item, update) => (
            <div className="space-y-2">
              <MediaField
                label={t('be.image')}
                value={item.src}
                onChange={(src) => update({ src })}
                testId="logo-src"
              />
              <MiniField
                label={t('be.altText')}
                value={item.alt}
                onChange={(alt) => update({ alt })}
              />
              <MiniField
                label={t('be.linkUrl')}
                value={item.url ?? ''}
                ltr
                onChange={(url) => update({ url: url || undefined })}
              />
            </div>
          )}
        />
      )}

      <MiniField
        label={t('be.marqueeSeconds')}
        type="number"
        value={block.speedSeconds}
        onChange={(value) => {
          // Clamped, and 0 is meaningful: it turns the marquee off and renders
          // a static wrapping grid, which is the accessible fallback and also
          // what a short list should do anyway.
          const seconds = Math.max(0, Math.min(240, Number(value) || 0));
          onChange({ ...block, speedSeconds: seconds });
        }}
      />
      <Hint>{block.speedSeconds === 0 ? t('be.marqueeOff') : t('be.marqueeOn')}</Hint>

      <label className="flex items-center gap-2 text-sm text-[var(--admin-text-secondary)]">
        <input
          type="checkbox"
          checked={block.grayscale ?? false}
          onChange={(e) => onChange({ ...block, grayscale: e.target.checked })}
        />
        {t('be.grayscale')}
      </label>
    </Rows>
  );
}

export function BlogStripEditor({ block, onChange }: Props<'blog-strip'>) {
  const t = useT();
  return (
    <Rows>
      <MiniField
        label={t('be.title')}
        value={block.title ?? ''}
        onChange={(title) => onChange({ ...block, title: title || undefined })}
      />

      <MiniField
        label={t('be.count')}
        type="number"
        value={block.count}
        onChange={(value) =>
          onChange({ ...block, count: Math.max(1, Math.min(24, Number(value) || 1)) })
        }
      />

      <MiniSelect
        label={t('be.layout')}
        value={block.layout}
        options={[
          { value: 'grid', label: t('be.layoutGrid') },
          { value: 'carousel', label: t('be.layoutCarousel') },
        ]}
        onChange={(layout) =>
          onChange({ ...block, layout: layout as Narrow<'blog-strip'>['layout'] })
        }
        testId="blog-strip-layout"
      />

      {/*
        Blank means "every category that has published posts", which is what the
        legacy page did and what an editor almost always wants — a new category
        then appears as a filter with no second edit.
      */}
      <MiniField
        label={t('be.categorySlugs')}
        value={(block.categories ?? []).join(', ')}
        ltr
        placeholder="branding, seo"
        onChange={(value) => {
          const slugs = value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          onChange({ ...block, categories: slugs.length ? slugs : undefined });
        }}
      />
      <Hint>{block.categories?.length ? t('be.categoriesFixed') : t('be.categoriesAuto')}</Hint>

      <MiniField
        label={t('be.showAllLabel')}
        value={block.showAllLabel ?? ''}
        onChange={(showAllLabel) =>
          onChange({ ...block, showAllLabel: showAllLabel || undefined })
        }
      />
    </Rows>
  );
}

export function ClientFilterEditor({ block, onChange }: Props<'client-filter'>) {
  const t = useT();
  return (
    <Rows>
      <MiniField
        label={t('be.contentTypeKey')}
        value={block.contentType}
        ltr
        placeholder="client"
        onChange={(contentType) => onChange({ ...block, contentType })}
      />
      <Hint>{t('be.contentTypeKeyHint')}</Hint>

      <MiniField
        label={t('be.title')}
        value={block.title ?? ''}
        onChange={(title) => onChange({ ...block, title: title || undefined })}
      />
      <MiniField
        label={t('be.text')}
        value={block.text ?? ''}
        onChange={(text) => onChange({ ...block, text: text || undefined })}
      />

      {/*
        The two axes are labelled here rather than hardcoded, because they are
        only "category" and "country" for this one catalogue. The block is the
        generic two-axis grid; the words are the editor's.
      */}
      <div className="grid grid-cols-2 gap-3">
        <MiniField
          label={t('be.categoryFilterLabel')}
          value={block.categoryLabel ?? ''}
          onChange={(categoryLabel) =>
            onChange({ ...block, categoryLabel: categoryLabel || undefined })
          }
        />
        <MiniField
          label={t('be.countryFilterLabel')}
          value={block.countryLabel ?? ''}
          onChange={(countryLabel) =>
            onChange({ ...block, countryLabel: countryLabel || undefined })
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MiniSelect
          label={t('be.columns')}
          value={String(block.columns)}
          options={[
            { value: '3', label: '3' },
            { value: '4', label: '4' },
            { value: '5', label: '5' },
          ]}
          onChange={(value) =>
            onChange({ ...block, columns: Number(value) as Narrow<'client-filter'>['columns'] })
          }
          testId="client-filter-columns"
        />
        <MiniField
          label={t('be.pageSize')}
          type="number"
          value={block.pageSize}
          onChange={(value) =>
            onChange({ ...block, pageSize: Math.max(4, Math.min(120, Number(value) || 24)) })
          }
        />
      </div>
    </Rows>
  );
}

export function ApplicationFormEditor({ block, onChange }: Props<'application-form'>) {
  const t = useT();
  return (
    <Rows>
      <MiniSelect
        label={t('be.applicationKind')}
        value={block.kind}
        options={[
          { value: 'career', label: t('be.applicationCareer') },
          { value: 'training', label: t('be.applicationTraining') },
        ]}
        onChange={(kind) =>
          onChange({ ...block, kind: kind as Narrow<'application-form'>['kind'] })
        }
        testId="application-form-kind"
      />
      <Hint>{t('be.applicationKindHint')}</Hint>

      <MiniField
        label={t('be.title')}
        value={block.title ?? ''}
        onChange={(title) => onChange({ ...block, title: title || undefined })}
      />
      <MiniField
        label={t('be.text')}
        value={block.text ?? ''}
        onChange={(text) => onChange({ ...block, text: text || undefined })}
      />

      {/*
        Optional. With it, the form offers a dropdown of that type's published
        entries — the open roles, or the available courses — so an application
        records what it is for. Without it, the applicant writes free text.
      */}
      <MiniField
        label={t('be.positionsFrom')}
        value={block.positionsFrom ?? ''}
        ltr
        placeholder="job"
        onChange={(value) => onChange({ ...block, positionsFrom: value || undefined })}
      />

      <div className="grid grid-cols-2 gap-3">
        <MiniField
          label={t('be.submitLabel')}
          value={block.submitLabel ?? ''}
          onChange={(submitLabel) => onChange({ ...block, submitLabel: submitLabel || undefined })}
        />
        <MiniField
          label={t('be.successMessage')}
          value={block.successMessage ?? ''}
          onChange={(successMessage) =>
            onChange({ ...block, successMessage: successMessage || undefined })
          }
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--admin-text-secondary)]">
        <input
          type="checkbox"
          checked={block.attachmentRequired ?? true}
          onChange={(e) => onChange({ ...block, attachmentRequired: e.target.checked })}
        />
        {t('be.attachmentRequired')}
      </label>
      <Hint>{t('be.attachmentTypes')}</Hint>
    </Rows>
  );
}

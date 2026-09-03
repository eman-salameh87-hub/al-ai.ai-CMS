// lib/blocks/types.ts
// Canonical ContentBlock union. Originally transcribed from a design document
// that has since been archived out of the repo; THIS file is the source of
// truth now, and lib/blocks/defaults.ts derives its lists from it rather than
// restating them.
//
// Blocks are persisted as JSON in `contentI18n.body` (jsonb) — adding a block
// type requires NO database migration. See lib/db/schema.ts.

/** One testimonial entry inside a `testimonial` block. */
export interface TestimonialItem {
  /** The testimonial text itself. Plain text — never rendered as HTML. */
  quote: string;
  /** Person giving the testimonial. */
  author: string;
  /** Job title / company. Optional. */
  role?: string;
  /** Absolute URL or site-relative path (e.g. `/uploads/avatar.jpg`). Optional. */
  avatar?: string;
  /** Whole stars, 1-5. Optional. */
  rating?: number;
}

export interface TestimonialBlock {
  type: 'testimonial';
  items: TestimonialItem[];
  /**
   * ASSUMPTION (beyond mega-prompt spec): grid width control, mirroring the
   * `columns` field that `feature-grid` already carries. Defaults to 3.
   */
  columns?: 1 | 2 | 3;
}

export type ContentBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string; anchor?: string }
  | { type: 'paragraph'; text: string; align?: 'left' | 'center' | 'right' | 'justify' }
  | { type: 'image'; src: string; alt: string; caption?: string; width?: number; height?: number; layout: 'full' | 'wide' | 'normal' }
  | { type: 'gallery'; images: { src: string; alt: string }[]; layout: 'grid' | 'masonry' | 'carousel' | 'slideshow' }
  | { type: 'video'; url: string; provider: 'youtube' | 'vimeo' | 'self'; poster?: string; autoplay?: boolean }
  | { type: 'quote'; text: string; author?: string; source?: string; style: 'bordered' | 'pull' }
  | { type: 'embed'; url: string; provider: 'instagram' | 'twitter' | 'tiktok' | 'facebook' }
  | { type: 'button'; text: string; url: string; variant: 'primary' | 'secondary' | 'outline' | 'ghost'; size: 'sm' | 'md' | 'lg'; fullWidth?: boolean }
  | { type: 'divider'; style: 'line' | 'space' | 'dots' | 'stars' }
  | { type: 'spacer'; height: number }
  | { type: 'html'; content: string }
  /**
   * Prose. The TipTap document is stored VERBATIM and treated as opaque —
   * we never walk its internals. Rendering goes through TipTap's own
   * generateHTML(), then through the sanitizer.
   *
   * This is why `body` is ContentBlock[] and NOT a TipTap doc: TipTap emits
   * prose nodes ({type:'paragraph', content:[{type:'text'}]}), while this
   * union describes layout sections. They collide on `type` names but have
   * different shapes, so one array cannot be both.
   */
  | { type: 'rich-text'; content: Record<string, unknown> }
  | { type: 'table'; rows: number; cols: number; data: string[][]; headerRow?: boolean }
  /**
   * Rotating hero slider. Independent of commerce: a slide is an image plus
   * optional words and one link, so it works on a content home page and on a
   * shop home page, and a slide can point at a product URL without this block
   * knowing what a product is.
   */
  | {
      type: 'slider';
      /**
       * Which placement's rules apply. See SLIDER_LIMITS in lib/blocks/slider:
       * `main` is the home hero (image or video, up to 5), `inner` is for
       * ordinary pages (images only, up to 2).
       */
      variant: 'main' | 'inner';
      slides: {
        /**
         * Chosen before anything is uploaded, because it decides what the
         * editor asks for: an image, a video file, or a YouTube link.
         */
        kind: 'image' | 'video' | 'youtube';
        /** Image URL, an uploaded video URL, or a YouTube link. */
        src: string;
        /** Still shown before a video paints, and instead of it when the
         *  visitor has asked for reduced motion. */
        poster?: string;
        alt?: string;
        /** Small label above the heading. */
        eyebrow?: string;
        title?: string;
        text?: string;
        buttonText?: string;
        buttonUrl?: string;
      }[];
      autoplay: boolean;
      /** Milliseconds per slide. Clamped by the editor and the component. */
      intervalMs: number;
      height: 'short' | 'medium' | 'tall';
    }
  /**
   * A list of files a reader can download — the point of a Resources page.
   * `url` points at /api/media/{id}/download so the browser saves the file
   * instead of opening a PDF in its viewer.
   */
  | {
      type: 'downloads';
      items: {
        title: string;
        url: string;
        /** Shown next to the title, e.g. "PDF · 2.4 MB". Set by the editor. */
        meta?: string;
      }[];
    }
  | { type: 'accordion'; items: { title: string; content: ContentBlock[] }[] }
  /**
   * Questions and answers, as plain text.
   *
   * Separate from `accordion`, which nests a block tree. FAQPage schema needs a
   * STRING answer, and extracting one from arbitrary blocks is lossy — but the
   * deeper reason is that a good FAQ answer is one or two sentences, and a
   * field that only accepts text is the one that produces them. An accordion
   * stays the right tool for collapsible sections that are not questions.
   */
  | { type: 'faq'; items: { question: string; answer: string }[] }
  | { type: 'tabs'; items: { label: string; content: ContentBlock[] }[] }
  | { type: 'cta'; title: string; text: string; button: { text: string; url: string }; backgroundImage?: string; overlay?: boolean }
  | { type: 'feature-grid'; items: { icon?: string; title: string; description: string }[]; columns: 2 | 3 | 4 }
  | TestimonialBlock
  | { type: 'team'; members: { name: string; role: string; bio?: string; photo?: string; social?: Record<string, string> }[] }
  | { type: 'stats'; items: { value: string; label: string; prefix?: string; suffix?: string }[] }
  | { type: 'timeline'; items: { date: string; title: string; description: string; icon?: string }[] }
  | { type: 'comparison'; items: { feature: string; values: Record<string, string | boolean> }[]; columns: string[] }
  | { type: 'pricing'; plans: { name: string; price: string; period?: string; features: string[]; cta: { text: string; url: string }; highlighted?: boolean }[] }
  | { type: 'map'; location: { lat: number; lng: number }; zoom?: number; marker?: string }
  | { type: 'contact-form'; fields: ('name' | 'email' | 'phone' | 'message' | 'subject')[]; submitLabel?: string; successMessage?: string }
  | { type: 'newsletter'; title: string; description?: string; buttonText?: string; privacyNote?: string }
  | { type: 'social-links'; platforms: ('facebook' | 'instagram' | 'twitter' | 'linkedin' | 'youtube' | 'tiktok')[]; style: 'icons' | 'buttons' | 'floating' }
  /**
   * A card row of recent entries.
   *
   * `contentType` was absent, and the block therefore queried EVERY published
   * content row regardless of type — on a site with a client catalogue and a
   * service catalogue it listed pages, clients, services and achievements
   * together as though they were one feed. Defaults to `post`, which is the
   * behaviour the name implies and what every existing use of it meant.
   */
  | {
      type: 'recent-posts';
      title: string;
      /** `content_types.slug`. Defaults to `post`. */
      contentType?: string;
      /** Category slug to scope to. Was declared and never read. */
      category?: string;
      count: number;
      layout: 'list' | 'grid' | 'carousel';
    }
  | { type: 'product-grid'; productIds: string[]; layout: 'grid' | 'list' | 'carousel' }
  /**
   * Full-bleed autoplay video, with a skip button — the first thing the old
   * new-aeon.com home page showed.
   *
   * Distinct from `video`, which is an embed in the reading flow with a poster
   * and controls. This is a background: muted, looping by default, no chrome,
   * sized to the viewport. Trying to serve both from one block meant one of
   * them was always wrong.
   *
   * ACCESSIBILITY IS PART OF THE BLOCK, NOT A LAYER OVER IT.
   * `poster` is required, because a visitor who has asked for reduced motion
   * gets the still instead of the video, and so does anyone whose connection
   * or browser will not play it. `skipLabel` exists because the legacy page had
   * a skip button and removing it would make the site slower to use, not
   * cleaner.
   */
  | {
      type: 'video-hero';
      /** Uploaded mp4/webm URL. */
      src: string;
      /** Shown before the video paints, and INSTEAD of it under reduced motion. */
      poster: string;
      /** Overlay words. Optional — the legacy hero had none. */
      eyebrow?: string;
      title?: string;
      text?: string;
      buttonText?: string;
      buttonUrl?: string;
      /** Lets a visitor jump past it. Falls back to a translated default. */
      skipLabel?: string;
      loop?: boolean;
      height: 'viewport' | 'tall' | 'medium';
    }
  /**
   * The client logo strip. A marquee of logos, each optionally linking to its
   * case study.
   *
   * Not a `gallery`: a gallery is a set of pictures to look at, sized to their
   * own aspect ratios. These are marks of varying shapes that must read as one
   * row of equal-weight items, which needs its own containment and its own
   * greyscale/colour treatment.
   */
  | {
      type: 'logo-carousel';
      title?: string;
      logos: { src: string; alt: string; url?: string }[];
      /** Pulls the logos from published entries of a content type instead. */
      fromContentType?: string;
      /** 0 disables the marquee and renders a static, wrapping grid. */
      speedSeconds: number;
      grayscale?: boolean;
    }
  /**
   * Posts with client-side category filtering — the legacy home page's blog
   * strip, where the category buttons swapped the list without a page load.
   *
   * Separate from `recent-posts`, which is a fixed list optionally scoped to one
   * category. The filtering is the feature here, and it changes what the block
   * has to fetch: every category with published posts, plus the posts, rather
   * than one query for N posts.
   */
  | {
      type: 'blog-strip';
      title?: string;
      /** How many posts to show per category view. */
      count: number;
      /** Category slugs offered as filters. Empty means every category in use. */
      categories?: string[];
      layout: 'grid' | 'carousel';
      showAllLabel?: string;
    }
  /**
   * The Portfolio page's two-axis filter: category AND country together.
   *
   * The migration assessment calls this out as a BUILD item, and the reason is
   * structural — the CMS has one hierarchical category tree plus flat tags, so
   * country lives in tags, and the shared archive template renders no filter
   * controls at all. This block is both the controls and the query.
   *
   * `contentType` rather than a hardcoded "client", so the same block serves
   * any catalogue that grows two axes later.
   */
  | {
      type: 'client-filter';
      /** `content_types.slug` whose entries are filtered. */
      contentType: string;
      title?: string;
      text?: string;
      /** Labels for the two filter groups, per locale, set by the editor. */
      categoryLabel?: string;
      countryLabel?: string;
      /** Grid density. */
      columns: 3 | 4 | 5;
      /** Entries per page. The legacy page showed all 95 at once. */
      pageSize: number;
    }
  /**
   * A job or training application, including its attachment.
   *
   * Deliberately NOT a variant of `contact-form`. It writes a different form
   * type, it accepts a file, and its fields are fixed rather than
   * author-configurable — an application whose CV field an editor can
   * accidentally remove is a form that silently stops working.
   */
  | {
      type: 'application-form';
      /** Decides the submission's form type and which fields render. */
      kind: 'career' | 'training';
      title?: string;
      text?: string;
      /** Offer a choice of open role or course, from that content type. */
      positionsFrom?: string;
      submitLabel?: string;
      successMessage?: string;
      /** Whether the attachment is compulsory. A CV usually is. */
      attachmentRequired?: boolean;
    }
  | { type: 'custom'; component: string; props: Record<string, unknown> };

/** Narrowing helper so BlockRenderer stays free of `any` casts. */
export function isTestimonialBlock(block: ContentBlock): block is TestimonialBlock {
  return block.type === 'testimonial';
}

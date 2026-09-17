// lib/blocks/custom-schemas.ts
//
// Field schemas for the `custom` block's props, keyed by component name
// (see lib/blocks/custom-registry.tsx for the registered names). Without
// this, editing a custom block's text/images meant hand-editing raw JSON in
// a textarea (grid-editors.tsx's PropsEditor) — workable for a developer,
// useless for a content editor. Each entry here describes real form fields;
// CustomEditor (grid-editors.tsx) renders them through
// components/admin/blocks/custom-field-editor.tsx's generic form when a
// schema exists for the block's component, and falls back to the raw JSON
// textarea for anything not listed here (a component registered without a
// schema, or a typo'd name).
//
// Field shape mirrors each component's own props interface exactly — see
// the matching file under components/site/blocks/ for the authoritative
// prop types. Keep the two in sync when either changes.
export type CustomFieldSchema =
  | { key: string; label: string; type: 'text'; optional?: boolean }
  | { key: string; label: string; type: 'textarea'; optional?: boolean }
  | { key: string; label: string; type: 'image'; optional?: boolean }
  | { key: string; label: string; type: 'select'; options: string[]; optional?: boolean }
  | { key: string; label: string; type: 'number'; optional?: boolean }
  | { key: string; label: string; type: 'string-list'; itemLabel: string }
  | { key: string; label: string; type: 'object-list'; itemLabel: string; fields: CustomFieldSchema[] }
  /** A single nested object (not a repeatable list) — e.g. contact-section's `details`. */
  | { key: string; label: string; type: 'object'; fields: CustomFieldSchema[] };

export const CUSTOM_BLOCK_SCHEMAS: Record<string, CustomFieldSchema[]> = {
  'about-intro': [
    { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'paragraphs', label: 'Paragraphs', type: 'string-list', itemLabel: 'Paragraph' },
    { key: 'boldParagraph', label: 'Closing bold line', type: 'textarea', optional: true },
  ],

  'page-header-banner': [
    { key: 'image', label: 'Banner image', type: 'image' },
    { key: 'alt', label: 'Image alt text', type: 'text' },
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', optional: true },
    { key: 'title', label: 'Title (use \\n for a line break)', type: 'textarea' },
    { key: 'text', label: 'Subtext', type: 'text', optional: true },
    { key: 'cover', label: 'Dark overlay strength (1-9, optional)', type: 'text', optional: true },
  ],

  'peach-hero': [{ key: 'src', label: 'Embed URL', type: 'text', optional: true }],

  'split-intro': [
    { key: 'variant', label: 'Layout', type: 'select', options: ['lead', 'sector'] },
    { key: 'heading', label: 'Heading (use \\n for a line break)', type: 'textarea' },
    { key: 'text', label: 'Text', type: 'textarea', optional: true },
    { key: 'buttonText', label: 'Button text', type: 'text', optional: true },
    { key: 'buttonUrl', label: 'Button URL', type: 'text', optional: true },
    { key: 'image', label: 'Image (lead layout only)', type: 'image', optional: true },
    { key: 'imageAlt', label: 'Image alt text', type: 'text', optional: true },
  ],

  'service-panels': [
    { key: 'variant', label: 'Layout', type: 'select', options: ['panels', 'cards'] },
    {
      key: 'items',
      label: 'Panels',
      type: 'object-list',
      itemLabel: 'Panel',
      fields: [
        { key: 'title', label: 'Title (use \\n for a line break)', type: 'textarea' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'buttonText', label: 'Button text', type: 'text', optional: true },
        { key: 'buttonUrl', label: 'Button URL', type: 'text', optional: true },
      ],
    },
    { key: 'stickySubtitle', label: 'Sticky eyebrow (cards layout only)', type: 'text', optional: true },
    { key: 'stickyTitle', label: 'Sticky title (cards layout only)', type: 'text', optional: true },
    { key: 'stickyText', label: 'Sticky text (cards layout only)', type: 'textarea', optional: true },
    { key: 'stickyButtonText', label: 'Sticky button text', type: 'text', optional: true },
    { key: 'stickyButtonUrl', label: 'Sticky button URL', type: 'text', optional: true },
  ],

  'sector-grid': [
    {
      key: 'items',
      label: 'Sectors',
      type: 'object-list',
      itemLabel: 'Sector',
      fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'image', label: 'Image', type: 'image' },
      ],
    },
  ],

  'compact-list': [
    {
      key: 'items',
      label: 'List items',
      type: 'object-list',
      itemLabel: 'Item',
      fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'image', label: 'Image', type: 'image' },
      ],
    },
  ],

  'round-cta': [
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', optional: true },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'text', label: 'Text', type: 'textarea', optional: true },
    { key: 'buttonText', label: 'Button text (use \\n for a line break)', type: 'textarea' },
    { key: 'buttonUrl', label: 'Button URL', type: 'text' },
  ],

  'heading-arrow': [{ key: 'heading', label: 'Heading', type: 'text' }],

  'content-section': [
    { key: 'heading', label: 'Heading (use \\n for a line break)', type: 'textarea' },
    { key: 'intro', label: 'Intro text', type: 'text', optional: true },
    { key: 'image', label: 'Image', type: 'image', optional: true },
    { key: 'imageAlt', label: 'Image alt text', type: 'text', optional: true },
    {
      key: 'columns',
      label: 'Columns',
      type: 'object-list',
      itemLabel: 'Column',
      fields: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'items', label: 'Bullet items', type: 'string-list', itemLabel: 'Item' },
      ],
    },
    { key: 'headingSpan', label: 'Heading column width (of 12, optional)', type: 'number', optional: true },
    { key: 'columnSpan', label: 'Bullet column width (of 12, optional)', type: 'number', optional: true },
  ],

  'contact-section': [
    { key: 'talkTitle', label: "Heading ('Let's Talk')", type: 'text' },
    { key: 'talkText', label: 'Intro text', type: 'textarea' },
    {
      key: 'details',
      label: 'Contact details',
      type: 'object',
      fields: [
        { key: 'address', label: 'Address', type: 'text' },
        { key: 'addressUrl', label: 'Address link (e.g. a Google Maps URL)', type: 'text', optional: true },
        { key: 'phone', label: 'Phone (displayed)', type: 'text' },
        { key: 'phoneHref', label: 'Phone link (e.g. tel:+123...)', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
      ],
    },
    {
      key: 'socials',
      label: 'Social links',
      type: 'object-list',
      itemLabel: 'Social link',
      fields: [
        {
          key: 'platform',
          label: 'Platform',
          type: 'select',
          options: ['facebook', 'instagram', 'linkedin', 'youtube', 'x', 'twitter'],
        },
        { key: 'url', label: 'URL', type: 'text' },
      ],
    },
    { key: 'formOptions', label: 'Topic dropdown options', type: 'string-list', itemLabel: 'Option' },
  ],
};

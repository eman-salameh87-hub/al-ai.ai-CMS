// tests/blocks/html-round-trip.test.ts
//
// The spreadsheet import/export path for content bodies goes
// blocks -> HTML -> blocks. Anything that does not survive that trip is data a
// bulk edit would destroy, so the two converters are tested together rather
// than only apart.
import { describe, it, expect } from 'vitest';
import { blocksToHtml, hasUnexportableBlocks } from '@/lib/blocks/to-html';
import { blocksFromHtml } from '@/lib/blocks/from-html';
import type { ContentBlock } from '@/lib/blocks/types';

const identity = { resolveImageSrc: (src: string) => src };

/** blocks -> HTML -> blocks. */
function roundTrip(blocks: ContentBlock[]): ContentBlock[] {
  return blocksFromHtml(blocksToHtml(blocks), identity);
}

describe('blocksToHtml', () => {
  it('renders the prose blocks as ordinary HTML', () => {
    expect(blocksToHtml([{ type: 'heading', level: 2, text: 'Title' }])).toBe('<h2>Title</h2>');
    expect(blocksToHtml([{ type: 'paragraph', text: 'Words' }])).toBe('<p>Words</p>');
    expect(blocksToHtml([{ type: 'divider', style: 'line' }])).toBe('<hr />');
  });

  it('escapes text so content cannot inject markup on export', () => {
    // A spreadsheet cell is opened in Excel and pasted into who knows what.
    // Emitting a raw <script> from a title would be a nasty surprise.
    const html = blocksToHtml([{ type: 'heading', level: 2, text: '<script>x</script>' }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('passes an html block through verbatim', () => {
    // Already HTML. Re-escaping it on export would corrupt stored content.
    expect(blocksToHtml([{ type: 'html', content: '<ul><li>a</li></ul>' }])).toBe(
      '<ul><li>a</li></ul>'
    );
  });

  it('marks a block that has no HTML form instead of mangling it', () => {
    const html = blocksToHtml([
      { type: 'client-filter', contentType: 'client', columns: 4, pageSize: 24 },
    ]);
    expect(html).toContain('<!--');
    expect(html).toContain('client-filter');
  });

  it('returns empty for an empty body', () => {
    expect(blocksToHtml([])).toBe('');
    expect(blocksToHtml(null)).toBe('');
  });
});

describe('hasUnexportableBlocks', () => {
  it('is false for a body of prose', () => {
    expect(
      hasUnexportableBlocks([
        { type: 'heading', level: 2, text: 'A' },
        { type: 'paragraph', text: 'B' },
        { type: 'image', src: '/a.jpg', alt: '', layout: 'wide' },
      ])
    ).toBe(false);
  });

  it('is true when a band or interactive block is present', () => {
    // THE guard that stops a spreadsheet re-import blanking the home page: a
    // slider exports as a comment, so a naive round trip would come back empty.
    expect(
      hasUnexportableBlocks([
        { type: 'slider', variant: 'main', slides: [], autoplay: true, intervalMs: 6000, height: 'tall' },
      ])
    ).toBe(true);
    expect(
      hasUnexportableBlocks([{ type: 'application-form', kind: 'career' }])
    ).toBe(true);
    expect(
      hasUnexportableBlocks([
        { type: 'client-filter', contentType: 'client', columns: 4, pageSize: 24 },
      ])
    ).toBe(true);
  });

  it('is false for an empty body', () => {
    expect(hasUnexportableBlocks([])).toBe(false);
    expect(hasUnexportableBlocks(null)).toBe(false);
  });
});

describe('round trip', () => {
  it('preserves a heading', () => {
    expect(roundTrip([{ type: 'heading', level: 3, text: 'Section' }])).toEqual([
      { type: 'heading', level: 3, text: 'Section' },
    ]);
  });

  it('preserves a plain paragraph', () => {
    expect(roundTrip([{ type: 'paragraph', text: 'Just words.' }])).toEqual([
      { type: 'paragraph', text: 'Just words.' },
    ]);
  });

  it('preserves an image and its src', () => {
    const blocks = roundTrip([
      { type: 'image', src: '/uploads/legacy/a.jpg', alt: 'Logo', layout: 'wide' },
    ]);
    expect(blocks[0]).toMatchObject({
      type: 'image',
      src: '/uploads/legacy/a.jpg',
      alt: 'Logo',
    });
  });

  it('preserves inline bold through rich-text', () => {
    const original: ContentBlock[] = [
      {
        type: 'rich-text',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
                { type: 'text', text: ' and plain' },
              ],
            },
          ],
        },
      },
    ];
    const html = blocksToHtml(original);
    expect(html).toContain('<strong>Bold</strong>');

    const back = blocksFromHtml(html, identity);
    expect(back[0]?.type).toBe('rich-text');
    // The words survive, which is the property that matters for a bulk edit.
    const text = JSON.stringify(back[0]);
    expect(text).toContain('Bold');
    expect(text).toContain('and plain');
    expect(text).toContain('bold');
  });

  it('preserves a link and its href', () => {
    const html = blocksToHtml([
      { type: 'button', text: 'Go', url: 'https://x.test', variant: 'primary', size: 'md' },
    ]);
    const back = blocksFromHtml(html, identity);
    expect(JSON.stringify(back)).toContain('https://x.test');
    expect(JSON.stringify(back)).toContain('Go');
  });

  it('escapes and un-escapes text symmetrically', () => {
    // A title containing an ampersand or an angle bracket must come back as
    // itself, not as an entity.
    const blocks = roundTrip([{ type: 'paragraph', text: 'Tom & Jerry <3' }]);
    expect(blocks[0]).toEqual({ type: 'paragraph', text: 'Tom & Jerry <3' });
  });

  it('drops a comment-marked block rather than resurrecting it wrongly', () => {
    // from-html ignores HTML comments, so an unexportable block round-trips to
    // nothing. That is why the importer refuses to overwrite such a body at
    // all — see the hasUnexportableBlocks guard in upsertContent.
    const blocks = roundTrip([{ type: 'application-form', kind: 'training' }]);
    expect(blocks).toEqual([]);
  });

  it('survives a body of mixed prose without loss', () => {
    const original: ContentBlock[] = [
      { type: 'heading', level: 2, text: 'SEO and Website improvement' },
      { type: 'paragraph', text: 'We started our work with them by doing the analysis.' },
      { type: 'image', src: '/uploads/legacy/stc1.jpg', alt: '', layout: 'wide' },
      { type: 'paragraph', text: 'Our scope of work was analyzing their channels.' },
    ];
    const back = roundTrip(original);
    expect(back.map((b) => b.type)).toEqual(['heading', 'paragraph', 'image', 'paragraph']);
    expect(back).toEqual(original);
  });
});

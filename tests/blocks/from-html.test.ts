// tests/blocks/from-html.test.ts
//
// Two layers. The unit cases pin the conversion rules; the corpus case runs the
// converter over every body in the restored legacy database and asserts the
// property that actually matters — that nothing lands in the `html` escape
// hatch, because a site imported as opaque HTML is a site editors cannot edit.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { blocksFromHtml, type ConversionNotice } from '@/lib/blocks/from-html';

const identity = { resolveImageSrc: (s: string) => s };

describe('blocksFromHtml', () => {
  it('returns nothing for empty input', () => {
    expect(blocksFromHtml('', identity)).toEqual([]);
    expect(blocksFromHtml(null, identity)).toEqual([]);
    expect(blocksFromHtml('   ', identity)).toEqual([]);
  });

  it('makes plain prose a paragraph block, not rich-text', () => {
    // The simpler block wins where it fits — an editor should not be handed a
    // rich-text editor for one sentence of plain text.
    expect(blocksFromHtml('<p>Hello world</p>', identity)).toEqual([
      { type: 'paragraph', text: 'Hello world' },
    ]);
  });

  it('collapses whitespace the way HTML rendering does', () => {
    expect(blocksFromHtml('<p>a   \n  b</p>', identity)).toEqual([
      { type: 'paragraph', text: 'a b' },
    ]);
  });

  it('promotes a paragraph with inline marks to rich-text', () => {
    const [block] = blocksFromHtml('<p><strong>Bold</strong> then plain</p>', identity);
    expect(block?.type).toBe('rich-text');
    expect(block).toEqual({
      type: 'rich-text',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
              { type: 'text', text: ' then plain' },
            ],
          },
        ],
      },
    });
  });

  it('keeps a <br> as a hardBreak rather than splitting the paragraph', () => {
    // 1,404 <br> tags in the corpus carry the author's line structure. Guessing
    // which ones mean "new paragraph" would silently reflow all of them.
    const [block] = blocksFromHtml('one<br />two', identity);
    expect(block?.type).toBe('rich-text');
    const content = (block as unknown as { content: { content: { content: unknown[] }[] } }).content;
    expect(content.content[0]?.content).toEqual([
      { type: 'text', text: 'one' },
      { type: 'hardBreak' },
      { type: 'text', text: 'two' },
    ]);
  });

  it('turns a link into a link mark carrying its href', () => {
    const [block] = blocksFromHtml('<p><a href="https://x.test">go</a></p>', identity);
    const content = (block as unknown as { content: { content: { content: { marks?: { type: string; attrs?: { href?: string } }[] }[] }[] } }).content;
    expect(content.content[0]?.content[0]?.marks?.[0]?.type).toBe('link');
    expect(content.content[0]?.content[0]?.marks?.[0]?.attrs?.href).toBe('https://x.test');
  });

  it('drops an anchor with no href but keeps its words', () => {
    expect(blocksFromHtml('<p><a href="">just text</a></p>', identity)).toEqual([
      { type: 'paragraph', text: 'just text' },
    ]);
  });

  it('unwraps a span without losing its text', () => {
    expect(blocksFromHtml('<p><span>inside</span></p>', identity)).toEqual([
      { type: 'paragraph', text: 'inside' },
    ]);
  });

  it('does not stack a repeated mark', () => {
    const [block] = blocksFromHtml('<p><strong><strong>x</strong></strong></p>', identity);
    const content = (block as unknown as { content: { content: { content: { marks?: unknown[] }[] }[] } }).content;
    expect(content.content[0]?.content[0]?.marks).toHaveLength(1);
  });

  it('breaks an image out of the prose around it', () => {
    const blocks = blocksFromHtml('<p>before<img src="/a.jpg" />after</p>', identity);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(blocks[1]).toMatchObject({ type: 'image', src: '/a.jpg', alt: '', layout: 'wide' });
  });

  it('rewrites an image src through the resolver', () => {
    const blocks = blocksFromHtml('<img src="/old/x.jpg" />', {
      resolveImageSrc: (s) => s.replace('/old/', '/uploads/'),
    });
    expect(blocks[0]).toMatchObject({ src: '/uploads/x.jpg' });
  });

  it('drops an image the resolver cannot place, and says so', () => {
    const notices: ConversionNotice[] = [];
    const blocks = blocksFromHtml('<p>text</p><img src="/gone.jpg" />', {
      resolveImageSrc: () => null,
      onNotice: (n) => notices.push(n),
    });
    // A broken frame is worse than an absent image, but it must be recorded.
    expect(blocks.map((b) => b.type)).toEqual(['paragraph']);
    expect(notices).toEqual([{ kind: 'unresolved-image', detail: '/gone.jpg' }]);
  });

  it('gives an image no invented alt text', () => {
    // A screen reader announcing a GUID is worse than silence.
    const blocks = blocksFromHtml('<img src="/7d40d10b-stc1.jpg" />', identity);
    expect(blocks[0]).toMatchObject({ alt: '' });
  });

  it('carries real dimensions through and ignores junk ones', () => {
    expect(blocksFromHtml('<img src="/a.jpg" width="800" height="600" />', identity)[0])
      .toMatchObject({ width: 800, height: 600 });
    expect(blocksFromHtml('<img src="/a.jpg" width="auto" />', identity)[0])
      .not.toHaveProperty('width');
  });

  it('makes a heading a heading block', () => {
    expect(blocksFromHtml('<h2>Title</h2>', identity)).toEqual([
      { type: 'heading', level: 2, text: 'Title' },
    ]);
    // The union stops at 4; h5/h6 clamp rather than vanish.
    expect(blocksFromHtml('<h6>Deep</h6>', identity)).toEqual([
      { type: 'heading', level: 4, text: 'Deep' },
    ]);
  });

  it('falls back to an html block for a table, and records it', () => {
    const notices: ConversionNotice[] = [];
    const blocks = blocksFromHtml('<table><tr><td>a</td></tr></table>', {
      ...identity,
      onNotice: (n) => notices.push(n),
    });
    // Flattening a table into prose loses the data. The escape hatch is right
    // here — and the notice is what stops it being used silently.
    expect(blocks[0]?.type).toBe('html');
    expect(notices[0]?.kind).toBe('html-fallback');
  });

  it('handles bare inline content with no block wrapper', () => {
    // The commonest real shape: "text<br />text<img /><br />text".
    const blocks = blocksFromHtml('lead<br />more<img src="/a.jpg" />tail', identity);
    expect(blocks.map((b) => b.type)).toEqual(['rich-text', 'image', 'paragraph']);
  });

  it('emits no empty blocks from padding markup', () => {
    // <p>&nbsp;</p><br /><br /> is endemic in WYSIWYG output.
    expect(blocksFromHtml('<p>&nbsp;</p><br /><br />', identity)).toEqual([]);
  });
});

/**
 * The corpus test. Skipped when the dump is absent, so the suite still runs on
 * a machine that has never restored the legacy backup.
 */
const CORPUS = join(process.cwd(), 'migration/out');
const HAVE_CORPUS = existsSync(join(CORPUS, 'Clients.json'));

describe.skipIf(!HAVE_CORPUS)('against the real legacy corpus', () => {
  const SPECS: [string, string[]][] = [
    ['WhatWeDo.json', ['we_DescEn', 'we_DescAr']],
    ['AdvancedServicesList.json', ['as_DescEn', 'as_DescAr']],
    ['Clients.json', ['clnt_DescEn', 'clnt_DescAr']],
    ['Achivements.json', ['Ach_DescEn', 'Ach_DescAr']],
  ];

  function convertAll() {
    const counts: Record<string, number> = {};
    let bodies = 0;
    for (const [file, columns] of SPECS) {
      const rows = JSON.parse(readFileSync(join(CORPUS, file), 'utf8')) as Record<string, string>[];
      for (const row of rows) {
        for (const column of columns) {
          const html = row[column];
          if (!html || !String(html).trim()) continue;
          bodies += 1;
          for (const block of blocksFromHtml(html, identity)) {
            counts[block.type] = (counts[block.type] ?? 0) + 1;
          }
        }
      }
    }
    return { counts, bodies };
  }

  it('converts every body without using the html escape hatch', () => {
    const { counts, bodies } = convertAll();
    expect(bodies).toBeGreaterThan(200);
    // THE point of item 05. If this ever goes above zero, someone has imported
    // content an editor cannot edit.
    expect(counts.html ?? 0).toBe(0);
  });

  it('emits the block types the corpus actually contains', () => {
    const { counts } = convertAll();
    expect(counts.image).toBeGreaterThan(0);
    expect(counts.paragraph).toBeGreaterThan(0);
    expect(counts['rich-text']).toBeGreaterThan(0);
    // No headings, lists or tables exist in the legacy bodies. If one appears,
    // the corpus changed and this converter should be re-measured.
    expect(counts.heading ?? 0).toBe(0);
  });
});

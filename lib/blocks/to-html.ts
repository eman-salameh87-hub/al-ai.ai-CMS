// lib/blocks/to-html.ts
//
// ContentBlock[] -> HTML, for export.
//
// The inverse of lib/blocks/from-html.ts, and it exists for exactly one reason:
// a spreadsheet cell cannot hold a block array. Nobody can edit
// `[{"type":"rich-text","content":{...}}]` in Excel, but they can edit
// `<p>…</p>` — so content leaves as HTML and comes back through the converter.
//
// LOSSY, AND HONESTLY SO
// A round trip through HTML does not preserve every block. A `client-filter`
// or an `application-form` has no HTML representation at all; those export as
// an HTML comment naming the block, so a re-import leaves them alone instead of
// destroying them. Anything structural — headings, paragraphs, images, lists,
// tables — survives intact, which is what a bulk copy edit actually touches.
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import TiptapLink from '@tiptap/extension-link';
import type { ContentBlock } from './types';

const extensions = [StarterKit, TiptapImage, TiptapLink];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attr(name: string, value: string | undefined): string {
  return value ? ` ${name}="${escapeHtml(value)}"` : '';
}

/**
 * A block that cannot be expressed as HTML, marked so a re-import skips it.
 *
 * from-html.ts drops HTML comments, so this round-trips to nothing rather than
 * to a broken block — and the person editing the spreadsheet can see that
 * something was there.
 */
function placeholder(type: string): string {
  return `<!-- ${type} block: edit this in the CMS, not in the spreadsheet -->`;
}

function blockToHtml(block: ContentBlock): string {
  switch (block.type) {
    case 'heading':
      return `<h${block.level}${attr('id', block.anchor)}>${escapeHtml(block.text)}</h${block.level}>`;

    case 'paragraph':
      return `<p>${escapeHtml(block.text)}</p>`;

    case 'image':
      return (
        `<img${attr('src', block.src)}${attr('alt', block.alt)}` +
        `${block.width ? ` width="${block.width}"` : ''}` +
        `${block.height ? ` height="${block.height}"` : ''} />` +
        (block.caption ? `<p>${escapeHtml(block.caption)}</p>` : '')
      );

    case 'rich-text':
      try {
        // TipTap's own serialiser. It produces the same HTML the site renders,
        // so what an editor sees in the spreadsheet matches the page.
        return generateHTML(block.content, extensions);
      } catch {
        return placeholder('rich-text');
      }

    case 'quote':
      return (
        `<blockquote><p>${escapeHtml(block.text)}</p>` +
        (block.author ? `<p>${escapeHtml(block.author)}</p>` : '') +
        `</blockquote>`
      );

    case 'html':
      // Already HTML. Passed through verbatim — sanitising here would silently
      // change stored content on export, and the renderer sanitises anyway.
      return block.content;

    case 'divider':
      return '<hr />';

    case 'table': {
      const rows = block.data
        .map((row, index) => {
          const tag = block.headerRow && index === 0 ? 'th' : 'td';
          const cells = row.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      return `<table>${rows}</table>`;
    }

    case 'faq':
      return block.items
        .map(
          (item) =>
            `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`
        )
        .join('');

    case 'accordion':
    case 'tabs':
      // Nested block trees. The labels and the prose survive; the nesting does
      // not, which is why a re-import would flatten them — so they are marked
      // instead.
      return placeholder(block.type);

    case 'button':
      return `<p><a${attr('href', block.url)}>${escapeHtml(block.text)}</a></p>`;

    case 'cta':
      return (
        `<h2>${escapeHtml(block.title)}</h2><p>${escapeHtml(block.text)}</p>` +
        `<p><a${attr('href', block.button.url)}>${escapeHtml(block.button.text)}</a></p>`
      );

    case 'gallery':
      return block.images
        .map((image) => `<img${attr('src', image.src)}${attr('alt', image.alt)} />`)
        .join('');

    case 'feature-grid':
      return block.items
        .map(
          (item) => `<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>`
        )
        .join('');

    case 'stats':
      return block.items
        .map((item) => `<p>${escapeHtml(item.value)} — ${escapeHtml(item.label)}</p>`)
        .join('');

    case 'timeline':
      return block.items
        .map(
          (item) =>
            `<h3>${escapeHtml(item.date)} — ${escapeHtml(item.title)}</h3>` +
            `<p>${escapeHtml(item.description)}</p>`
        )
        .join('');

    case 'spacer':
      // No HTML equivalent worth emitting; a spacer is layout, not content.
      return '';

    default:
      /*
       * Every remaining block is configuration rather than prose — a slider's
       * slides, a form's fields, a filter's axes. Marked, not serialised: a
       * lossy HTML rendering of a slider would come back from the converter as
       * a pile of loose images and destroy the block.
       */
      return placeholder((block as { type: string }).type);
  }
}

/** Serialise a body to HTML for a spreadsheet cell. */
export function blocksToHtml(blocks: ContentBlock[] | null | undefined): string {
  if (!blocks?.length) return '';
  return blocks.map(blockToHtml).filter(Boolean).join('\n');
}

/**
 * True when the body contains a block HTML cannot represent.
 *
 * The importer uses this to refuse to overwrite a body it would damage — the
 * one thing a bulk import must never do quietly.
 */
export function hasUnexportableBlocks(blocks: ContentBlock[] | null | undefined): boolean {
  if (!blocks?.length) return false;
  return blocks.some((block) => blockToHtml(block).startsWith('<!--'));
}

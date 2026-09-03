// lib/blocks/from-html.ts
//
// Legacy raw HTML -> typed ContentBlock[].
//
// The old site stored every description as an nvarchar(max) column of HTML
// written by editors in a WYSIWYG over fifteen years. The new site stores a
// typed block array. This is the bridge, and the whole point of it is stated
// in the migration assessment: `html` is an escape hatch, and dumping
// everything into it "hands editors a site they can't edit".
//
// WHAT THE REAL INPUT LOOKS LIKE
// Measured across all 242 non-empty bodies in the restored database, the only
// tags present are:
//
//     1574 <p>   1404 <br>   412 <strong>   412 <img>
//      150 <span>   48 <a>    30 <div>       4 <em>
//
// No headings, no lists, no tables. That is why this converter is not a
// general-purpose HTML-to-blocks engine: building one would be speculative work
// against markup that does not exist in the corpus. It handles what is actually
// there, and `htmlFallback` catches anything that turns up later so a surprise
// is a slightly-worse block rather than lost content.
//
// WHY prose BECOMES rich-text AND NOT paragraph
// `paragraph.text` is a plain string, and the renderer emits it as {block.text}
// — React escapes it. A paragraph carrying <strong> or a link therefore CANNOT
// be a `paragraph` block without losing the markup. It becomes a `rich-text`
// block instead: TipTap JSON, which the admin's existing editor opens and
// edits. Plain prose with no inline marks still becomes a real `paragraph`,
// because that is the simpler block and editors should get it where it fits.
import { parseDocument } from 'htmlparser2';
import type { ChildNode, Element } from 'domhandler';
import type { ContentBlock } from './types';

/** TipTap mark names StarterKit + Link provide. See content-renderer.tsx. */
type MarkName = 'bold' | 'italic' | 'strike' | 'code' | 'link';

interface TiptapMark {
  type: MarkName;
  attrs?: Record<string, unknown>;
}

interface TiptapText {
  type: 'text';
  text: string;
  marks?: TiptapMark[];
}

interface TiptapBreak {
  type: 'hardBreak';
}

type TiptapInline = TiptapText | TiptapBreak;

/** Inline tag -> the TipTap mark it becomes. */
const MARK_FOR_TAG: Record<string, MarkName> = {
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  s: 'strike',
  strike: 'strike',
  del: 'strike',
  u: 'italic', // TipTap StarterKit has no underline mark; italic is the closest honest fit.
  code: 'code',
  a: 'link',
};

/** Tags that open a new block rather than continuing the current one. */
const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'table', 'hr', 'figure', 'section',
]);

export interface FromHtmlOptions {
  /**
   * Rewrites a legacy `src` to wherever the file lives now.
   *
   * Required rather than optional, and it must be given even when it is the
   * identity function. The legacy bodies contain three different image roots
   * (`/NewAeonClients/Uploads/…`, `dev.new-aeon.com/Images/StaticFiles/…`,
   * `www.new-aeon.com/Images/…`), none of which resolve on the new site.
   * Making the caller pass this is what stops a body being imported with 412
   * broken images in it.
   *
   * Return null to DROP the image: a src that cannot be resolved is better
   * omitted than rendered as a broken frame.
   */
  resolveImageSrc: (src: string) => string | null;
  /**
   * Recorded when something is dropped or falls back. The importer collects
   * these into a report — a silent conversion is one nobody checks.
   */
  onNotice?: (notice: ConversionNotice) => void;
}

export interface ConversionNotice {
  kind: 'unresolved-image' | 'unknown-tag' | 'html-fallback' | 'empty';
  detail: string;
}

/** Collapse runs of whitespace, as HTML rendering does. */
function normaliseText(raw: string): string {
  return raw.replace(/\s+/g, ' ');
}

function isElement(node: ChildNode): node is Element {
  return node.type === 'tag' || node.type === 'script' || node.type === 'style';
}

/**
 * Flatten an element's children into TipTap inline nodes, carrying marks down.
 *
 * `<br>` becomes a hardBreak rather than a paragraph split. The legacy content
 * uses <br> for both — a soft line break inside a thought, and a blank line
 * between two — and there is no reliable way to tell them apart from the
 * markup. Keeping every <br> as a hardBreak preserves the author's line
 * structure exactly; splitting on some of them would silently reflow 1,404
 * line breaks according to a guess.
 */
function collectInline(
  nodes: ChildNode[],
  marks: TiptapMark[],
  options: FromHtmlOptions
): TiptapInline[] {
  const out: TiptapInline[] = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      const text = normaliseText(node.data);
      if (!text) continue;
      out.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text });
      continue;
    }

    if (!isElement(node)) continue;

    const tag = node.name.toLowerCase();

    if (tag === 'br') {
      out.push({ type: 'hardBreak' });
      continue;
    }

    const mark = MARK_FOR_TAG[tag];
    if (mark === 'link') {
      const href = node.attribs?.href?.trim();
      // A link with no destination is not a link. Keep the words, drop the
      // anchor — an <a href=""> in the legacy content is an editing accident,
      // not intent.
      const nextMarks: TiptapMark[] = href
        ? [...marks, { type: 'link', attrs: { href, target: null, rel: null } }]
        : marks;
      out.push(...collectInline(node.children, nextMarks, options));
      continue;
    }

    if (mark) {
      // Deduplicate: <strong><strong>x</strong></strong> must not stack.
      const nextMarks = marks.some((m) => m.type === mark)
        ? marks
        : [...marks, { type: mark }];
      out.push(...collectInline(node.children, nextMarks, options));
      continue;
    }

    // <span> and anything else inline-ish: keep the words, drop the wrapper.
    // The 150 spans in the corpus carry no attributes that survive
    // sanitisation anyway.
    out.push(...collectInline(node.children, marks, options));
  }

  return out;
}

/** Trim leading/trailing hardBreaks and empty text from an inline run. */
function trimInline(nodes: TiptapInline[]): TiptapInline[] {
  let start = 0;
  let end = nodes.length;
  const blank = (n: TiptapInline | undefined) =>
    n === undefined || n.type === 'hardBreak' || (n.type === 'text' && !n.text.trim());
  while (start < end && blank(nodes[start])) start += 1;
  while (end > start && blank(nodes[end - 1])) end -= 1;
  return nodes.slice(start, end);
}

/** True when the run needs rich-text rather than a plain paragraph. */
function needsRichText(nodes: TiptapInline[]): boolean {
  return nodes.some((n) => n.type === 'hardBreak' || (n.type === 'text' && n.marks?.length));
}

/** The plain-string form of an inline run, for a `paragraph` block. */
function inlineToPlainText(nodes: TiptapInline[]): string {
  return nodes
    .map((n) => (n.type === 'text' ? n.text : ' '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function inlineToBlock(nodes: TiptapInline[]): ContentBlock | null {
  const trimmed = trimInline(nodes);
  if (!trimmed.length) return null;

  if (!needsRichText(trimmed)) {
    const text = inlineToPlainText(trimmed);
    return text ? { type: 'paragraph', text } : null;
  }

  return {
    type: 'rich-text',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: trimmed }],
    },
  };
}

/** An <img> as a real `image` block, or null when its src cannot be resolved. */
function imageToBlock(element: Element, options: FromHtmlOptions): ContentBlock | null {
  const rawSrc = element.attribs?.src?.trim();
  if (!rawSrc) return null;

  const src = options.resolveImageSrc(rawSrc);
  if (!src) {
    options.onNotice?.({ kind: 'unresolved-image', detail: rawSrc });
    return null;
  }

  const width = Number.parseInt(element.attribs?.width ?? '', 10);
  const height = Number.parseInt(element.attribs?.height ?? '', 10);

  return {
    type: 'image',
    src,
    // The legacy markup has no alt text on any of the 412 images. An empty
    // string is the correct accessible value for "decorative or unknown" —
    // inventing a description from the filename would be worse than silence,
    // and a screen reader announcing a GUID is actively harmful.
    alt: element.attribs?.alt?.trim() ?? '',
    layout: 'wide',
    ...(Number.isFinite(width) && width > 0 ? { width } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height } : {}),
  };
}

function headingLevel(tag: string): 1 | 2 | 3 | 4 | null {
  switch (tag) {
    case 'h1': return 1;
    case 'h2': return 2;
    case 'h3': return 3;
    case 'h4': return 4;
    // h5/h6 have no block-level equivalent; the union stops at 4. They become
    // level 4 rather than being dropped.
    case 'h5':
    case 'h6': return 4;
    default: return null;
  }
}

/**
 * Convert one legacy HTML body into blocks.
 *
 * Returns an empty array for empty input — the caller decides whether a
 * translation with no body is acceptable, because for a client logo entry it
 * very often is.
 */
export function blocksFromHtml(
  html: string | null | undefined,
  options: FromHtmlOptions
): ContentBlock[] {
  if (!html || !html.trim()) return [];

  const document = parseDocument(html, { decodeEntities: true });
  const blocks: ContentBlock[] = [];

  // Inline content encountered outside any block tag. The legacy bodies are
  // full of it — "text<br />text<img /><br />text" with no wrapper at all —
  // so it is accumulated and flushed rather than discarded.
  let pending: TiptapInline[] = [];

  const flush = () => {
    if (!pending.length) return;
    const block = inlineToBlock(pending);
    if (block) blocks.push(block);
    pending = [];
  };

  const visit = (nodes: ChildNode[]) => {
    for (const node of nodes) {
      if (node.type === 'text') {
        const text = normaliseText(node.data);
        if (text.trim()) pending.push({ type: 'text', text });
        continue;
      }

      if (!isElement(node)) continue;
      const tag = node.name.toLowerCase();

      if (tag === 'img') {
        // An image ends the run of prose around it: an `image` block is a
        // figure, and the words before and after it are separate paragraphs.
        flush();
        const block = imageToBlock(node, options);
        if (block) blocks.push(block);
        continue;
      }

      if (tag === 'br') {
        pending.push({ type: 'hardBreak' });
        continue;
      }

      if (tag === 'hr') {
        flush();
        blocks.push({ type: 'divider', style: 'line' });
        continue;
      }

      const level = headingLevel(tag);
      if (level) {
        flush();
        const text = inlineToPlainText(collectInline(node.children, [], options));
        if (text) blocks.push({ type: 'heading', level, text });
        continue;
      }

      if (tag === 'ul' || tag === 'ol' || tag === 'table') {
        // Not in this corpus, but cheap to keep honest: hand the original
        // markup to the html block rather than flattening a table into prose.
        flush();
        const outer = renderOuterHtml(node);
        options.onNotice?.({ kind: 'html-fallback', detail: `<${tag}>` });
        blocks.push({ type: 'html', content: outer });
        continue;
      }

      if (BLOCK_TAGS.has(tag)) {
        // A <p> or <div>. Its children are gathered as one run, EXCEPT that a
        // nested <img> still breaks out into its own block — which is why this
        // recurses rather than calling collectInline directly.
        flush();
        visit(node.children);
        flush();
        continue;
      }

      // Inline element at block level: fold into the current run.
      pending.push(...collectInline([node], [], options));
    }
  };

  visit(document.children);
  flush();

  if (!blocks.length) options.onNotice?.({ kind: 'empty', detail: html.slice(0, 80) });

  return blocks;
}

/**
 * Serialise a node back to HTML, for the fallback path.
 *
 * Deliberately minimal — attributes are re-emitted as-is and the result goes
 * into an `html` block, which the renderer sanitises on the way out. This is
 * not a general serialiser and is only reached by list and table tags, neither
 * of which occurs in the legacy corpus.
 */
function renderOuterHtml(element: Element): string {
  const attrs = Object.entries(element.attribs ?? {})
    .map(([key, value]) => ` ${key}="${String(value).replace(/"/g, '&quot;')}"`)
    .join('');

  const inner = element.children
    .map((child) => {
      if (child.type === 'text') return child.data;
      if (isElement(child)) return renderOuterHtml(child);
      return '';
    })
    .join('');

  return `<${element.name}${attrs}>${inner}</${element.name}>`;
}

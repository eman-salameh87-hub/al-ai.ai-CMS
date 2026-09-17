// lib/blocks/layout.ts
//
// Layout facts blocks share, so they are stated once.

/**
 * Break a block out of the page's content column to the viewport edges.
 *
 * Every page wraps its blocks in `max-w-4xl mx-auto`, which is right for prose
 * and wrong for a hero, a logo strip or a slider — those are bands, and a band
 * that stops at 896px reads as a mistake.
 *
 * `overflow-x: clip` on <main> (see the site layout) absorbs the few pixels
 * 100vw counts and the visible area does not, because 100vw includes the
 * scrollbar. Without that, every full-bleed block adds a horizontal scrollbar.
 *
 * Extracted from slider.tsx, where it was written inline, so the video hero and
 * the logo carousel do not become the second and third copies of a magic
 * string that has to agree with the page container.
 */
export const FULL_BLEED = 'mx-[calc(50%-50vw)] w-screen max-w-[100vw]';

/**
 * Block types that are bands rather than prose, and therefore act as the page
 * hero when they come first.
 *
 * The home page renders a generic HeroSection only when the content does not
 * already open with one of these — otherwise a static banner sits above the
 * thing built to be the banner.
 */
export const HERO_BLOCK_TYPES = ['slider', 'video-hero', 'custom'] as const;

export function isHeroBlock(type: string): boolean {
  return (HERO_BLOCK_TYPES as readonly string[]).includes(type);
}

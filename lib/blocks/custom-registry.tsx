// lib/blocks/custom-registry.tsx
import type { ComponentType } from 'react';

/**
 * Extension point for the `custom` block.
 *
 * A block stores only a component NAME plus props — never a component itself,
 * because block data is untrusted JSON from the database. Rendering an
 * arbitrary named component would be a code-execution primitive; resolving
 * through this explicit allow-list means an author can only reach components a
 * developer has deliberately registered here.
 */
export type CustomComponent = ComponentType<Record<string, unknown>>;

const registry = new Map<string, CustomComponent>();

export function registerCustomBlock(name: string, component: CustomComponent): void {
  registry.set(name, component);
}

export function resolveCustomBlock(name: string): CustomComponent | null {
  return registry.get(name) ?? null;
}

export function registeredCustomBlocks(): string[] {
  return [...registry.keys()];
}

// ── Register project components below ────────────────────────────────────
// Example:
//   import { PriceCalculator } from '@/components/site/custom/price-calculator';
//   registerCustomBlock('price-calculator', PriceCalculator);
//
// Nothing is registered by default, so a `custom` block renders nothing until a
// developer opts a component in.

// Each component below takes its OWN specific props type, not
// Record<string, unknown> — a required field on any of them (e.g.
// PageHeaderFullProps.title) makes `Component as CustomComponent` fail
// under strict mode ("neither type sufficiently overlaps with the other"),
// caught by `npm run typecheck`/`next build` but not by dev mode, which
// never type-checks this file. Routing through `unknown` is the standard,
// deliberate way to assert past that: resolveCustomBlock only ever hands a
// component the props object seed-al-ai-pages.ts wrote for that exact
// component name, so the mismatch the compiler is flagging cannot happen
// at runtime — see this file's top comment on the allow-list design.
import { PeachHero } from '@/components/site/blocks/peach-hero';
registerCustomBlock('peach-hero', PeachHero as unknown as CustomComponent);

// al-ai.ai layout-fidelity components — see each file's header comment for
// which al-ai.ai-pages section it reproduces.
import { SplitIntro } from '@/components/site/blocks/split-intro';
registerCustomBlock('split-intro', SplitIntro as unknown as CustomComponent);

import { ServicePanels } from '@/components/site/blocks/service-panels';
registerCustomBlock('service-panels', ServicePanels as unknown as CustomComponent);

import { SectorGrid } from '@/components/site/blocks/sector-grid';
registerCustomBlock('sector-grid', SectorGrid as unknown as CustomComponent);

import { CompactList } from '@/components/site/blocks/compact-list';
registerCustomBlock('compact-list', CompactList as unknown as CustomComponent);

import { RoundCta } from '@/components/site/blocks/round-cta';
registerCustomBlock('round-cta', RoundCta as unknown as CustomComponent);

import { HeadingArrow } from '@/components/site/blocks/heading-arrow';
registerCustomBlock('heading-arrow', HeadingArrow as unknown as CustomComponent);

import { ContentSection } from '@/components/site/blocks/content-section';
registerCustomBlock('content-section', ContentSection as unknown as CustomComponent);

import { AboutIntro } from '@/components/site/blocks/about-intro';
registerCustomBlock('about-intro', AboutIntro as unknown as CustomComponent);

import { PageHeaderBanner } from '@/components/site/blocks/page-header-banner';
registerCustomBlock('page-header-banner', PageHeaderBanner as unknown as CustomComponent);

import { ContactSection } from '@/components/site/blocks/contact-section';
registerCustomBlock('contact-section', ContactSection as unknown as CustomComponent);

import { PageHeaderFull } from '@/components/site/blocks/page-header-full';
registerCustomBlock('page-header-full', PageHeaderFull as unknown as CustomComponent);

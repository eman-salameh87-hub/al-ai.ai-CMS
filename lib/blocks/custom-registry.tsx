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

import { PeachHero } from '@/components/site/blocks/peach-hero';
registerCustomBlock('peach-hero', PeachHero as CustomComponent);

// al-ai.ai layout-fidelity components — see each file's header comment for
// which al-ai.ai-pages section it reproduces.
import { SplitIntro } from '@/components/site/blocks/split-intro';
registerCustomBlock('split-intro', SplitIntro as CustomComponent);

import { ServicePanels } from '@/components/site/blocks/service-panels';
registerCustomBlock('service-panels', ServicePanels as CustomComponent);

import { SectorGrid } from '@/components/site/blocks/sector-grid';
registerCustomBlock('sector-grid', SectorGrid as CustomComponent);

import { CompactList } from '@/components/site/blocks/compact-list';
registerCustomBlock('compact-list', CompactList as CustomComponent);

import { RoundCta } from '@/components/site/blocks/round-cta';
registerCustomBlock('round-cta', RoundCta as CustomComponent);

import { HeadingArrow } from '@/components/site/blocks/heading-arrow';
registerCustomBlock('heading-arrow', HeadingArrow as CustomComponent);

import { ContentSection } from '@/components/site/blocks/content-section';
registerCustomBlock('content-section', ContentSection as CustomComponent);

import { AboutIntro } from '@/components/site/blocks/about-intro';
registerCustomBlock('about-intro', AboutIntro as CustomComponent);

import { PageHeaderBanner } from '@/components/site/blocks/page-header-banner';
registerCustomBlock('page-header-banner', PageHeaderBanner as CustomComponent);

import { ContactSection } from '@/components/site/blocks/contact-section';
registerCustomBlock('contact-section', ContactSection as CustomComponent);

import { PageHeaderFull } from '@/components/site/blocks/page-header-full';
registerCustomBlock('page-header-full', PageHeaderFull as CustomComponent);

import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { HouseholdLab } from '@/components/household-lab';
import { SiteHeader, SiteFooter } from '@/components/site-header';
import { isPreviewHost } from '@/lib/stripe-mode';

/** Synthetic-only preview; never accepts real workspace/property identifiers. */
export const Route = createFileRoute('/_authenticated/household-lab')({
  head: () => ({ meta: [
    { title: 'Household Relationship Lab — SuCasa' },
    { name: 'description', content: 'Isolated fictional household relationship review in SuCasa preview.' },
    { property: 'og:title', content: 'Household Relationship Lab — SuCasa' },
    { property: 'og:description', content: 'Isolated fictional household relationship review in SuCasa preview.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
    { name: 'robots', content: 'noindex, nofollow' },
  ] }),
  component: () => <><SiteHeader /><main className="mx-auto min-h-[60vh] w-full max-w-4xl px-4 py-6"><ClientOnly>{typeof window !== 'undefined' && isPreviewHost(window.location.host) ? <HouseholdLab /> : <p className="text-sm text-text-secondary">Not available.</p>}</ClientOnly></main><SiteFooter /></>,
});
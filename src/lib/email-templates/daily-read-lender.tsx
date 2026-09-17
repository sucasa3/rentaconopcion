import type { TemplateEntry } from './registry'
import { DailyReadEmail } from './daily-read-email'

/**
 * Lender Daily Read. Content is built by src/lib/daily-read.server.ts from the
 * gated lender workspace, so only homeowners this lender may see by name — and
 * only facts within its permitted scopes — can ever appear here.
 */
export const template = {
  component: DailyReadEmail,
  subject: (data: Record<string, any>) =>
    data['subject'] || 'Your SuCasa Daily Read',
  displayName: 'Daily Read — Lender',
  previewData: {
    subject: '3 homeowners deserve your attention today',
    greeting: 'Good morning, Neil',
    summary: '3 homeowners deserve attention today.',
    breakdown: [
      { label: 'Annual mortgage review', count: 1 },
      { label: 'Equity milestone', count: 1 },
      { label: 'Relationship follow-up', count: 1 },
    ],
    top: [
      {
        name: 'Riley Ortega',
        why: 'Annual review is due and they opened your last update.',
        next: 'Call to walk through their annual mortgage review.',
        href: 'https://sucasa.com/lender',
      },
    ],
    remaining: 2,
    ctaLabel: "Open Today's Opportunities",
    ctaUrl: 'https://sucasa.com/lender',
    preferencesUrl: 'https://sucasa.com/lender',
  },
} satisfies TemplateEntry

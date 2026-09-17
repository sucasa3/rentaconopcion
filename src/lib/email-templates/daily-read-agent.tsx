import type { TemplateEntry } from './registry'
import { DailyReadEmail } from './daily-read-email'

/**
 * Agent Daily Read. Content is built by src/lib/daily-read.server.ts from the
 * canonical agent action queue, so nothing here can disagree with Agent Today.
 * Agent-only vocabulary: no refinance, HELOC, cash-out or qualification copy.
 */
export const template = {
  component: DailyReadEmail,
  subject: (data: Record<string, any>) =>
    data['subject'] || 'Your SuCasa Daily Read',
  displayName: 'Daily Read — Agent',
  previewData: {
    subject: '4 relationships deserve your attention today',
    greeting: 'Good morning, Neil',
    summary: '4 relationships deserve attention today.',
    breakdown: [
      { label: 'Something changed at the property', count: 2 },
      { label: 'Active on their home right now', count: 1 },
      { label: 'Anniversary or long tenure', count: 1 },
    ],
    top: [
      {
        name: 'Maria Delgado',
        why: 'A permit was filed at the property this month.',
        next: 'Ask how the project is going and offer a current value read.',
        href: 'https://sucasa.com/agent',
      },
      {
        name: 'David Hernandez',
        why: 'Nine years in the home, with an anniversary this month.',
        next: 'Send a short anniversary note with a market update.',
        href: 'https://sucasa.com/agent',
      },
    ],
    remaining: 2,
    ctaLabel: "Open Today's Opportunities",
    ctaUrl: 'https://sucasa.com/agent',
    preferencesUrl: 'https://sucasa.com/agent',
  },
} satisfies TemplateEntry

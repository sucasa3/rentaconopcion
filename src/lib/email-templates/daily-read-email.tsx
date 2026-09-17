import * as React from 'react'
import {
  Button,
  Heading,
  Hr,
  Img,
  Link,
  Section,
  Text,
} from '@react-email/components'
import { EmailBrand, brandColors, eyebrow, mutedText } from './brand'

/** SuCasa orange — reserved for the single primary action and small emphasis. */
const ORANGE = '#DA5431'

export interface DailyReadPerson {
  name: string
  why: string
  next: string
  href?: string
}

export interface DailyReadEmailProps {
  greeting?: string
  summary?: string
  supporting?: string | null
  breakdown?: { label: string; count: number }[]
  top?: DailyReadPerson[]
  remaining?: number
  ctaLabel?: string
  ctaUrl?: string
  preview?: string
  trackingPixelUrl?: string
  preferencesUrl?: string
}

/**
 * One layout for both roles. Copy and people are passed in already built from
 * canonical data — this component states nothing of its own about a homeowner.
 */
export const DailyReadEmail = ({
  greeting = 'Good morning',
  summary = '',
  supporting = null,
  breakdown = [],
  top = [],
  remaining = 0,
  ctaLabel = "Open Today's Opportunities",
  ctaUrl = 'https://sucasa.com',
  preview,
  trackingPixelUrl,
  preferencesUrl,
}: DailyReadEmailProps) => (
  <EmailBrand preview={preview || summary || 'Your SuCasa Daily Read'}>
    <Text style={eyebrow}>Your SuCasa Daily Read</Text>
    <Heading style={h1}>{greeting}</Heading>

    <Text style={summaryText}>{summary}</Text>
    {supporting ? <Text style={supportingText}>{supporting}</Text> : null}

    {breakdown.length ? (
      <Section style={breakdownBox}>
        {breakdown.map((row) => (
          <Text key={row.label} style={breakdownRow}>
            <span style={countPill}>{row.count}</span>
            {row.label}
          </Text>
        ))}
      </Section>
    ) : null}

    {top.length ? <Hr style={rule} /> : null}

    {top.map((person) => (
      <Section key={`${person.name}-${person.why}`} style={card}>
        <Text style={personName}>
          {person.href ? (
            <Link href={person.href} style={personLink}>
              {person.name}
            </Link>
          ) : (
            person.name
          )}
        </Text>
        <Text style={whyLabel}>Why now</Text>
        <Text style={whyText}>{person.why}</Text>
        {person.next ? (
          <>
            <Text style={whyLabel}>Suggested next step</Text>
            <Text style={nextText}>{person.next}</Text>
          </>
        ) : null}
      </Section>
    ))}

    {remaining > 0 ? (
      <Text style={remainingText}>
        {remaining} more {remaining === 1 ? 'is' : 'are'} waiting inside SuCasa.
      </Text>
    ) : null}

    <Section style={ctaWrap}>
      <Button href={ctaUrl} style={ctaButton}>
        {ctaLabel}
      </Button>
    </Section>

    <Text style={mutedText}>
      SuCasa surfaces reasons to reconnect based on the records and activity it
      already has. Signals are not predictions about what anyone will do.
      {preferencesUrl ? (
        <>
          {' '}
          You can turn the Daily Read off in{' '}
          <Link href={preferencesUrl} style={{ color: brandColors.NAVY, fontWeight: '600' }}>
            your SuCasa settings
          </Link>
          .
        </>
      ) : null}
    </Text>

    {trackingPixelUrl ? (
      <Img src={trackingPixelUrl} width="1" height="1" alt="" style={pixel} />
    ) : null}
  </EmailBrand>
)

const h1 = {
  fontSize: '24px',
  fontWeight: '700',
  color: brandColors.CHARCOAL,
  lineHeight: '1.25',
  letterSpacing: '-0.02em',
  margin: '0 0 14px',
}

const summaryText = {
  fontSize: '18px',
  fontWeight: '600',
  color: brandColors.NAVY,
  lineHeight: '1.45',
  margin: '0 0 10px',
}

const supportingText = {
  fontSize: '15px',
  color: brandColors.TEXT_BODY,
  lineHeight: '1.6',
  margin: '0 0 16px',
}

const breakdownBox = {
  backgroundColor: brandColors.WARM_BG,
  border: `1px solid ${brandColors.HAIRLINE}`,
  borderRadius: '12px',
  padding: '14px 16px',
  margin: '8px 0 4px',
}

const breakdownRow = {
  fontSize: '14px',
  color: brandColors.TEXT_BODY,
  lineHeight: '1.5',
  margin: '0 0 8px',
}

const countPill = {
  display: 'inline-block',
  minWidth: '22px',
  textAlign: 'center' as const,
  color: ORANGE,
  fontWeight: '700',
  marginRight: '8px',
}

const rule = {
  border: 'none',
  borderTop: `1px solid ${brandColors.HAIRLINE}`,
  margin: '20px 0',
}

const card = {
  border: `1px solid ${brandColors.HAIRLINE}`,
  borderLeft: `3px solid ${ORANGE}`,
  borderRadius: '12px',
  padding: '16px 18px',
  margin: '0 0 12px',
}

const personName = {
  fontSize: '17px',
  fontWeight: '700',
  color: brandColors.CHARCOAL,
  margin: '0 0 10px',
}

const personLink = {
  color: brandColors.CHARCOAL,
  textDecoration: 'none',
}

const whyLabel = {
  fontSize: '11px',
  fontWeight: '700',
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: brandColors.TEXT_MUTED,
  margin: '0 0 4px',
}

const whyText = {
  fontSize: '15px',
  color: brandColors.TEXT_BODY,
  lineHeight: '1.55',
  margin: '0 0 12px',
}

const nextText = {
  fontSize: '15px',
  fontWeight: '600',
  color: brandColors.NAVY,
  lineHeight: '1.55',
  margin: '0',
}

const remainingText = {
  fontSize: '14px',
  color: brandColors.TEXT_MUTED,
  margin: '4px 0 0',
}

const ctaWrap = { margin: '24px 0 4px' }

const ctaButton = {
  backgroundColor: ORANGE,
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '700',
  borderRadius: '10px',
  padding: '15px 28px',
  textDecoration: 'none',
  display: 'inline-block',
}

const pixel = { display: 'block', height: '1px', width: '1px', border: 'none' }

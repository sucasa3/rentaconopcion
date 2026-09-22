import * as React from 'react'
import { Button, Heading, Hr, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import {
  EmailBrand,
  bodyText,
  brandColors,
  eyebrow,
  hairlineRule,
  heading,
  mutedText,
  primaryButton,
} from './brand'

/**
 * SuCasa asks a homeowner whether they want to be connected to a lender their
 * agent named.
 *
 * This email is the homeowner's decision point. It carries no property value,
 * equity, mortgage, balance or condition detail, and nothing about the
 * homeowner has been shared with the lender at this stage. Declining, or simply
 * ignoring this email, keeps it that way.
 */
export interface IntroductionInviteProps {
  unsubscribeUrl?: string | null
  homeownerName?: string | null
  agentOrgName?: string
  lenderOrgName?: string
  lenderContactName?: string | null
  categoryLabel?: string
  acceptUrl?: string
}

export function IntroductionInviteEmail({
  homeownerName,
  agentOrgName = 'Your agent',
  lenderOrgName = 'a lender',
  lenderContactName,
  categoryLabel = 'financing options',
  acceptUrl = 'https://sucasa.com/introduction',
  unsubscribeUrl,
}: IntroductionInviteProps) {
  const who = lenderContactName ? `${lenderContactName} at ${lenderOrgName}` : lenderOrgName
  return (
    <EmailBrand preview={`Would you like to connect with ${lenderOrgName}?`} unsubscribeUrl={unsubscribeUrl}>
      <Section>
        <Text style={eyebrow}>An introduction, only if you want it</Text>
        <Heading style={heading}>Would you like to connect with {lenderOrgName}?</Heading>
        <Text style={bodyText}>
          {homeownerName ? `${homeownerName}, ` : ''}
          {agentOrgName} would like to introduce you to {who} for a conversation about{' '}
          {categoryLabel.toLowerCase()} that may be relevant to your home. There&apos;s no
          obligation to proceed.
        </Text>
        <Text style={bodyText}>
          Nothing about you has been shared with {lenderOrgName}. If you say yes, you choose how
          they may contact you — and you can withdraw that at any time.
        </Text>
        <Button href={acceptUrl} style={primaryButton}>
          See the request
        </Button>
        <Text style={mutedText}>
          Or open this link: <span style={{ color: brandColors.NAVY }}>{acceptUrl}</span>
        </Text>
        <Hr style={hairlineRule} />
        <Text style={mutedText}>
          Saying no thanks — or ignoring this email — changes nothing about your SuCasa account,
          your relationship with your agent, or any other service.
        </Text>
      </Section>
    </EmailBrand>
  )
}

export const template: TemplateEntry = {
  component: IntroductionInviteEmail,
  subject: (data: Record<string, any>) =>
    `Would you like to connect with ${data['lenderOrgName'] ?? 'a lender'}?`,
  displayName: 'Homeowner introduction request',
  previewData: {
    homeownerName: 'Ana',
    agentOrgName: 'Sunrise Realty',
    lenderOrgName: 'Acme Mortgage',
    lenderContactName: 'Dana Lopez',
    categoryLabel: 'Mortgage review',
    acceptUrl: 'https://sucasa.com/introduction?t=example',
  },
}

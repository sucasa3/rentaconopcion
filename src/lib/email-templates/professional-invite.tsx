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
 * Agent → professional invitation.
 *
 * Deliberately relationship-only. This email never names a homeowner, an
 * address, a property, a loan, a balance or a count of "your clients": the
 * recipient has not proved who they are yet, and email is not a trusted
 * channel. Everything of substance waits behind the claim.
 */
export interface ProfessionalInviteProps {
  /** Name of the professional being invited, when known. */
  professionalName?: string
  /** The agent workspace that named this person as someone they work with. */
  inviterOrgName?: string
  acceptUrl?: string
}

const POINTS: { title: string; detail: string }[] = [
  {
    title: 'Confirm how you appear',
    detail: 'Claim your profile so your name and company are right wherever you are listed.',
  },
  {
    title: 'Be part of the same Home Team',
    detail: 'Agents and homeowners can recognise you as the professional they already work with.',
  },
  {
    title: 'You control what is shared',
    detail: 'Claiming your profile gives you no homeowner information. Homeowners decide that, separately.',
  },
]

const ProfessionalInviteEmail = ({
  professionalName,
  inviterOrgName = 'An agent on SuCasa',
  acceptUrl = 'https://rentaconopcion.lovable.app/professional-invite',
}: ProfessionalInviteProps) => (
  <EmailBrand preview={`${inviterOrgName} works with you on SuCasa`}>
    <Text style={eyebrow}>Invited by {inviterOrgName}</Text>
    <Heading style={heading}>Claim your professional profile.</Heading>
    <Text style={bodyText}>
      {professionalName ? `Hi ${professionalName.split(' ')[0]},` : 'Hi there,'}
    </Text>
    <Text style={bodyText}>
      <strong>{inviterOrgName}</strong> listed you on SuCasa as a professional they work with.
      Claiming your profile confirms your own details — nothing more.
    </Text>

    <Hr style={hairlineRule} />

    {POINTS.map((p) => (
      <Section key={p.title} style={row}>
        <Text style={rowTitle}>{p.title}</Text>
        <Text style={rowDetail}>{p.detail}</Text>
      </Section>
    ))}

    <Hr style={hairlineRule} />

    <Button style={primaryButton} href={acceptUrl}>
      Claim my profile
    </Button>

    <Text style={mutedText}>
      This link is personal to this email address and expires in 21 days. To claim your profile you
      will be asked to sign in with this same address. If you would rather not appear, you can
      decline on the same page.
    </Text>
  </EmailBrand>
)

const row = { margin: '0 0 14px' } as const

const rowTitle = {
  margin: '0 0 2px',
  fontSize: '15px',
  fontWeight: 600,
  color: brandColors.CHARCOAL,
} as const

const rowDetail = {
  margin: 0,
  fontSize: '14px',
  lineHeight: '21px',
  color: brandColors.TEXT_MUTED,
} as const

export const template: TemplateEntry = {
  component: ProfessionalInviteEmail,
  subject: (data) =>
    `${data['inviterOrgName'] ?? 'An agent on SuCasa'} works with you — claim your SuCasa profile`,
  displayName: 'Professional invitation',
  previewData: {
    professionalName: 'Dana Ruiz',
    inviterOrgName: 'Coastal Realty Group',
    acceptUrl: 'https://rentaconopcion.lovable.app/professional-invite?t=preview',
  },
}

export default ProfessionalInviteEmail

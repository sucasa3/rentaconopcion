import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const DEEP_BLUE = '#1e3a5f'
const SUCASA_ORANGE = '#DA5431'
const TEXT_MUTED = '#64748b'
const BORDER = '#e2e8f0'

export interface LenderPilotRequestProps {
  name: string
  email: string
  company: string
  loanOfficers?: string
  markets?: string
  message?: string
}

const LenderPilotRequestEmail = ({
  name,
  email,
  company,
  loanOfficers,
  markets,
  message,
}: LenderPilotRequestProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New lender pilot request from {name} at {company}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brandText}>SuCasa for Lenders</Text>
        </Section>

        <Section style={hero}>
          <Text style={eyebrow}>NEW LENDER PILOT REQUEST</Text>
          <Heading style={heading}>{company} wants to turn its agent relationships into a measurable funnel</Heading>
          <Text style={lead}>
            This is a high-intent demo opportunity. A lender just asked to run a 90-day SuCasa pilot —
            they are not shopping for leads, they are looking for a repeatable way to help their loan
            officers stay relevant to the agents who already refer business.
          </Text>
        </Section>

        <Section style={whyItMatters}>
          <Heading as="h2" style={subheading}>Why this request matters</Heading>
          <Text style={bullet}>
            <span style={bulletLead}>They already have the relationships. </span>
            SuCasa does not sell lead lists. We turn an agent's existing database into a short list of
            homeowners worth a conversation — with the reason attached.
          </Text>
          <Text style={bullet}>
            <span style={bulletLead}>The economics are concrete. </span>
            A small group of loan officers and agent partners, activated consistently, can change where
            the next refinance, move-up, or investment purchase conversation starts.
          </Text>
          <Text style={bullet}>
            <span style={bulletLead}>The pilot is designed to prove it. </span>
            90 days. Existing databases. Real signals. Tracked referrals. Measured funded loans.
          </Text>
        </Section>

        <Section style={card}>
          <Heading as="h2" style={subheading}>Prospect details</Heading>
          <Detail label="Name" value={name} />
          <Detail label="Email" value={email} />
          <Detail label="Company" value={company} />
          {loanOfficers ? <Detail label="Loan officers" value={loanOfficers} /> : null}
          {markets ? <Detail label="Markets" value={markets} /> : null}
          {message ? (
            <>
              <Text style={detailLabel}>Message</Text>
              <Text style={detailValue}>{message}</Text>
            </>
          ) : null}
        </Section>

        <Section style={ctaWrap}>
          <Button
            href={`mailto:${email}?subject=Re: SuCasa Lender Pilot - ${encodeURIComponent(company)}&body=Hi ${encodeURIComponent(name)},%0A%0AThanks for your interest in the SuCasa lender pilot. I would love to walk you through how a 90-day pilot works and what we would measure together.`}
            style={button}
          >
            Reply now to schedule the demo
          </Button>
          <Text style={ctaSub}>Hit reply or click above — the email goes straight to {name}.</Text>
        </Section>

        <Section style={nextSteps}>
          <Heading as="h2" style={subheading}>Demo playbook</Heading>
          <Text style={bullet}>1. Reply fast — within 24 hours while the moment is live.</Text>
          <Text style={bullet}>2. Confirm loan officer count and active agent partnerships.</Text>
          <Text style={bullet}>3. Schedule a 30-minute pilot walkthrough with one decision-maker.</Text>
          <Text style={bullet}>4. Set the measurement frame: signals, conversations, referrals, funded loans.</Text>
        </Section>


        <Section style={footer}>
          <Text style={footerText}>Sent by the SuCasa lender landing page.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Text style={detailLabel}>{label}</Text>
      <Text style={detailValue}>{value}</Text>
    </>
  )
}

export const template = {
  component: LenderPilotRequestEmail,
  subject: (data: Record<string, any>) =>
    `New lender pilot request — ${data.company}`,
  displayName: 'Lender pilot request notification',
  to: 'info@sucasa.com',
  previewData: {
    name: 'Alex Morgan',
    email: 'alex@examplelending.com',
    company: 'Example Lending',
    loanOfficers: '12',
    markets: 'Dallas-Fort Worth, Austin',
    message: 'We work with several top agent teams and want to help them stay in touch with past clients.',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}
const container = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '24px 20px 32px',
}
const header = { paddingBottom: '16px' }
const brandText = {
  margin: '0',
  fontSize: '15px',
  fontWeight: 700,
  color: DEEP_BLUE,
  letterSpacing: '0.2px',
}
const hero = {
  backgroundColor: DEEP_BLUE,
  borderRadius: '16px',
  padding: '32px 28px',
  marginBottom: '24px',
}
const eyebrow = {
  margin: '0 0 12px',
  fontSize: '12px',
  fontWeight: 700,
  color: '#ffffff',
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
}
const heading = {
  margin: '0 0 16px',
  fontSize: '26px',
  lineHeight: '34px',
  fontWeight: 700,
  color: '#ffffff',
}
const lead = {
  margin: '0',
  fontSize: '15px',
  lineHeight: '24px',
  color: '#e2e8f0',
}
const card = {
  border: `1px solid ${BORDER}`,
  borderRadius: '16px',
  padding: '24px',
  marginBottom: '24px',
}
const subheading = {
  margin: '0 0 16px',
  fontSize: '18px',
  lineHeight: '26px',
  fontWeight: 700,
  color: DEEP_BLUE,
}
const detailLabel = {
  margin: '0 0 4px',
  fontSize: '11px',
  fontWeight: 700,
  color: TEXT_MUTED,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
}
const detailValue = {
  margin: '0 0 16px',
  fontSize: '15px',
  lineHeight: '22px',
  color: '#0f172a',
}
const ctaWrap = {
  textAlign: 'center' as const,
  marginBottom: '24px',
}
const button = {
  backgroundColor: SUCASA_ORANGE,
  borderRadius: '999px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: 600,
  padding: '14px 28px',
  textDecoration: 'none',
}
const nextSteps = {
  border: `1px solid ${BORDER}`,
  borderRadius: '16px',
  padding: '24px',
  backgroundColor: '#f8fafc',
}
const bullet = {
  margin: '0 0 10px',
  fontSize: '14px',
  lineHeight: '22px',
  color: '#0f172a',
}
const footer = { padding: '16px 4px 0' }
const footerText = { margin: '0', fontSize: '11px', color: TEXT_MUTED }

import * as React from 'react'
import { Button, Heading, Hr, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailBrand, bodyText, eyebrow, hairlineRule, heading, mutedText, primaryButton } from './brand'

/** Branch manager → loan officer seat invitation. Contains no homeowner data. */
export interface TeamInviteProps {
  unsubscribeUrl?: string | null
  inviterName?: string
  orgName?: string
  role?: 'member' | 'manager'
  acceptUrl?: string
  lang?: 'en' | 'es'
}

const TeamInviteEmail = ({
  inviterName = 'Your branch manager',
  orgName = 'your branch',
  role = 'member',
  acceptUrl = 'https://sucasa.com/team-invite',
  lang = 'en',
  unsubscribeUrl,
}: TeamInviteProps) => {
  const es = lang === 'es'
  const roleLabel = es ? (role === 'manager' ? 'gerente' : 'oficial de préstamos') : role === 'manager' ? 'manager' : 'loan officer'
  return (
    <EmailBrand
      preview={es ? `${inviterName} te invitó a ${orgName} en SuCasa` : `${inviterName} invited you to ${orgName} on SuCasa`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Text style={eyebrow}>{es ? `Invitación de ${inviterName}` : `Invited by ${inviterName}`}</Text>
      <Heading style={heading}>{es ? `Únete a ${orgName} en SuCasa.` : `Join ${orgName} on SuCasa.`}</Heading>
      <Text style={bodyText}>
        {es
          ? `${inviterName} reservó un lugar para ti como ${roleLabel}. Tendrás tu propio espacio con tus clientes, oportunidades y colaboraciones con agentes.`
          : `${inviterName} saved a seat for you as a ${roleLabel}. You'll get your own workspace with your clients, opportunities and agent collaborations.`}
      </Text>
      <Hr style={hairlineRule} />
      <Button style={primaryButton} href={acceptUrl}>
        {es ? 'Aceptar invitación y crear acceso' : 'Accept invitation & set up access'}
      </Button>
      <Text style={mutedText}>
        {es
          ? 'Este enlace es personal, funciona una sola vez y vence en 7 días. Usa este mismo correo al crear tu acceso. Si no esperabas esta invitación, puedes ignorar este mensaje.'
          : 'This link is personal, works once and expires in 7 days. Use this same email address when you create your access. If you weren’t expecting this, you can ignore this email.'}
      </Text>
      <Text style={mutedText}>
        {es ? 'Si el botón no funciona, copia esta dirección en tu navegador:' : 'If the button does not work, copy and paste this address into your browser:'}
        <br />
        {acceptUrl}
      </Text>
    </EmailBrand>
  )
}

export const template: TemplateEntry = {
  component: TeamInviteEmail,
  subject: (d) =>
    d['lang'] === 'es'
      ? `${d['inviterName'] ?? 'Tu gerente'} te invitó a unirte a ${d['orgName'] ?? 'su equipo'} en SuCasa`
      : `${d['inviterName'] ?? 'Your manager'} invited you to join ${d['orgName'] ?? 'their team'} on SuCasa`,
  displayName: 'Loan officer team invitation',
  previewData: {
    inviterName: 'Neil Terc',
    orgName: 'SuCasa Lending Branch',
    role: 'member',
    acceptUrl: 'https://sucasa.com/team-invite?t=preview',
  },
}

export default TeamInviteEmail

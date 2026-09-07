/**
 * Shared contact-channel model.
 *
 * One conceptual interface for every professional surface, with role-specific
 * policy underneath. Three things stay strictly separate:
 *
 *   recommendation  — which channel SuCasa prefers for this moment
 *   permission      — whether this professional may use the channel at all
 *   contact data    — whether the channel is technically possible
 *
 * The decision itself is produced by trusted server-side code. The client only
 * receives the rendered outcome (available / recommended / reason) and never
 * the underlying consent records.
 */

import type { ChannelPermissionRecord } from "@/lib/lender-access";

export type ContactChannel = "call" | "text" | "email";

export const CONTACT_CHANNELS: ContactChannel[] = ["call", "text", "email"];

/** The only shape the UI ever sees. Deliberately free of consent metadata. */
export interface ChannelOption {
  channel: ContactChannel;
  available: boolean;
  /** SuCasa's preferred channel for this moment — emphasis only, never gating. */
  recommended: boolean;
  /** Plain-language explanation, shown behind a "Why?" affordance. */
  reason: string | null;
}

export const CHANNEL_LABEL: Record<ContactChannel, string> = {
  call: "Call",
  text: "Text",
  email: "Email",
};

/**
 * Relationship bases SuCasa can actually defend as an agent's own client
 * relationship. Presence in a book is NOT enough on its own — the stored basis
 * has to say how the record got there.
 */
const DOCUMENTED_AGENT_RELATIONSHIP = new Set([
  "org_uploaded",
  "uploaded",
  "csv_import",
  "agent_upload",
  "client",
  "past_client",
  "assigned",
  "connected",
  "referral",
]);

export interface AgentChannelInput {
  /** Stored relationship basis on the client record. */
  relationshipBasis: string | null;
  hasPhone: boolean;
  hasEmail: boolean;
  permission: ChannelPermissionRecord | null;
  recommended: ContactChannel;
}

function suppressed(channel: ContactChannel, perm: ChannelPermissionRecord | null) {
  if (!perm) return false;
  if (channel === "call") return Boolean(perm.do_not_call);
  if (channel === "text") return Boolean(perm.do_not_text);
  return Boolean(perm.do_not_email);
}

function explicitlyAllowed(channel: ContactChannel, perm: ChannelPermissionRecord | null) {
  if (!perm) return false;
  if (channel === "call") return Boolean(perm.phone_allowed);
  if (channel === "text") return Boolean(perm.sms_allowed);
  return Boolean(perm.email_allowed);
}

/**
 * Agent policy. Order matters: opt-out first, then a defensible relationship,
 * then the contact detail the channel needs, then recorded permission.
 *
 * Manual, one-to-one contact only. Automated or campaign sending still
 * requires explicit recorded permission and is decided elsewhere.
 */
export function evaluateAgentChannels(input: AgentChannelInput): ChannelOption[] {
  const documented = DOCUMENTED_AGENT_RELATIONSHIP.has(
    (input.relationshipBasis ?? "").toLowerCase(),
  );

  return CONTACT_CHANNELS.map((channel): ChannelOption => {
    const recommended = channel === input.recommended;
    const deny = (reason: string): ChannelOption => ({
      channel,
      available: false,
      recommended,
      reason,
    });

    if (suppressed(channel, input.permission)) {
      return deny(
        channel === "call"
          ? "This homeowner asked not to be called."
          : channel === "text"
            ? "This homeowner asked not to be texted."
            : "This homeowner asked not to be emailed.",
      );
    }

    const hasDetail = channel === "email" ? input.hasEmail : input.hasPhone;
    if (!hasDetail) {
      return deny(
        channel === "email"
          ? "No email address on file for this homeowner."
          : "No phone number on file for this homeowner.",
      );
    }

    if (explicitlyAllowed(channel, input.permission)) {
      return { channel, available: true, recommended, reason: null };
    }

    if (documented) {
      return { channel, available: true, recommended, reason: null };
    }

    return deny(
      "SuCasa has no recorded permission and no documented client relationship for this homeowner.",
    );
  });
}

/** Channels the professional may actually use, recommended one first. */
export function permittedChannels(options: ChannelOption[]): ChannelOption[] {
  return options
    .filter((o) => o.available)
    .sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

/** Channels that are off the table, with the reason to show behind "Why?". */
export function blockedChannels(options: ChannelOption[]): ChannelOption[] {
  return options.filter((o) => !o.available);
}

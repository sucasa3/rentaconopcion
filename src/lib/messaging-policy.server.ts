/**
 * The one door every outbound message goes through.
 *
 * Purpose is declared at the call site and checked here. Nothing else decides
 * whether a message may be sent, so no feature can reach the email or text
 * transport without this gate.
 *
 *   transactional — sign-in and verification codes, security notices, receipts,
 *                   and updates about something the person themselves started.
 *                   Never blocked by a marketing opt-out.
 *   marketing     — campaigns, nurture, introductions, digests and any other
 *                   relationship-building message, automated or not, whether it
 *                   comes from SuCasa or on behalf of an agent or lender.
 *                   Always blocked by an opt-out or the suppression register.
 *
 * Server-only.
 */

import { identifierHmac, normalizeEmailKey, normalizePhoneKey } from "./suppression.server";

export type MessagePurpose = "transactional" | "marketing";
export type MessageChannel = "email" | "sms" | "call";

export interface PolicySubject {
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Secondary matching factors for the suppression register only. */
  street?: string | null;
  zip?: string | null;
}

export interface PolicyDecision {
  allowed: boolean;
  /** Minimum status only — never says which preference the person set. */
  reason: string | null;
  code: "allowed" | "preference" | "suppressed" | "provider_stop" | "consent_required";
}

/** The single sentence a professional may be shown when a send is blocked. */
export const BLOCKED_REASON = "Contact preference prevents outreach.";

export interface PreferenceRow {
  id?: string;
  user_id?: string | null;
  email_hmac?: string | null;
  phone_hmac?: string | null;
  marketing_email: boolean;
  marketing_sms: boolean;
  marketing_calls: boolean;
  sms_consent_required: boolean;
}

export const DEFAULT_PREFERENCES: PreferenceRow = {
  marketing_email: true,
  marketing_sms: true,
  marketing_calls: true,
  sms_consent_required: false,
};

export function subjectKeys(subject: PolicySubject): {
  emailHmac: string | null;
  phoneHmac: string | null;
} {
  const email = normalizeEmailKey(subject.email);
  const phone = normalizePhoneKey(subject.phone);
  return {
    emailHmac: email ? identifierHmac("email", email) : null,
    phoneHmac: phone ? identifierHmac("phone", phone) : null,
  };
}

/** Current preferences for a person, by account id or pseudonymous identifier. */
export async function loadPreferences(
  admin: any,
  subject: PolicySubject,
): Promise<PreferenceRow> {
  const { emailHmac, phoneHmac } = subjectKeys(subject);
  const ors: string[] = [];
  if (subject.userId) ors.push(`user_id.eq.${subject.userId}`);
  if (emailHmac) ors.push(`email_hmac.eq.${emailHmac}`);
  if (phoneHmac) ors.push(`phone_hmac.eq.${phoneHmac}`);
  if (!ors.length) return { ...DEFAULT_PREFERENCES };

  const { data } = await admin
    .from("communication_preferences")
    .select("*")
    .or(ors.join(","))
    .limit(5);

  const rows = (data ?? []) as PreferenceRow[];
  if (!rows.length) return { ...DEFAULT_PREFERENCES };

  // More than one row can match when a person is known by account and by
  // identifier. The strictest answer wins.
  return rows.reduce<PreferenceRow>(
    (acc, r) => ({
      ...acc,
      marketing_email: acc.marketing_email && r.marketing_email !== false,
      marketing_sms: acc.marketing_sms && r.marketing_sms !== false,
      marketing_calls: acc.marketing_calls && r.marketing_calls !== false,
      sms_consent_required: acc.sms_consent_required || r.sms_consent_required === true,
    }),
    { ...DEFAULT_PREFERENCES, ...rows[0], ...{ marketing_email: true, marketing_sms: true, marketing_calls: true, sms_consent_required: false } },
  );
}

/**
 * Ask the texting provider whether this number is on do-not-disturb. The
 * provider owns STOP/START, so its answer blocks a send even when SuCasa holds
 * no local record. Best effort: an unreachable or unconfigured provider never
 * turns into a false "allowed" for a number we already know opted out, and
 * never blocks a number nobody opted out of.
 */
export async function providerSmsBlocked(phone: string | null | undefined): Promise<boolean> {
  const key = normalizePhoneKey(phone);
  if (!key) return false;
  try {
    const { lookupContactDnd } = await import("./ghl.server");
    return await lookupContactDnd(key);
  } catch {
    return false;
  }
}

/**
 * The gate. Transactional messages always pass. Marketing messages pass only
 * when the suppression register, the person's preferences and (for texts) the
 * provider all allow it.
 */
export async function assertSendAllowed(
  admin: any,
  input: PolicySubject & { purpose: MessagePurpose; channel: MessageChannel },
): Promise<PolicyDecision> {
  if (!input.purpose) {
    throw new Error("Every outbound message must declare a purpose");
  }
  if (input.purpose === "transactional") {
    return { allowed: true, reason: null, code: "allowed" };
  }

  const { isSuppressed } = await import("./suppression.server");
  if (
    await isSuppressed(admin, {
      email: input.email,
      phone: input.phone,
      street: input.street,
      zip: input.zip,
    })
  ) {
    return { allowed: false, reason: BLOCKED_REASON, code: "suppressed" };
  }

  const prefs = await loadPreferences(admin, input);
  if (input.channel === "email" && !prefs.marketing_email) {
    return { allowed: false, reason: BLOCKED_REASON, code: "preference" };
  }
  if (input.channel === "call" && !prefs.marketing_calls) {
    return { allowed: false, reason: BLOCKED_REASON, code: "preference" };
  }
  if (input.channel === "sms") {
    if (!prefs.marketing_sms) {
      return { allowed: false, reason: BLOCKED_REASON, code: "preference" };
    }
    if (prefs.sms_consent_required) {
      return { allowed: false, reason: BLOCKED_REASON, code: "consent_required" };
    }
    if (await providerSmsBlocked(input.phone)) {
      // Mirror the provider's state so later sends are blocked without a lookup.
      await recordProviderOptOut(admin, { phone: input.phone ?? null, source: "provider_dnd" });
      return { allowed: false, reason: BLOCKED_REASON, code: "provider_stop" };
    }
  }
  return { allowed: true, reason: null, code: "allowed" };
}

type PreferencePatch = Partial<
  Pick<
    PreferenceRow,
    "marketing_email" | "marketing_sms" | "marketing_calls" | "sms_consent_required"
  >
> & { sms_consent_version?: string | null; sms_consent_at?: string | null };

export interface PreferenceChangeEvidence {
  channel: MessageChannel | "all";
  source: string;
  scope?: string;
  consentVersion?: string | null;
  consentText?: string | null;
  providerMessageId?: string | null;
  webEventId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Write a preference change plus its evidence. The audit row keeps prior state,
 * new state, channel, scope, source, timestamp and consent wording — never the
 * body of any message.
 */
export async function setPreferences(
  admin: any,
  subject: PolicySubject,
  patch: PreferencePatch,
  evidence: PreferenceChangeEvidence,
): Promise<PreferenceRow> {
  const { emailHmac, phoneHmac } = subjectKeys(subject);
  const prior = await loadPreferences(admin, subject);

  const ors: string[] = [];
  if (subject.userId) ors.push(`user_id.eq.${subject.userId}`);
  if (emailHmac) ors.push(`email_hmac.eq.${emailHmac}`);
  if (phoneHmac) ors.push(`phone_hmac.eq.${phoneHmac}`);

  let existing: any = null;
  if (ors.length) {
    const { data } = await admin
      .from("communication_preferences")
      .select("*")
      .or(ors.join(","))
      .limit(1);
    existing = (data ?? [])[0] ?? null;
  }

  const next = {
    user_id: subject.userId ?? existing?.user_id ?? null,
    email_hmac: emailHmac ?? existing?.email_hmac ?? null,
    phone_hmac: phoneHmac ?? existing?.phone_hmac ?? null,
    marketing_email: patch.marketing_email ?? prior.marketing_email,
    marketing_sms: patch.marketing_sms ?? prior.marketing_sms,
    marketing_calls: patch.marketing_calls ?? prior.marketing_calls,
    sms_consent_required: patch.sms_consent_required ?? prior.sms_consent_required,
    sms_consent_version: patch.sms_consent_version ?? existing?.sms_consent_version ?? null,
    sms_consent_at: patch.sms_consent_at ?? existing?.sms_consent_at ?? null,
  };

  if (existing?.id) {
    await admin.from("communication_preferences").update(next).eq("id", existing.id);
  } else {
    await admin.from("communication_preferences").insert(next);
  }

  await admin.from("communication_preference_events").insert({
    user_id: next.user_id,
    email_hmac: next.email_hmac,
    phone_hmac: next.phone_hmac,
    channel: evidence.channel,
    scope: evidence.scope ?? "marketing",
    prior_state: {
      marketing_email: prior.marketing_email,
      marketing_sms: prior.marketing_sms,
      marketing_calls: prior.marketing_calls,
      sms_consent_required: prior.sms_consent_required,
    },
    new_state: {
      marketing_email: next.marketing_email,
      marketing_sms: next.marketing_sms,
      marketing_calls: next.marketing_calls,
      sms_consent_required: next.sms_consent_required,
    },
    source: evidence.source,
    consent_version: evidence.consentVersion ?? null,
    consent_text: evidence.consentText ?? null,
    provider_message_id: evidence.providerMessageId ?? null,
    web_event_id: evidence.webEventId ?? null,
    ip: evidence.ip ?? null,
    user_agent: evidence.userAgent ?? null,
  });

  return {
    marketing_email: next.marketing_email,
    marketing_sms: next.marketing_sms,
    marketing_calls: next.marketing_calls,
    sms_consent_required: next.sms_consent_required,
  };
}

/** A STOP reply (or provider do-not-disturb): marketing texts stop at once. */
export async function recordProviderOptOut(
  admin: any,
  input: { phone: string | null; email?: string | null; providerMessageId?: string | null; source?: string },
): Promise<void> {
  await setPreferences(
    admin,
    { phone: input.phone, email: input.email ?? null },
    { marketing_sms: false, sms_consent_required: true },
    {
      channel: "sms",
      source: input.source ?? "provider_stop",
      providerMessageId: input.providerMessageId ?? null,
    },
  );
}

export const SMS_CONSENT_VERSION = "sms-marketing-2026-09";
export const SMS_CONSENT_TEXT =
  "I agree to receive marketing and relationship text messages from SuCasa and the professionals I work with at this number. Message and data rates may apply. Reply STOP to opt out.";

/**
 * Renewed consent. Nothing here flips a boolean on its own: the caller must
 * supply the evidence available on its channel — a web form supplies IP and
 * user agent, a START reply supplies the keyword, sending number and provider
 * message id.
 */
export async function recordSmsReConsent(
  admin: any,
  subject: PolicySubject,
  evidence: {
    source: string;
    consentText?: string | null;
    consentVersion?: string | null;
    providerMessageId?: string | null;
    webEventId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<{ renewed: boolean }> {
  const consentText = evidence.consentText ?? SMS_CONSENT_TEXT;
  const hasEvidence = Boolean(
    evidence.providerMessageId || evidence.webEventId || evidence.ip || evidence.userAgent,
  );
  if (!hasEvidence) return { renewed: false };

  await setPreferences(
    admin,
    subject,
    {
      marketing_sms: true,
      sms_consent_required: false,
      sms_consent_version: evidence.consentVersion ?? SMS_CONSENT_VERSION,
      sms_consent_at: new Date().toISOString(),
    },
    {
      channel: "sms",
      source: evidence.source,
      consentVersion: evidence.consentVersion ?? SMS_CONSENT_VERSION,
      consentText,
      providerMessageId: evidence.providerMessageId ?? null,
      webEventId: evidence.webEventId ?? null,
      ip: evidence.ip ?? null,
      userAgent: evidence.userAgent ?? null,
    },
  );
  return { renewed: true };
}

/**
 * Person-level do-not-contact flags for a set of organization-held client
 * records, so the per-organization permission layer can be combined with the
 * person's own preference. The stricter of the two always wins and the
 * professional only ever sees the blocked/allowed outcome.
 */
export async function personChannelBlocks(
  admin: any,
  contacts: ReadonlyArray<{ id: string; email?: string | null; phone?: string | null }>,
): Promise<Map<string, { do_not_email: boolean; do_not_text: boolean; do_not_call: boolean }>> {
  const out = new Map<
    string,
    { do_not_email: boolean; do_not_text: boolean; do_not_call: boolean }
  >();
  if (!contacts.length) return out;

  const hmacs = new Set<string>();
  const perContact = contacts.map((c) => {
    const keys = subjectKeys({ email: c.email, phone: c.phone });
    if (keys.emailHmac) hmacs.add(keys.emailHmac);
    if (keys.phoneHmac) hmacs.add(keys.phoneHmac);
    return { id: c.id, ...keys };
  });
  if (!hmacs.size) return out;

  const list = [...hmacs];
  const ors = [
    `email_hmac.in.(${list.join(",")})`,
    `phone_hmac.in.(${list.join(",")})`,
  ].join(",");
  const { data } = await admin
    .from("communication_preferences")
    .select("email_hmac, phone_hmac, marketing_email, marketing_sms, marketing_calls, sms_consent_required")
    .or(ors)
    .limit(2000);

  const rows = (data ?? []) as PreferenceRow[];
  for (const c of perContact) {
    const matches = rows.filter(
      (r) =>
        (c.emailHmac && r.email_hmac === c.emailHmac) ||
        (c.phoneHmac && r.phone_hmac === c.phoneHmac),
    );
    if (!matches.length) continue;
    out.set(c.id, {
      do_not_email: matches.some((r) => r.marketing_email === false),
      do_not_text: matches.some((r) => r.marketing_sms === false || r.sms_consent_required === true),
      do_not_call: matches.some((r) => r.marketing_calls === false),
    });
  }
  return out;
}

/** Fold person-level blocks into per-organization permission rows in place. */
export function mergePersonBlocks<T extends { portfolio_client_id?: string | null }>(
  perms: T[],
  blocks: Map<string, { do_not_email: boolean; do_not_text: boolean; do_not_call: boolean }>,
  allClientIds: ReadonlyArray<string>,
): T[] {
  const byClient = new Map<string, T>();
  for (const p of perms) {
    if (p.portfolio_client_id) byClient.set(p.portfolio_client_id, p);
  }
  for (const clientId of allClientIds) {
    const block = blocks.get(clientId);
    if (!block) continue;
    const existing = byClient.get(clientId) as any;
    if (existing) {
      existing.do_not_email = existing.do_not_email || block.do_not_email;
      existing.do_not_text = existing.do_not_text || block.do_not_text;
      existing.do_not_call = existing.do_not_call || block.do_not_call;
    } else {
      const row = { portfolio_client_id: clientId, ...block } as unknown as T;
      byClient.set(clientId, row);
      perms.push(row);
    }
  }
  return perms;
}

/**
 * Connected Lending Partner — pure rules (no IO).
 *
 * This is a relationship feature, not paid placement. Nothing here reads a
 * plan, price, subscription, capacity or sponsorship: a lender appears to a
 * homeowner only because the homeowner's own agent chose them.
 */

export const LENDING_DISCLOSURE_VERSION = "lending-contact-v2";
export const LENDING_CONSENT_LANGUAGE = "Send my name, selected contact information, property address and request to discuss financing to my agent's designated loan officer. Estimated home value and equity are shared only if I select the separate option. This does not authorize unrelated marketing, automated promotional messages or access to private records.";

export function inquiryConsentLanguage(language: "en" | "es", includeValueEquity: boolean) {
  if (language === "es") return "Autorizo enviar mi nombre, el contacto seleccionado, la dirección de mi propiedad y mi solicitud para hablar sobre financiamiento al oficial de préstamos designado por mi agente. " + (includeValueEquity ? "También autorizo compartir el valor estimado de mi casa y mi equity. " : "No autorizo compartir el valor estimado de mi casa ni mi equity. ") + "No autorizo marketing no relacionado, mensajes promocionales automáticos ni acceso a documentos o información privada.";
  return "I authorize sending my name, selected contact information, property address and financing conversation request to my agent's designated loan officer. " + (includeValueEquity ? "I also authorize sharing my estimated home value and equity. " : "I do not authorize sharing my estimated home value or equity. ") + "This does not authorize unrelated marketing, automated promotional messages or access to private documents or information.";
}

/** Recorded identifiers are not registry-verified credentials. Drop obvious placeholders. */
export function displayedNmls(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().replace(/^#?\s*NMLS\s*#?\s*/i, "").replace(/^#/, "").trim();
  return /^\d+$/.test(id) && !/^0+$/.test(id) ? id : null;
}

/** Shared by default after explicit confirmation — nothing financial. */
export const DEFAULT_SHARED_FIELDS = ["name", "contact", "address"] as const;
/** Only added when the homeowner ticks the separate box. */
export const OPTIONAL_SHARED_FIELDS = ["value_equity"] as const;
export type SharedField =
  | (typeof DEFAULT_SHARED_FIELDS)[number]
  | (typeof OPTIONAL_SHARED_FIELDS)[number];

/**
 * The LO the agent is offered for confirmation: the officer who owns the
 * relationship (set when a branch manager invites on an LO's behalf), else
 * whoever sent the invitation.
 */
export function suggestedOfficer(conn: {
  owner_user_id: string | null;
  invited_by: string | null;
}): string | null {
  return conn.owner_user_id ?? conn.invited_by ?? null;
}

export interface AgentClientLink {
  agent_org_id: string;
  org_type: string | null;
  homeowner_id: string | null;
  archived_at: string | null;
  created_at: string;
}

/**
 * The agent relationship that authorizes showing a lending contact. A CSV row
 * alone never counts — the homeowner must have linked their own account
 * (homeowner_id set by their sign-in/claim) and the row must be active.
 */
export function authorizedAgentOrg(homeownerId: string, links: AgentClientLink[]): string | null {
  const ok = links
    .filter(
      (l) => l.org_type === "agent" && l.homeowner_id === homeownerId && !l.archived_at,
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return ok[0]?.agent_org_id ?? null;
}

/** A designation is shown only while the agent–lender connection is live and the LO is still on the team. */
export function designationIsLive(args: {
  designationRemoved: boolean;
  connectionStatus: string | null;
  officerActiveMember: boolean;
}): boolean {
  return (
    !args.designationRemoved && args.connectionStatus === "connected" && args.officerActiveMember
  );
}

/** Normalizes what the homeowner agreed to share; unknown fields are dropped. */
export function sharedFieldsFor(includeValueEquity: boolean): SharedField[] {
  return includeValueEquity
    ? [...DEFAULT_SHARED_FIELDS, "value_equity"]
    : [...DEFAULT_SHARED_FIELDS];
}

/** The only contact values passed to the officer: the one channel the homeowner chose. */
export function contactPayload(input: {
  channel: "email" | "phone";
  email: string | null;
  phone: string | null;
}): { email: string | null; phone: string | null } {
  if (input.channel === "email") {
    if (!input.email) throw new Error("Add an email address to be contacted by email");
    return { email: input.email, phone: null };
  }
  if (!input.phone) throw new Error("Add a phone number to be contacted by phone");
  return { email: null, phone: input.phone };
}

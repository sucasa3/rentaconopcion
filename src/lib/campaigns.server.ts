/**
 * Homeowner campaign engine — server only.
 *
 * SuCasa is the brain: it decides WHO should hear WHAT and WHEN, assembles the
 * property facts, and writes the personalized copy. GoHighLevel is the sender:
 * we push the computed values onto the GHL contact as custom fields and apply
 * a campaign tag that triggers the workflow/email template there.
 *
 * Cost control: this engine reads the cached `property_intel` rows only — it
 * never triggers a fresh ATTOM call.
 */

import { normalizeAddress } from "@/lib/attom.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

export type CampaignRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  channel: string;
  cadence: string;
  trigger_month: number | null;
  min_days_between: number;
  ghl_tag: string;
  prompt_template: string;
  data_fields: string[];
  cta_label: string | null;
  cta_url: string | null;
  active: boolean;
};

export type CampaignTarget = {
  clientId: string;
  orgId: string;
  orgName: string;
  orgType: string;
  homeownerId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  closeDate: string | null;
  loanAtCloseCents: number | null;
  rateAtClose: number | null;
};

/** Partner (lender/agent org) branding applied to every campaign email. */
export type OrgBranding = {
  orgName: string;
  senderName: string | null;
  replyToEmail: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactPhone: string | null;
  licenseNumber: string | null;
  logoUrl: string | null;
  signoff: string | null;
};

/** Per-org wording overrides for a single campaign. */
export type CampaignOverride = {
  subject: string | null;
  intro: string | null;
  closing: string | null;
  cta_label: string | null;
  cta_url: string | null;
};

export function brandingFromOrg(o: {
  name?: string | null;
  sender_name?: string | null;
  reply_to_email?: string | null;
  contact_name?: string | null;
  contact_title?: string | null;
  contact_phone?: string | null;
  license_number?: string | null;
  logo_url?: string | null;
  signoff?: string | null;
}): OrgBranding {
  return {
    orgName: o.name ?? "",
    senderName: o.sender_name ?? null,
    replyToEmail: o.reply_to_email ?? null,
    contactName: o.contact_name ?? null,
    contactTitle: o.contact_title ?? null,
    contactPhone: o.contact_phone ?? null,
    licenseNumber: o.license_number ?? null,
    logoUrl: o.logo_url ?? null,
    signoff: o.signoff ?? null,
  };
}

/** Per-member (MLO/agent) sender identity fields, all optional. */
export type MemberBrandFields = {
  sender_name?: string | null;
  reply_to_email?: string | null;
  contact_name?: string | null;
  contact_title?: string | null;
  contact_phone?: string | null;
  license_number?: string | null;
  logo_url?: string | null;
  signoff?: string | null;
};

/**
 * Resolve the identity a homeowner actually sees: the portfolio owner's
 * personal sender profile, falling back field-by-field to the org defaults.
 */
export function mergeBranding(
  org: OrgBranding,
  member?: MemberBrandFields | null,
): OrgBranding {
  if (!member) return org;
  const pick = (a: string | null | undefined, b: string | null) =>
    a != null && a !== "" ? a : b;
  return {
    orgName: org.orgName,
    senderName: pick(member.sender_name, org.senderName),
    replyToEmail: pick(member.reply_to_email, org.replyToEmail),
    contactName: pick(member.contact_name, org.contactName),
    contactTitle: pick(member.contact_title, org.contactTitle),
    contactPhone: pick(member.contact_phone, org.contactPhone),
    licenseNumber: pick(member.license_number, org.licenseNumber),
    logoUrl: pick(member.logo_url, org.logoUrl),
    signoff: pick(member.signoff, org.signoff),
  };
}

export type CampaignFacts = {
  value: number | null;
  valueChange: number | null;
  equity: number | null;
  equityPct: number | null;
  loanBalance: number | null;
  rate: number | null;
  estimatedSavings: number | null;
  yearBuilt: number | null;
  homeAge: number | null;
  yearsOwned: number | null;
  assessedValue: number | null;
  taxAmount: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  city: string | null;
  state: string | null;
  refiSignal: string | null;
};

const MARKET_RATE = 6.5;

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

/** Pull cached property intel for an address (no ATTOM calls). */
export async function loadCachedFacts(t: CampaignTarget): Promise<CampaignFacts> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const fullAddress = [t.address, t.city, t.state, t.zip].filter(Boolean).join(", ");
  const { data: row } = await supabaseAdmin
    .from("property_intel")
    .select("avm, detail, tax, sales, mortgage")
    .eq("address_normalized", normalizeAddress(fullAddress))
    .maybeSingle();

  const facts: CampaignFacts = {
    value: null,
    valueChange: null,
    equity: null,
    equityPct: null,
    loanBalance: null,
    rate: t.rateAtClose ?? null,
    estimatedSavings: null,
    yearBuilt: null,
    homeAge: null,
    yearsOwned: null,
    assessedValue: null,
    taxAmount: null,
    lastSalePrice: null,
    lastSaleDate: null,
    city: t.city,
    state: t.state,
    refiSignal: null,
  };

  if (t.closeDate) {
    const years = (Date.now() - new Date(t.closeDate).getTime()) / (365.25 * 24 * 3600 * 1000);
    facts.yearsOwned = Math.max(0, Math.round(years * 10) / 10);
  }

  if (row) {
    const {
      extractAvm,
      extractDetail,
      extractTax,
      extractSales,
      extractMortgage,
      computeEquityRibbon,
      estimateLoanBalance,
    } = await import("@/lib/valuation.server");

    const avm = row.avm ? extractAvm(row.avm) : null;
    const detail = row.detail ? extractDetail(row.detail) : null;
    const tax = row.tax ? extractTax(row.tax) : null;
    const sales = row.sales ? extractSales(row.sales) : null;
    const mortgage = row.mortgage ? extractMortgage(row.mortgage) : null;

    facts.value = avm?.estimate ?? null;
    facts.yearBuilt = detail?.yearBuilt ?? null;
    if (facts.yearBuilt) facts.homeAge = new Date().getFullYear() - facts.yearBuilt;
    facts.assessedValue = (tax as { assessedValue?: number | null } | null)?.assessedValue ?? null;
    facts.taxAmount = (tax as { taxAmount?: number | null } | null)?.taxAmount ?? null;
    facts.lastSalePrice = (sales as { lastSalePrice?: number | null } | null)?.lastSalePrice ?? null;
    facts.lastSaleDate = (sales as { lastSaleDate?: string | null } | null)?.lastSaleDate ?? null;

    const ribbon = computeEquityRibbon(avm, mortgage, sales, tax);
    facts.equity = ribbon.equityDollars;
    facts.equityPct = ribbon.equityPct;
    facts.refiSignal = ribbon.refiSignal;
    facts.loanBalance = ribbon.loanBalanceEstimate ?? (mortgage ? estimateLoanBalance(mortgage) : null);
    if (mortgage?.interestRate != null) facts.rate = mortgage.interestRate;

    if (facts.lastSalePrice && facts.value) {
      facts.valueChange = facts.value - facts.lastSalePrice;
    }
  }

  if (facts.loanBalance == null && t.loanAtCloseCents != null) {
    facts.loanBalance = Math.round(t.loanAtCloseCents / 100);
  }
  if (facts.equity == null && facts.value != null && facts.loanBalance != null) {
    facts.equity = facts.value - facts.loanBalance;
    facts.equityPct = facts.value > 0 ? facts.equity / facts.value : null;
  }

  // Rough monthly savings if they refinanced to the current market rate.
  if (facts.rate != null && facts.loanBalance != null && facts.rate > MARKET_RATE) {
    const p = facts.loanBalance;
    const pay = (annualRate: number) => {
      const r = annualRate / 100 / 12;
      const n = 360;
      return (p * r) / (1 - Math.pow(1 + r, -n));
    };
    facts.estimatedSavings = Math.max(0, Math.round(pay(facts.rate) - pay(MARKET_RATE)));
  }

  return facts;
}

/** Is this campaign due for this client right now? */
export function isDue(
  campaign: CampaignRow,
  facts: CampaignFacts,
  target: CampaignTarget,
  lastSentAt: string | null,
  now = new Date(),
): { due: boolean; reason: string } {
  if (lastSentAt) {
    const days = (now.getTime() - new Date(lastSentAt).getTime()) / 86400000;
    if (days < campaign.min_days_between) {
      return { due: false, reason: `sent ${Math.round(days)}d ago` };
    }
  }

  const month = now.getUTCMonth() + 1;

  if (campaign.cadence === "seasonal") {
    if (campaign.trigger_month && campaign.trigger_month !== month) {
      return { due: false, reason: "out of season" };
    }
    return { due: true, reason: "seasonal window" };
  }

  if (campaign.key === "home_anniversary") {
    if (!target.closeDate) return { due: false, reason: "no close date" };
    if (new Date(target.closeDate).getUTCMonth() + 1 !== month) {
      return { due: false, reason: "not anniversary month" };
    }
    return { due: true, reason: "anniversary month" };
  }

  if (campaign.key === "refi_opportunity") {
    if (facts.refiSignal !== "strong" && facts.refiSignal !== "moderate") {
      return { due: false, reason: "no refi signal" };
    }
    return { due: true, reason: `refi signal ${facts.refiSignal}` };
  }

  if (campaign.key === "equity_checkup") {
    if (facts.equityPct == null || facts.equityPct < 0.2) {
      return { due: false, reason: "equity under 20%" };
    }
    return { due: true, reason: "equity checkup window" };
  }

  if (campaign.key === "monthly_value_update") {
    if (facts.value == null) return { due: false, reason: "no cached value" };
    return { due: true, reason: "monthly window" };
  }

  if (campaign.key === "vendor_recommendation") {
    if (facts.homeAge == null || facts.homeAge < 8) {
      return { due: false, reason: "no maintenance signal" };
    }
    return { due: true, reason: `home age ${facts.homeAge}` };
  }

  if (campaign.cadence === "monthly" || campaign.cadence === "quarterly") {
    return { due: true, reason: "cadence window" };
  }

  return { due: false, reason: "no trigger" };
}

function factsBlock(facts: CampaignFacts, t: CampaignTarget): string {
  const l: string[] = [];
  l.push(`Homeowner: ${t.name ?? "there"}`);
  l.push(`Address: ${[t.address, t.city, t.state].filter(Boolean).join(", ")}`);
  if (facts.value != null) l.push(`Estimated value: ${fmtMoney(facts.value)}`);
  if (facts.valueChange != null) l.push(`Change since purchase: ${fmtMoney(facts.valueChange)}`);
  if (facts.equity != null) l.push(`Equity: ${fmtMoney(facts.equity)}`);
  if (facts.equityPct != null) l.push(`Equity share: ${Math.round(facts.equityPct * 100)}%`);
  if (facts.loanBalance != null) l.push(`Estimated loan balance: ${fmtMoney(facts.loanBalance)}`);
  if (facts.rate != null) l.push(`Mortgage rate: ${facts.rate.toFixed(2)}%`);
  if (facts.estimatedSavings != null) l.push(`Estimated monthly refi savings: ${fmtMoney(facts.estimatedSavings)}`);
  if (facts.yearBuilt != null) l.push(`Year built: ${facts.yearBuilt} (age ${facts.homeAge})`);
  if (facts.yearsOwned != null) l.push(`Years owned: ${facts.yearsOwned}`);
  if (facts.assessedValue != null) l.push(`Assessed value: ${fmtMoney(facts.assessedValue)}`);
  if (facts.taxAmount != null) l.push(`Annual property tax: ${fmtMoney(facts.taxAmount)}`);
  if (facts.lastSalePrice != null) l.push(`Last sale: ${fmtMoney(facts.lastSalePrice)}${facts.lastSaleDate ? ` on ${facts.lastSaleDate}` : ""}`);
  return l.join("\n");
}

/** Generate the personalized subject + body for one homeowner. */
export async function generateCopy(
  campaign: CampaignRow,
  facts: CampaignFacts,
  target: CampaignTarget,
  language: "en" | "es" = "en",
  override?: CampaignOverride | null,
): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  const intro = override?.intro?.trim() || "";
  const closing = override?.closing?.trim() || "";
  const wrap = (core: string) => [intro, core, closing].filter(Boolean).join("\n\n");

  const fallbackSubject = override?.subject?.trim() || campaign.name;
  const fallbackBody = wrap(
    `Hi ${target.name?.split(" ")[0] ?? "there"}, here is your ${campaign.name.toLowerCase()} for ${target.address}.`,
  );

  if (!apiKey) return { subject: fallbackSubject, body: fallbackBody };

  const system = [
    `You write short homeowner emails for SuCasa on behalf of ${target.orgName} (a ${target.orgType === "agent" ? "real estate agent office" : "mortgage lender"}).`,
    `Tone: warm, useful, never salesy. Plain English. No emojis, no subject-line hype, no invented numbers.`,
    `Use ONLY the facts provided. If a fact is missing, leave it out rather than guessing.`,
    language === "es" ? "Escribe SIEMPRE en español." : "Write in English.",
    intro || closing
      ? `The partner supplies their own opening and/or closing lines separately — write ONLY the middle data paragraph, with no greeting and no sign-off.`
      : ``,
    `Return strict JSON: {"subject": string, "body": string}. Subject under 60 characters. Body 40-90 words, no signature, no greeting line beyond the first name.`,
  ]
    .filter(Boolean)
    .join(" ");

  const user = [
    `Campaign: ${campaign.name}`,
    `Instruction: ${campaign.prompt_template}`,
    ``,
    `=== FACTS ===`,
    factsBlock(facts, target),
  ].join("\n");

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[campaigns] gateway ${res.status}: ${text.slice(0, 300)}`);
      return { subject: fallbackSubject, body: fallbackBody };
    }
    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { subject?: string; body?: string };
    return {
      subject: (override?.subject?.trim() || parsed.subject || fallbackSubject).slice(0, 120),
      body: wrap(parsed.body || fallbackBody),
    };
  } catch (e) {
    console.error("[campaigns] copy generation failed:", (e as Error).message);
    return { subject: fallbackSubject, body: fallbackBody };
  }
}

export function buildPayload(
  campaign: CampaignRow,
  facts: CampaignFacts,
  target: CampaignTarget,
  copy: { subject: string; body: string },
  branding?: OrgBranding | null,
  override?: CampaignOverride | null,
) {
  const partnerName = branding?.orgName || target.orgName;
  const signatureLines = [
    branding?.contactName,
    branding?.contactTitle,
    partnerName,
    branding?.contactPhone,
    branding?.replyToEmail,
    branding?.licenseNumber ? `License ${branding.licenseNumber}` : null,
  ].filter(Boolean) as string[];

  return {
    campaign: campaign.key,
    campaign_name: campaign.name,
    first_name: target.name?.split(" ")[0] ?? "",
    full_name: target.name ?? "",
    property_address: [target.address, target.city, target.state, target.zip].filter(Boolean).join(", "),
    property_value: fmtMoney(facts.value),
    equity: fmtMoney(facts.equity),
    equity_pct: facts.equityPct != null ? `${Math.round(facts.equityPct * 100)}%` : "",
    loan_balance: fmtMoney(facts.loanBalance),
    rate: facts.rate != null ? `${facts.rate.toFixed(2)}%` : "",
    estimated_savings: fmtMoney(facts.estimatedSavings),
    partner_name: partnerName,
    partner_type: target.orgType,
    // Partner-branded, SuCasa-powered sender identity (merged in the GHL template)
    sender_name: branding?.senderName || partnerName,
    reply_to: branding?.replyToEmail ?? "",
    contact_name: branding?.contactName ?? "",
    contact_title: branding?.contactTitle ?? "",
    contact_phone: branding?.contactPhone ?? "",
    license: branding?.licenseNumber ?? "",
    logo_url: branding?.logoUrl ?? "",
    signoff: branding?.signoff ?? "",
    signature_block: signatureLines.join("\n"),
    sent_on_behalf_of: `Sent by SuCasa on behalf of ${partnerName}`,
    subject: copy.subject,
    body: copy.body,
    next_cta: override?.cta_label?.trim() || campaign.cta_label || "See my home report",
    cta_url: override?.cta_url?.trim() || campaign.cta_url || "https://rentaconopcion.lovable.app/dashboard",
  };
}


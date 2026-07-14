// Fello.ai REST wrapper — server-only.
const BASE = "https://api.fello.ai/public/v1";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function felloFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": env("FELLO_API_KEY"),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Fello ${init.method ?? "GET"} ${path} [${res.status}]: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

export type FelloContactInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tags?: string[];
  crmFields?: {
    name?: string;
    url?: string;
    source?: string;
    stage?: string;
    createdDate?: string;
  };
};

export type FelloContact = {
  contactId: string;
  name?: string;
  phone?: string;
  email?: string;
  emailStatus?: string;
  recordStatus?: string;
  tags?: string[];
  leadScore?: number;
  properties?: Array<{
    propertyId: string;
    address?: {
      aptOrUnitNumber?: string;
      streetAddress?: string;
      city?: string;
      county?: string;
      state?: string;
      zip?: string;
    };
    // Fello may include valuation fields here on enriched contacts.
    estimatedValue?: number;
    equity?: number;
  }>;
};

export async function addFelloContact(input: FelloContactInput): Promise<FelloContact> {
  const body: Record<string, unknown> = {
    name: input.name || undefined,
    email: input.email || undefined,
    phone: input.phone || undefined,
    address: input.address || undefined,
    tags: input.tags?.length ? input.tags : undefined,
    crmFields: input.crmFields,
  };
  const r = await felloFetch(`/contact`, { method: "POST", body: JSON.stringify(body) });
  return (r.contact ?? r) as FelloContact;
}

export async function getFelloContact(opts: { contactId?: string; email?: string }): Promise<FelloContact | null> {
  const q = new URLSearchParams();
  if (opts.contactId) q.set("contactId", opts.contactId);
  if (opts.email) q.set("emailId", opts.email);
  try {
    const r = await felloFetch(`/contact?${q}`);
    return r as FelloContact;
  } catch (e) {
    if (e instanceof Error && /\[404\]/.test(e.message)) return null;
    throw e;
  }
}

export async function addFelloProperty(contactId: string, address: string) {
  return felloFetch(`/contact/${encodeURIComponent(contactId)}/property`, {
    method: "POST",
    body: JSON.stringify({ address }),
  });
}

export type FelloWebhookEventType =
  | "FormSubmission"
  | "ContactEnriched"
  | "DashboardClick"
  | "EmailClick"
  | "PostcardScan"
  | "ContactUnsubscribed"
  | "ContactDetailsUpdated"
  | "TagsAdded"
  | "TagsRemoved"
  | "FelixAIHandoff";

export async function subscribeFelloWebhook(url: string, eventType: FelloWebhookEventType) {
  return felloFetch(`/webhooks`, {
    method: "POST",
    body: JSON.stringify({ url, eventType }),
  });
}

export async function listFelloWebhooks() {
  return felloFetch(`/webhooks`);
}

export async function unsubscribeFelloWebhook(subscriptionId: string) {
  return felloFetch(`/webhooks/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
}

// Best-effort extract of the AVM/equity numbers Fello returns on enriched
// contacts. Field naming can vary across accounts — probe common shapes.
export function extractValuation(contact: FelloContact): {
  estimatedValueCents: number | null;
  equityCents: number | null;
} {
  const first = contact.properties?.[0] as (Record<string, unknown> | undefined);
  const toCents = (n: unknown): number | null => {
    if (typeof n !== "number" || !isFinite(n)) return null;
    // Fello returns dollars.
    return Math.round(n * 100);
  };
  const value = toCents(first?.estimatedValue) ?? toCents((first as { avm?: number } | undefined)?.avm);
  const equity = toCents(first?.equity);
  return { estimatedValueCents: value, equityCents: equity };
}

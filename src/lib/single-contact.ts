// Single-client entry rules shared by the agent and lender "add one" forms.
// With an address the existing add flow runs; without one, the contact is sent
// through the mixed-upload pipeline as a one-row file so it is staged contact-only
// (no Home Profile, no paid lookup) and gets the same reverse-search panel.

export type SingleContactInput = { fullName: string; address: string; email: string; phone: string };

export function singleContactMode(f: SingleContactInput): "address" | "contact_only" | "invalid" {
  if (!f.fullName.trim()) return "invalid";
  if (f.address.trim()) return "address";
  const digits = f.phone.replace(/\D/g, "");
  const phoneOk = digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim());
  return phoneOk || emailOk ? "contact_only" : "invalid";
}

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function singleContactCsv(f: { fullName: string; email: string; phone: string }): string {
  return `full_name,email,phone\n${[f.fullName.trim(), f.email.trim(), f.phone.trim()].map(cell).join(",")}\n`;
}

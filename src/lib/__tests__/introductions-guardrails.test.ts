import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ECONOMIC_GUARDRAIL } from "@/lib/introductions";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const introServer = read("src/lib/introductions.server.ts");
const introFns = read("src/lib/introductions.functions.ts");
const networkServer = read("src/lib/network.server.ts");
const networkFns = read("src/lib/network.functions.ts");
const lenderPanel = read("src/components/lender-introductions-panel.tsx");
const lenderWorkspace = read("src/components/lender-network-workspace.tsx");
const tasksServer = read("src/lib/tasks.server.ts");

describe("no lender reveal path outside the accepted-introduction gate", () => {
  it("removed the old agent-approval reveal entirely", () => {
    for (const src of [networkServer, networkFns]) {
      expect(src).not.toContain("revealApprovedContact");
      expect(src).not.toContain("deidentifiedOpportunities");
    }
  });

  it("keeps identifying client columns out of every lender-facing network read", () => {
    for (const forbidden of ["client_name", "client_email", "client_phone", "address_line1"]) {
      expect(networkServer).not.toContain(forbidden);
    }
  });

  it("gates the only lender reveal on canRevealHomeowner", () => {
    const fn = introServer.slice(introServer.indexOf("export async function acceptedIntroductionForLender"));
    expect(fn).toContain("canRevealHomeowner");
    expect(fn).toContain("assertMember");
    // Minimum necessary: no property, valuation, equity, mortgage or document reads.
    for (const forbidden of [
      "address_line1",
      "home_value",
      "equity",
      "mortgage",
      "home_documents",
      "property_intel",
      "home_profiles",
    ]) {
      expect(fn).not.toContain(forbidden);
    }
  });

  it("never lets a lender reach the agent's candidate list", () => {
    const fn = introServer.slice(
      introServer.indexOf("export async function candidatesForIntroduction"),
      introServer.indexOf("export async function respondToIntroductionAsAgent"),
    );
    expect(fn).toContain("intro.agent_org_id");
    expect(fn).not.toContain("lender_org_id");
  });

  it("gives the lender no per-homeowner surface in the UI", () => {
    for (const src of [lenderPanel, lenderWorkspace]) {
      expect(src).not.toContain("equity_band");
      expect(src).not.toContain("ltv_band");
      expect(src).not.toContain("tenure_band");
      expect(src).not.toContain("Reveal contact");
      expect(src).not.toContain("unlock");
    }
  });

  it("keeps lender-facing copy free of lead / book ownership framing", () => {
    for (const src of [lenderPanel, lenderWorkspace]) {
      const text = src.toLowerCase();
      expect(text).not.toContain("your leads");
      expect(text).not.toContain("claim an opportunity");
      expect(text).not.toContain("access their clients");
      expect(text).not.toContain("view the agent's opportunities");
    }
  });

  it("never hands a lender a client name through the task list", () => {
    const section = tasksServer.slice(
      tasksServer.indexOf("2 & 4. Introductions"),
      tasksServer.indexOf("3. Campaign approvals"),
    );
    expect(section).toContain('.eq("state", "lender_requested")');
    expect(section).toContain('.in("agent_org_id", orgIds)');
    expect(section).not.toContain("client_name");
  });
});

describe("state authority lives on the server", () => {
  it("starts every introduction at lender_requested with no client identifier", () => {
    const fn = introServer.slice(
      introServer.indexOf("export async function requestIntroductionForCategory"),
      introServer.indexOf("// Listing, per side"),
    );
    expect(fn).toContain("portfolio_client_id: null");
    expect(fn).toContain('state: "lender_requested"');
  });

  it("only the agent path may attach a client, and only from their own book", () => {
    const fn = introServer.slice(introServer.indexOf("export async function respondToIntroductionAsAgent"));
    expect(fn).toContain("agentMayRespond");
    expect(fn).toContain("That client is not in your book");
    expect(fn).toContain('state: "agent_offered"');
    // Offering asks the homeowner; it does not reveal anything to the lender.
    expect(fn).not.toContain("introduction_reveals");
  });

  it("records the full consent evidence on acceptance", () => {
    const fn = introServer.slice(introServer.indexOf("export async function answerIntroduction"));
    for (const field of [
      "disclosure_version",
      "disclosure_text",
      "language",
      "channels",
      "authorized_phone",
      "authorized_email",
      "lender_org_name_shown",
      "ip_address",
      "user_agent",
    ]) {
      expect(fn).toContain(field);
    }
  });

  it("keeps a lender-specific withdrawal from becoming a global suppression", () => {
    const fn = introServer.slice(introServer.indexOf("export async function revokeIntroductionChannels"));
    expect(fn).toContain('opts.scope === "all_communication"');
    const before = fn.slice(0, fn.indexOf('opts.scope === "all_communication"'));
    expect(before).not.toContain("outreach_channel_permissions");
  });

  it("exposes the consent ledger to nobody: no read path in server or functions", () => {
    expect(introServer).not.toContain('from("introduction_consent_events")\n    .select');
    expect(introFns).not.toContain("introduction_consent_events");
  });
});

describe("economic separation is structural", () => {
  it("introduction code touches no pricing, credit, capacity or entitlement surface", () => {
    for (const table of ECONOMIC_GUARDRAIL.forbiddenTables) {
      if (table === "lender_orgs") continue; // read only for the org's display name
      expect(introServer).not.toContain(table);
      expect(introFns).not.toContain(table);
    }
    for (const fn of ECONOMIC_GUARDRAIL.forbiddenFunctions) {
      expect(introServer).not.toContain(fn);
      expect(introFns).not.toContain(fn);
    }
  });

  it("reads only the lender org name and contact, never its plan or price", () => {
    const matches = introServer.match(/from\("lender_orgs"\)\s*\n\s*\.select\("([^"]+)"\)/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m).not.toContain("plan");
      expect(m).not.toContain("price");
      expect(m).not.toContain("tier");
      expect(m).not.toContain("credit");
    }
  });

  it("records no introduction outcome that could be priced (applications, closings)", () => {
    for (const src of [introServer, introFns]) {
      expect(src).not.toContain("funded");
      expect(src).not.toContain("loan_amount");
      expect(src).not.toContain("closed_value");
      expect(src).not.toContain("recordIntroductionOutcome");
    }
  });
});

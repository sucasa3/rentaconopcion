/**
 * THE HOME AGENT — shared, client-safe contract.
 *
 * The agent loop is: Observe -> Understand -> Prioritize -> Recommend -> Act -> Learn.
 * This module owns the vocabulary every layer agrees on: capabilities, the
 * permission ladder, action lifecycle and intent types. Server logic and UI
 * both import from here so "what the agent may do" is never defined twice.
 */

export type PermissionLevel = 1 | 2 | 3 | 4 | 5;

export const PERMISSION_LEVELS: {
  level: PermissionLevel;
  key: string;
  label: string;
  blurb: string;
}[] = [
  { level: 1, key: "observe", label: "Observe", blurb: "Watch and analyze only. Never suggests." },
  { level: 2, key: "recommend", label: "Recommend", blurb: "Tell me what it thinks I should do." },
  { level: 3, key: "prepare", label: "Prepare", blurb: "Get the work ready and wait for my tap." },
  { level: 4, key: "execute", label: "Do it", blurb: "Carry out this kind of task on its own." },
  { level: 5, key: "escalate", label: "Bring in a human", blurb: "Hand off to a qualified professional." },
];

export type CapabilityKey =
  | "watch"
  | "record_keeping"
  | "service_request"
  | "introductions";

export type Capability = {
  key: CapabilityKey;
  label: string;
  description: string;
  defaultLevel: PermissionLevel;
  /** Levels a homeowner can choose for this capability. */
  choices: PermissionLevel[];
};

export const CAPABILITIES: Capability[] = [
  {
    key: "watch",
    label: "Watch my home",
    description:
      "Monitor value, equity, system ages, inspection findings and important dates, and tell me what matters.",
    defaultLevel: 2,
    choices: [1, 2],
  },
  {
    key: "record_keeping",
    label: "Keep my home record up to date",
    description:
      "Remember details about my home, file what it learns, and log completed work so I don't have to.",
    defaultLevel: 4,
    choices: [1, 2, 3, 4],
  },
  {
    key: "service_request",
    label: "Get service handled",
    description:
      "Draft a service request from a real problem in my home record and send it once I approve.",
    defaultLevel: 3,
    choices: [1, 2, 3, 4],
  },
  {
    key: "introductions",
    label: "Connect me with professionals",
    description:
      "When a question really needs a human — an agent, a loan officer, a contractor — offer an introduction.",
    defaultLevel: 2,
    choices: [1, 2, 3],
  },
];

export function capabilityFor(key: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.key === key);
}

export function defaultPermissions(): Record<CapabilityKey, PermissionLevel> {
  return CAPABILITIES.reduce(
    (acc, c) => {
      acc[c.key] = c.defaultLevel;
      return acc;
    },
    {} as Record<CapabilityKey, PermissionLevel>,
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type AgentActionStatus =
  | "proposed"
  | "approved"
  | "in_progress"
  | "done"
  | "declined"
  | "blocked";

export type AgentAction = {
  id: string;
  capability: CapabilityKey | string;
  title: string;
  summary: string | null;
  rationale: string | null;
  sourceKind: string | null;
  sourceKey: string | null;
  requiredLevel: PermissionLevel;
  status: AgentActionStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  proposedAt: string;
  decidedAt: string | null;
  completedAt: string | null;
};

/** Plain-language line for the activity log: what it wanted, what it did. */
export function actionStatusLabel(status: AgentActionStatus): string {
  switch (status) {
    case "proposed":
      return "Waiting on you";
    case "approved":
      return "Approved";
    case "in_progress":
      return "Working on it";
    case "done":
      return "Done";
    case "declined":
      return "You said no";
    case "blocked":
      return "Needs permission";
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

export const INTENT_TYPES = [
  "SELL",
  "BUY",
  "REFINANCE",
  "HELOC",
  "INVEST",
  "RENOVATE",
  "MAINTAIN",
  "REPAIR",
  "INSURE",
  "MOVE",
  "VALUE",
  "FINANCIAL_PLANNING",
] as const;

export type IntentType = (typeof INTENT_TYPES)[number];

export const INTENT_LABELS: Record<IntentType, string> = {
  SELL: "Thinking about selling",
  BUY: "Thinking about buying",
  REFINANCE: "Looking at refinancing",
  HELOC: "Interested in using equity",
  INVEST: "Investment interest",
  RENOVATE: "Planning a renovation",
  MAINTAIN: "Keeping the home in shape",
  REPAIR: "Something needs fixing",
  INSURE: "Insurance question",
  MOVE: "Planning a move",
  VALUE: "Curious about value",
  FINANCIAL_PLANNING: "Financial planning",
};

export type HomeownerIntent = {
  id: string;
  intentType: IntentType | string;
  status: string;
  confidence: number;
  evidence: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export const MEMORY_KINDS = [
  "preference",
  "goal",
  "important_date",
  "appliance",
  "system",
  "note",
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  preference: "Preference",
  goal: "Goal",
  important_date: "Important date",
  appliance: "Appliance",
  system: "Home system",
  note: "Note",
};

export type HomeMemoryFact = {
  id: string;
  kind: MemoryKind | string;
  key: string;
  label: string;
  value: string | null;
  source: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
};

/** Conversation shapes shared by the chat UI. */
export type AgentToolActivity = { tool: string; note: string };

export type AgentChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolActivity: AgentToolActivity[];
  createdAt: string;
};

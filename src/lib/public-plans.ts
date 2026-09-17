export const AGENT_PUBLIC_PLANS = [
  { key: "free", name: "Start Free", price: "$0", description: "Your first 100 Home Profiles", features: ["100 Home Profiles", "Agent Today prioritization", "No lender relationship required"] },
  { key: "agent", name: "Agent", price: "$49/month", description: "For an established client book", features: ["250 Home Profiles", "Full home intelligence", "Relationship opportunities"] },
  { key: "agent_growth", name: "Agent Growth", price: "$99/month", description: "For a larger past-client database", features: ["1,000 Home Profiles", "Bulk import and CRM sync", "Advanced opportunity intelligence"] },
] as const;

export const LENDER_PUBLIC_PLANS = [
  { key: "mlo", name: "MLO", price: "$79/month", profiles: "250", agents: "3", description: "For a single loan officer getting started" },
  { key: "mlo_growth_v2", name: "MLO Growth", price: "$149/month", profiles: "1,000", agents: "10", description: "For a growing book and a small agent network" },
  { key: "branch", name: "Branch", price: "$499/month", profiles: "5,000", agents: "25", description: "For a branch team with an active referral network" },
  { key: "branch_pro_v2", name: "Branch Pro", price: "$799/month", profiles: "10,000", agents: "50", description: "For a large branch running outreach at scale" },
  { key: "network", name: "Network", price: "$1,499/month", profiles: "25,000", agents: "100", description: "For multi-branch lending networks" },
] as const;
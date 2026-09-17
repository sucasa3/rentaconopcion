export const AGENT_PUBLIC_PLANS = [
  { key: "free", name: "Free", price: "$0", description: "100 Home Profiles", features: ["Agent Today", "Property intelligence", "Opportunity prioritization", "Reasons to reconnect", "Suggested outreach"] },
  { key: "agent", name: "Agent", price: "$49/month", description: "250 Home Profiles", features: ["The full SuCasa Agent experience", "More room for your homeowner relationships"] },
  { key: "agent_growth", name: "Agent Growth", price: "$99/month", description: "1,000 Home Profiles", features: ["The full SuCasa Agent experience", "Capacity for a larger past-client book"] },
] as const;

export const LENDER_PUBLIC_PLANS = [
  { key: "mlo", name: "MLO", price: "$79/month", profiles: "250", agents: "3", description: "For a single loan officer getting started" },
  { key: "mlo_growth_v2", name: "MLO Growth", price: "$149/month", profiles: "1,000", agents: "10", description: "For a growing book and a small agent network" },
  { key: "branch", name: "Branch", price: "$499/month", profiles: "5,000", agents: "25", description: "For a branch team with an active referral network" },
  { key: "branch_pro_v2", name: "Branch Pro", price: "$799/month", profiles: "10,000", agents: "50", description: "For a large branch running outreach at scale" },
  { key: "network", name: "Network", price: "$1,499/month", profiles: "25,000", agents: "100", description: "For multi-branch lending networks" },
] as const;
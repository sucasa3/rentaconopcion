import { Wrench, Droplets, Home as HomeIcon, Zap, Paintbrush, Trees, Flame, Hammer, type LucideIcon } from "lucide-react";

export type ServiceCategory = {
  slug: string;
  name: string;
  icon: LucideIcon;
  description: string;
  color: string;
  avgResponse: string;
};

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { slug: "hvac", name: "HVAC", icon: Wrench, description: "Heating, cooling and air quality experts.", color: "from-sky-400 to-blue-600", avgResponse: "2h avg response" },
  { slug: "plumbing", name: "Plumbing", icon: Droplets, description: "Leaks, fixtures, water heaters and pipes.", color: "from-cyan-400 to-teal-600", avgResponse: "1h avg response" },
  { slug: "roofing", name: "Roofing", icon: HomeIcon, description: "Repairs, inspections and full replacements.", color: "from-orange-400 to-red-500", avgResponse: "3h avg response" },
  { slug: "electrical", name: "Electrical", icon: Zap, description: "Licensed electricians for any project.", color: "from-yellow-400 to-amber-600", avgResponse: "2h avg response" },
  { slug: "painting", name: "Painting", icon: Paintbrush, description: "Interior and exterior painting pros.", color: "from-pink-400 to-fuchsia-600", avgResponse: "4h avg response" },
  { slug: "landscaping", name: "Landscaping", icon: Trees, description: "Lawn, garden and hardscape design.", color: "from-lime-400 to-emerald-600", avgResponse: "5h avg response" },
  { slug: "restoration", name: "Restoration", icon: Flame, description: "Water, fire and storm damage restoration.", color: "from-rose-400 to-red-600", avgResponse: "30m avg response" },
  { slug: "handyman", name: "Handyman", icon: Hammer, description: "Small fixes and multi-project days.", color: "from-violet-400 to-indigo-600", avgResponse: "3h avg response" },
];

export const RECOMMENDED_PROS = [
  { name: "Sunrise HVAC Co.", category: "HVAC", rating: 4.9, reviews: 187, badge: "Founding Partner" },
  { name: "BluePipe Plumbing", category: "Plumbing", rating: 4.8, reviews: 142, badge: "Top Rated" },
  { name: "Evergreen Landscaping", category: "Landscaping", rating: 4.9, reviews: 96, badge: "Verified" },
];

export const MAINTENANCE_TASKS = [
  { title: "Replace HVAC filter", due: "Due this week", done: false },
  { title: "Clean gutters", due: "Due in 3 weeks", done: false },
  { title: "Test smoke detectors", due: "Overdue", done: false, overdue: true },
  { title: "Flush water heater", due: "Completed", done: true },
];

export const RECENT_REQUESTS = [
  { id: "REQ-1042", category: "Plumbing", status: "Matched", when: "Yesterday" },
  { id: "REQ-1039", category: "HVAC", status: "In Progress", when: "3 days ago" },
  { id: "REQ-1021", category: "Handyman", status: "Completed", when: "Last month" },
];

export const PRO_OPPORTUNITIES = [
  { id: "OPP-8821", category: "HVAC", location: "Austin, TX 78704", budget: "$450 – $900", timeline: "This week", posted: "12 min ago" },
  { id: "OPP-8820", category: "Plumbing", location: "Austin, TX 78702", budget: "$180 – $400", timeline: "ASAP", posted: "48 min ago" },
  { id: "OPP-8817", category: "Roofing", location: "Round Rock, TX", budget: "$2,000+", timeline: "Next 2 weeks", posted: "2 hr ago" },
];

export const CLAIMED_OPPORTUNITIES = [
  { id: "OPP-8801", homeowner: "Maria G.", category: "HVAC", status: "Scheduled", value: "$620" },
  { id: "OPP-8795", homeowner: "Daniel R.", category: "Plumbing", status: "Awaiting quote", value: "$310" },
];

export const ADMIN_HOMEOWNERS = [
  { name: "Maria Gonzalez", email: "maria@example.com", city: "Austin, TX", requests: 4, joined: "Jan 2025" },
  { name: "Daniel Rivera", email: "daniel@example.com", city: "Round Rock, TX", requests: 2, joined: "Feb 2025" },
  { name: "Priya Shah", email: "priya@example.com", city: "Cedar Park, TX", requests: 6, joined: "Nov 2024" },
];

export const ADMIN_PROS = [
  { name: "Sunrise HVAC Co.", plan: "Founding", claimed: 42, rating: 4.9 },
  { name: "BluePipe Plumbing", plan: "Pro", claimed: 28, rating: 4.8 },
  { name: "Evergreen Landscaping", plan: "Founding", claimed: 19, rating: 4.9 },
];

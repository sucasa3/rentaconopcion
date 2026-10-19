/** Preview/Test Lab only. No I/O, inference, ranking engine or permission grants. */
import { addressKey, type AgentIntakeRow } from './agent-discovery';

export interface HouseholdContact { id: string; name: string }
export interface HouseholdProperty {
  id: string;
  workspaceId: string;
  bookId: string;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  /** Canonical, already-computed amount. Never calculated from recovered loans here. */
  equity: { cents: number | null; reliable: boolean; asOf: string | null; ownershipShare: number | null };
}
export interface ConfirmedRelationship {
  householdId: string;
  contactId: string;
  propertyId: string;
  workspaceId: string;
  confirmedBy: string;
  confirmedAt: string;
  status: 'confirmed' | 'pending' | 'revoked';
}
export interface HouseholdTask {
  id: string; propertyId: string; contactId: string;
  kind: 'conversation' | 'follow_up' | 'maintenance';
  priority: number;
  status: 'open' | 'completed';
  qualifying: boolean;
}
export interface HouseholdFixture {
  contacts: HouseholdContact[];
  properties: HouseholdProperty[];
  relationships: ConfirmedRelationship[];
  tasks: HouseholdTask[];
}
/** Supplied by the caller's existing access authority, never by household edges. */
export interface HouseholdVisibility {
  workspaceId: string;
  propertyIds: ReadonlySet<string>;
  contactIds: ReadonlySet<string>;
  maintenancePropertyIds: ReadonlySet<string>;
}

export function householdViews(input: HouseholdFixture, access: HouseholdVisibility) {
  const edges = input.relationships.filter(e => e.status === 'confirmed' && e.confirmedBy &&
    Number.isFinite(Date.parse(e.confirmedAt)) && e.workspaceId === access.workspaceId &&
    access.propertyIds.has(e.propertyId) && access.contactIds.has(e.contactId));
  const result = [];
  for (const householdId of [...new Set(edges.map(e => e.householdId))].sort()) {
    const mine = edges.filter(e => e.householdId === householdId);
    const propertyIds = new Set(mine.map(e => e.propertyId));
    const properties = input.properties.filter(p => propertyIds.has(p.id) && p.workspaceId === access.workspaceId);
    const actualIds = new Set(properties.map(p => p.id));
    const contacts = input.contacts.filter(c => mine.some(e => e.contactId === c.id && actualIds.has(e.propertyId)));
    if (!properties.length || !contacts.length) continue;
    // Canonical identity duplicates are collapsed only for counting; conflicts disable totals.
    const keyed = new Map<string, HouseholdProperty>();
    let duplicate = false;
    for (const p of properties) {
      const key = addressKey(p);
      if (keyed.has(key)) duplicate = true;
      else keyed.set(key, p);
    }
    const unique = [...keyed.values()];
    const visibleTasks = input.tasks.filter(t => actualIds.has(t.propertyId) &&
      mine.some(e => e.propertyId === t.propertyId && e.contactId === t.contactId) &&
      t.status === 'open' && (t.kind !== 'maintenance' || access.maintenancePropertyIds.has(t.propertyId)));
    const queue: HouseholdTask[] = [];
    const seen = new Set<string>();
    for (const task of [...visibleTasks].sort((a,b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
      // One conversation per explicitly identified contact; no name/email-based outreach merging.
      const key = task.kind === 'conversation' ? `${task.contactId}:conversation` : task.id;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(task);
    }
    const complete = !duplicate && unique.length > 0 && unique.every(p =>
      p.equity.reliable && p.equity.asOf && Number.isFinite(Date.parse(p.equity.asOf)) &&
      p.equity.ownershipShare === 1 && p.equity.cents != null && Number.isSafeInteger(p.equity.cents));
    const total = complete ? unique.reduce((sum,p) => sum + (p.equity.cents ?? 0), 0) : null;
    result.push({ householdId, contacts, properties: unique, propertyCount: unique.length,
      opportunityCount: new Set(visibleTasks.filter(t => t.qualifying).map(t => addressKey(input.properties.find(p => p.id === t.propertyId) ?? { address: '' }))).size,
      queue, equityCents: total != null && Number.isSafeInteger(total) ? total : null,
      equityStatus: complete ? 'complete' as const : 'incomplete' as const });
  }
  return result;
}

/** Lossless proposed import: one property bucket, every distinct contact row retained for review.
 * Same email on a different property NEVER causes exclusion or confirmed household membership.
 * Nothing is persisted or enriched by this planner.
 */
export function previewHouseholdImport<T extends AgentIntakeRow>(rows: T[]) {
  const groups = new Map<string, { key: string; rows: T[]; duplicateRows: number }>();
  const needsAddress: T[] = [];
  for (const row of rows) {
    if (!row.address.trim()) { needsAddress.push(row); continue; }
    const key = addressKey(row);
    const group = groups.get(key) ?? { key, rows: [], duplicateRows: 0 };
    // Exact-row duplicates only. Different names, emails, notes or loan evidence survive.
    const signature = JSON.stringify(row);
    if (group.rows.some(r => JSON.stringify(r) === signature)) group.duplicateRows++;
    else group.rows.push(row);
    groups.set(key, group);
  }
  return { properties: [...groups.values()], needsAddress, confirmedRelationships: [] };
}
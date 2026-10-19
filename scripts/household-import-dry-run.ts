/** Offline approval evidence only. Never imported by the app; no I/O or real commit. */
import { addressKey, normalizeStreet } from '../src/lib/agent-discovery';

export interface StagedRow {
  ordinal: number;
  raw: string;
  cells: string[];
  name: string;
  email?: string;
  address: string;
  zip?: string;
  city?: string;
  state?: string;
  /** Explicit reviewed reference, not an email/name match. */
  contactId?: string;
}
export interface Snapshot {
  workspaceId: string;
  bookId: string;
  ownerId: string;
  revision: number;
  contacts: { id: string; email?: string }[];
  properties: { id: string; key: string }[];
}
export function reconcileRows(rows: StagedRow[], snapshot: Snapshot) {
  const seen = new Map<string, number>();
  const sourceKeys = new Set(rows.filter(r => r.address.trim()).map(r => addressKey(r)));
  return rows.map(row => {
    const signature = JSON.stringify(row.cells);
    const repeated = seen.get(signature);
    seen.set(signature, repeated ?? row.ordinal);
    const key = row.address.trim() ? addressKey(row) : null;
    const base = normalizeStreet(row.address).replace(/ unit .+$/, '');
    const unresolvedUnit = key != null && !normalizeStreet(row.address).includes(' unit ') &&
      [...sourceKeys, ...snapshot.properties.map(p => p.key)].some(k => k.startsWith(`${base} unit `));
    const contact = row.contactId ? snapshot.contacts.find(c => c.id === row.contactId) : undefined;
    const sameEmail = !contact && row.email && snapshot.contacts.some(c =>
      c.email?.trim().toLowerCase() === row.email?.trim().toLowerCase());
    const property = snapshot.properties.find(p => p.key === key);
    const warnings = [
      ...(!row.name.trim() ? ['missing_name'] : []),
      ...(!key ? ['missing_address'] : []),
      ...(key && !row.zip?.trim() ? ['incomplete_location'] : []),
      ...(unresolvedUnit ? ['unresolved_unit'] : []),
      ...(sameEmail ? ['uncertain_contact_match'] : []),
      ...(row.contactId && !contact ? ['unauthorized_contact_reference'] : []),
    ];
    return { ...row, key, duplicateOf: repeated ?? null,
      contactDisposition: contact ? 'existing_reviewed' : sameEmail ? 'review' : 'new_candidate',
      propertyDisposition: property ? 'existing' : key ? 'new_candidate' : 'review',
      warnings, householdLinks: 0,
      status: repeated != null ? 'exact_duplicate' : warnings.length ? 'review' : 'ready' };
  });
}

export interface SimulationState {
  workspaceId: string; bookId: string; revision: number;
  committedRows: string[]; propertyKeys: string[]; contactKeys: string[]; edges: string[];
  capacityUsed: number;
}
/** One proposed conversation per explicit household, never an inferred contact group. */
export function conversationDryRun(input: {
  householdId: string; confirmed: boolean; authorizedClientIds: ReadonlySet<string>;
  opportunities: { id: string; clientId: string; recipientId: string; contactAllowed: boolean; priority: number }[];
}) {
  const visible = input.opportunities.filter(o => input.authorizedClientIds.has(o.clientId));
  const eligible = visible.filter(o => o.contactAllowed).sort((a,b) => b.priority-a.priority || a.id.localeCompare(b.id));
  return { propertyOpportunityIds:visible.map(o=>o.id),
    conversation:input.confirmed && eligible[0] ? {
      key:`household:${input.householdId}:conversation`, recipientId:eligible[0].recipientId,
      opportunityIds:eligible.map(o=>o.id),
    } : null };
}
/** Models a future transactional promotion contract; this is NOT a database/RPC implementation. */
export function simulatePromotion(input: {
  rows: StagedRow[]; snapshot: Snapshot; state: SimulationState;
  actorId: string; workspaceId: string; batchKey: string;
  propertyAllowance: number; interruptBeforeCommit?: boolean;
}) {
  const { snapshot, state } = input;
  if (input.actorId !== snapshot.ownerId || input.workspaceId !== snapshot.workspaceId ||
    state.workspaceId !== snapshot.workspaceId || state.bookId !== snapshot.bookId) throw new Error('ACCESS_DENIED');
  if (input.interruptBeforeCommit) return structuredClone(state);
  if (state.revision !== snapshot.revision) throw new Error('STALE_REVIEW');
  const next = structuredClone(state);
  for (const row of reconcileRows(input.rows, snapshot)) {
    const receipt = `${snapshot.workspaceId}:${snapshot.bookId}:${input.batchKey}:${row.ordinal}`;
    if (next.committedRows.includes(receipt)) continue;
    if (row.status !== 'ready' || !row.key) continue;
    const propertyKey = `${snapshot.bookId}:${row.key}`;
    if (!next.propertyKeys.includes(propertyKey)) {
      if (next.capacityUsed >= input.propertyAllowance) continue;
      next.propertyKeys.push(propertyKey); next.capacityUsed++;
    }
    const contactKey = row.contactId ?? `source:${receipt}`;
    if (!next.contactKeys.includes(contactKey)) next.contactKeys.push(contactKey);
    const edge = `${propertyKey}:${contactKey}`;
    if (!next.edges.includes(edge)) next.edges.push(edge);
    next.committedRows.push(receipt);
  }
  return next;
}
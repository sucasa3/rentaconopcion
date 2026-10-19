import type { HouseholdFixture } from './household-foundation';

/** Fictional records only; never seed or enrich real accounts. */
export const householdFixture: HouseholdFixture = {
  contacts: [{ id: 'c1', name: 'Alex Rivera' }, { id: 'c2', name: 'Sam Rivera' }, { id: 'c3', name: 'Alex Rivera' }],
  properties: [
    { id: 'p1', workspaceId: 'lab', bookId: 'officer-a', address: '101 Example Street, Apt 1', zip: '30075', equity: { cents: 18000000, reliable: true, asOf: '2026-10-19', ownershipShare: 1 } },
    { id: 'p2', workspaceId: 'lab', bookId: 'officer-a', address: '101 Example Street, Apt 2', zip: '30075', equity: { cents: 9000000, reliable: true, asOf: '2026-10-19', ownershipShare: 1 } },
    { id: 'p3', workspaceId: 'lab', bookId: 'officer-b', address: '202 Sample Avenue', zip: '30076', equity: { cents: null, reliable: false, asOf: null, ownershipShare: 0.5 } },
    { id: 'private', workspaceId: 'other', bookId: 'other', address: '303 Private Street', zip: '30077', equity: { cents: 99900000, reliable: true, asOf: '2026-10-19', ownershipShare: 1 } },
  ],
  relationships: [
    { householdId: 'h1', contactId: 'c1', propertyId: 'p1', workspaceId: 'lab', status: 'confirmed', confirmedBy: 'lab-reviewer', confirmedAt: '2026-10-19' },
    { householdId: 'h1', contactId: 'c2', propertyId: 'p1', workspaceId: 'lab', status: 'confirmed', confirmedBy: 'lab-reviewer', confirmedAt: '2026-10-19' },
    { householdId: 'h1', contactId: 'c1', propertyId: 'p2', workspaceId: 'lab', status: 'confirmed', confirmedBy: 'lab-reviewer', confirmedAt: '2026-10-19' },
    { householdId: 'h2', contactId: 'c3', propertyId: 'p3', workspaceId: 'lab', status: 'confirmed', confirmedBy: 'lab-reviewer', confirmedAt: '2026-10-19' },
    { householdId: 'h1', contactId: 'c1', propertyId: 'private', workspaceId: 'other', status: 'confirmed', confirmedBy: 'lab-reviewer', confirmedAt: '2026-10-19' },
  ],
  tasks: [
    { id: 't1', propertyId: 'p1', contactId: 'c1', kind: 'conversation', priority: 90, status: 'open', qualifying: true },
    { id: 't2', propertyId: 'p2', contactId: 'c1', kind: 'conversation', priority: 70, status: 'open', qualifying: true },
    { id: 't3', propertyId: 'p1', contactId: 'c2', kind: 'follow_up', priority: 60, status: 'open', qualifying: false },
    { id: 't4', propertyId: 'p2', contactId: 'c1', kind: 'maintenance', priority: 95, status: 'open', qualifying: false },
  ],
};
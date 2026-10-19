import { describe, expect, it } from 'vitest';
import { householdViews, previewHouseholdImport, type HouseholdVisibility } from '../household-foundation';
import { householdFixture } from '../household-fixtures';
const access: HouseholdVisibility = { workspaceId: 'lab', propertyIds: new Set(['p1','p2','p3']), contactIds: new Set(['c1','c2','c3']), maintenancePropertyIds: new Set() };
describe('preview household foundation', () => {
  it('retains co-borrowers and distinct duplex units', () => {
    const h = householdViews(householdFixture, access)[0];
    expect(h?.contacts.map(c => c.id)).toEqual(['c1','c2']);
    expect(h?.propertyCount).toBe(2);
  });
  it('never merges unrelated matching owner names', () => { expect(householdViews(householdFixture, access)).toHaveLength(2); });
  it('household links cannot expand workspace or officer property access', () => {
    const h = householdViews(householdFixture, { ...access, propertyIds: new Set(['p1','private']) });
    expect(h[0]?.properties.map(p => p.id)).toEqual(['p1']);
    expect(h[0]?.equityCents).toBe(18000000);
  });
  it('pending/revoked links create no relationship visibility', () => {
    const f = structuredClone(householdFixture);
    f.relationships = f.relationships.map(e => ({ ...e, status: 'pending' }));
    expect(householdViews(f, access)).toEqual([]);
    f.relationships = f.relationships.map(e => ({ ...e, status: 'revoked' }));
    expect(householdViews(f, access)).toEqual([]);
  });
  it('counts property opportunities separately from deduplicated contact outreach', () => {
    const h = householdViews(householdFixture, access)[0];
    expect(h?.opportunityCount).toBe(2);
    expect(h?.queue.filter(t => t.kind === 'conversation').map(t => t.id)).toEqual(['t1']);
  });
  it('maintenance is excluded without explicit property sharing', () => {
    expect(householdViews(householdFixture, access)[0]?.queue.map(t => t.id)).not.toContain('t4');
    expect(householdViews(householdFixture, { ...access, maintenancePropertyIds: new Set(['p2']) })[0]?.queue[0]?.id).toBe('t4');
  });
  it('combined equity uses complete reliable canonical values once', () => { expect(householdViews(householdFixture, access)[0]?.equityCents).toBe(27000000); });
  it('incomplete/shared ownership values never produce a combined equity claim', () => { expect(householdViews(householdFixture, access)[1]?.equityCents).toBeNull(); });
  it('duplicate canonical properties disable combined equity', () => {
    const f = structuredClone(householdFixture); const p = f.properties[0]; if (!p) throw new Error('Fixture missing');
    f.properties.push({ ...p, id: 'copy' });
    const e = f.relationships[0]; if (!e) throw new Error('Fixture missing');
    f.relationships.push({ ...e, propertyId: 'copy' });
    const h = householdViews(f, { ...access, propertyIds: new Set(['p1','p2','copy']) })[0];
    expect(h?.propertyCount).toBe(2); expect(h?.equityCents).toBeNull();
  });
  it('completed tasks stay out of the household queue', () => {
    const f = structuredClone(householdFixture); f.tasks = f.tasks.map(t => ({ ...t, status: 'completed' }));
    expect(householdViews(f, access)[0]?.queue).toEqual([]);
  });
  it('import keeps same contact on different properties and all co-borrower rows without confirming identity', () => {
    const rows = [{ full_name:'Alex', email:'a@example.com', address:'1 Main St Apt 1', zip:'30075' }, { full_name:'Sam', email:'s@example.com', address:'1 Main Street Unit 1', zip:'30075' }, { full_name:'Alex', email:'a@example.com', address:'1 Main St Apt 2', zip:'30075' }];
    const p = previewHouseholdImport([...rows, ...rows.slice(0,1)]);
    expect(p.properties).toHaveLength(2); expect(p.properties[0]?.rows).toHaveLength(2);
    expect(p.properties[0]?.duplicateRows).toBe(1); expect(p.confirmedRelationships).toEqual([]);
  });
});
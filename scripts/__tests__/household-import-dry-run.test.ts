import { describe, expect, it } from 'vitest';
import { conversationDryRun, reconcileRows, simulatePromotion, type Snapshot, type StagedRow, type SimulationState } from '../household-import-dry-run';
import { householdViews } from '../../src/lib/household-foundation';
import { householdFixture } from '../../src/lib/household-fixtures';

const snapshot: Snapshot = {workspaceId:'w',bookId:'b',ownerId:'owner',revision:1,
  contacts:[{id:'alex',email:'alex@example.test'}],properties:[]};
const empty = (): SimulationState => ({workspaceId:'w',bookId:'b',revision:1,committedRows:[],propertyKeys:[],contactKeys:[],edges:[],capacityUsed:0});
const row = (ordinal:number,name:string,address:string,contactId?:string): StagedRow =>
  ({ordinal,name,address,zip:'30075',contactId,raw:`${name},${address},30075`,cells:[name,address,'30075']});
const promote = (rows:StagedRow[],state=empty(),batchKey='file-1',interruptBeforeCommit=false) => simulatePromotion({
  rows,state,snapshot,actorId:'owner',workspaceId:'w',batchKey,propertyAllowance:100,interruptBeforeCommit});

describe('offline household storage/import contract', () => {
  it('one explicitly reviewed contact keeps two properties and two property edges', () => {
    const state = promote([row(1,'Alex','1 Main St','alex'),row(2,'Alex','2 Main St','alex')]);
    expect(state.contactKeys).toEqual(['alex']); expect(state.propertyKeys).toHaveLength(2);
    expect(state.edges).toHaveLength(2); expect(state.capacityUsed).toBe(2);
  });
  it('two co-borrowers keep both rows and contacts but consume one property allocation', () => {
    const rows=[row(1,'Alex','1 Main St','alex'),row(2,'Sam','1 Main Street')];
    const state=promote(rows); expect(state.committedRows).toHaveLength(2);
    expect(state.contactKeys).toHaveLength(2); expect(state.edges).toHaveLength(2);
    expect(state.capacityUsed).toBe(1); expect(reconcileRows(rows,snapshot).map(r=>r.householdLinks)).toEqual([0,0]);
  });
  it('two street-address units stay separate while a missing unit is held for review', () => {
    const rows=[row(1,'Alex','1 Main St Apt 1'),row(2,'Sam','1 Main St Unit 2'),row(3,'Jay','1 Main St')];
    expect(promote(rows).propertyKeys).toHaveLength(2);
    expect(reconcileRows(rows,snapshot)[2]?.warnings).toContain('unresolved_unit');
  });
  it('retains exact repeats and raw multiline/unmapped cells in the staging report', () => {
    const first={...row(1,'Alex','1 Main St'),raw:'Alex,"note\nextra",1 Main St',cells:['Alex','note\nextra','1 Main St','unmapped']};
    const report=reconcileRows([first,{...first,ordinal:2}],snapshot);
    expect(report).toHaveLength(2); expect(report[0]?.raw).toBe(first.raw);
    expect(report[1]?.cells[3]).toBe('unmapped'); expect(report[1]?.duplicateOf).toBe(1);
  });
  it('repeating the same batch resumes receipts without duplicating capacity or links', () => {
    const rows=[row(1,'Alex','1 Main St','alex')]; const first=promote(rows);
    expect(promote(rows,first)).toEqual(first);
  });
  it('a different batch reuses reviewed contact/property references, not email inference', () => {
    const rows=[row(1,'Alex','1 Main St','alex')]; const first=promote(rows);
    const second=promote(rows,first,'file-2');
    expect(second.committedRows).toHaveLength(2); expect(second.edges).toHaveLength(1);
    expect(second.capacityUsed).toBe(1);
    expect(reconcileRows([{...rows[0],email:'alex@example.test',contactId:undefined} as StagedRow],snapshot)[0]?.status).toBe('review');
  });
  it('interruption before transaction commit leaves nothing; resume commits every ready row once', () => {
    const rows=[row(1,'Alex','1 Main St','alex'),row(2,'Sam','2 Main St')];
    const stopped=promote(rows,empty(),'file-1',true); expect(stopped).toEqual(empty());
    expect(promote(rows,stopped).committedRows).toHaveLength(2);
  });
  it('cross-workspace, other-officer and foreign-contact references cannot promote', () => {
    const args={rows:[row(1,'Alex','1 Main St')],snapshot,state:empty(),actorId:'other-officer',workspaceId:'w',batchKey:'f',propertyAllowance:100};
    expect(()=>simulatePromotion(args)).toThrow('ACCESS_DENIED');
    expect(()=>simulatePromotion({...args,actorId:'owner',workspaceId:'other-workspace'})).toThrow('ACCESS_DENIED');
    expect(reconcileRows([row(1,'Alex','1 Main St','foreign-contact')],snapshot)[0]?.warnings).toContain('unauthorized_contact_reference');
  });
  it('stale reviews are rejected and capacity counts properties, never co-borrowers', () => {
    const args={rows:[row(1,'Alex','1 Main St','alex'),row(2,'Sam','1 Main St'),row(3,'Jay','2 Main St')],snapshot,state:empty(),actorId:'owner',workspaceId:'w',batchKey:'f',propertyAllowance:1};
    expect(simulatePromotion(args).committedRows).toHaveLength(2);
    expect(()=>simulatePromotion({...args,state:{...empty(),revision:2}})).toThrow('STALE_REVIEW');
  });
  it('household conversation dedupe preserves both property-level opportunities', () => {
    const view=householdViews(householdFixture,{workspaceId:'lab',propertyIds:new Set(['p1','p2']),contactIds:new Set(['c1','c2']),maintenancePropertyIds:new Set()})[0];
    expect(view?.opportunityCount).toBe(2); expect(view?.queue.filter(t=>t.kind==='conversation')).toHaveLength(1);
  });
  it('two contacts in a confirmed household select one permitted recipient without losing either property opportunity', () => {
    const input={householdId:'h',confirmed:true,authorizedClientIds:new Set(['p1','p2']),opportunities:[
      {id:'o1',clientId:'p1',recipientId:'alex',contactAllowed:true,priority:90},
      {id:'o2',clientId:'p2',recipientId:'sam',contactAllowed:true,priority:80},
      {id:'private',clientId:'p3',recipientId:'private-contact',contactAllowed:true,priority:100},
    ]};
    const result=conversationDryRun(input);
    expect(result.propertyOpportunityIds).toEqual(['o1','o2']);
    expect(result.conversation).toEqual({key:'household:h:conversation',recipientId:'alex',opportunityIds:['o1','o2']});
    expect(conversationDryRun({...input,confirmed:false}).conversation).toBeNull();
    expect(conversationDryRun({...input,opportunities:input.opportunities.map(o=>({...o,contactAllowed:false}))}).conversation).toBeNull();
  });
});
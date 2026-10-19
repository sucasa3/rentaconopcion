import { useState } from 'react';
import { Home, Users, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { householdViews, previewHouseholdImport } from '@/lib/household-foundation';
import { householdFixture } from '@/lib/household-fixtures';
import { useLanguage } from '@/lib/i18n';

export function HouseholdLab() {
  const { language } = useLanguage(); const es = language === 'es';
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rows, setRows] = useState('');
  const [result, setResult] = useState<ReturnType<typeof previewHouseholdImport> | null>(null);
  const [invalid, setInvalid] = useState(false);
  const households = householdViews(householdFixture, { workspaceId: 'lab', propertyIds: new Set(['p1','p2','p3']), contactIds: new Set(['c1','c2','c3']), maintenancePropertyIds: new Set() });
  const money = (n: number) => new Intl.NumberFormat(es ? 'es-US' : 'en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(n / 100);
  return <section aria-label={es ? 'Laboratorio de hogares' : 'Household lab'} className="space-y-4 border-y border-border py-5">
    <header><p className="text-xs font-semibold text-status-attention">{es ? 'Solo vista previa · datos ficticios' : 'Preview only · fictional records'}</p><h2 className="mt-1 text-xl font-semibold">{es ? 'Relaciones del hogar' : 'Household relationships'}</h2></header>
    <div className="grid gap-4 sm:grid-cols-2">{households.map(h => <article key={h.householdId} className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-2"><Users className="mt-1 h-5 w-5 shrink-0 text-primary" /><h3 className="min-w-0 break-words font-semibold">{h.contacts.map(c => c.name).join(' & ')}</h3></div>
      <p className="mt-2 text-sm text-text-secondary">{h.propertyCount} {es ? 'propiedades confirmadas' : 'confirmed properties'} · {h.opportunityCount} {es ? 'con oportunidades' : 'with opportunities'}</p>
      <p className="mt-3 text-sm font-medium">{es ? 'Patrimonio estimado combinado' : 'Combined estimated equity'}: {h.equityCents == null ? (es ? 'Información incompleta' : 'Incomplete information') : money(h.equityCents)}</p>
      <h4 className="mt-4 text-xs font-semibold uppercase text-text-secondary">{es ? 'Próximos pasos' : 'Next steps'}</h4>
      {h.queue.length ? <ol className="mt-2 space-y-2">{h.queue.map(t => <li key={t.id} className="text-sm">{t.kind === 'conversation' ? (es ? 'Revisar opciones con' : 'Review options with') : (es ? 'Dar seguimiento a' : 'Follow up with')} {h.contacts.find(c => c.id === t.contactId)?.name}</li>)}</ol> : <p className="mt-2 text-sm text-text-secondary">{es ? 'Sin tareas pendientes' : 'No open tasks'}</p>}
      <Button variant="ghost" className="mt-3 w-full justify-between px-0" onClick={() => setExpanded(expanded === h.householdId ? null : h.householdId)} aria-expanded={expanded === h.householdId}>{es ? 'Ver propiedades' : 'View properties'}<ChevronDown /></Button>
      {expanded === h.householdId && <ul className="mt-2 divide-y divide-border">{h.properties.map(p => <li key={p.id} className="flex gap-2 py-3 text-sm"><Home className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="break-words">{p.address}</p><p className="mt-1 text-xs text-text-secondary">{p.equity.reliable && p.equity.ownershipShare === 1 && p.equity.cents != null ? `${money(p.equity.cents)} · ${p.equity.asOf}` : (es ? 'Patrimonio no disponible · propiedad compartida o datos incompletos' : 'Equity unavailable · shared ownership or incomplete data')}</p></div></li>)}</ul>}
    </article>)}</div>
    <div className="space-y-2"><h3 className="font-semibold">{es ? 'Revisión de importación' : 'Import review'}</h3>
      <Textarea aria-label={es ? 'Filas JSON para revisión' : 'JSON rows for review'} placeholder='[{"full_name":"Alex","email":"alex@example.com","address":"1 Example St Apt 1","zip":"30075"}]' value={rows} onChange={e => setRows(e.target.value)} />
      <Button variant="outline" onClick={() => { try { const data: unknown = JSON.parse(rows); if (!Array.isArray(data) || data.length > 500 || !data.every(r => r && typeof r.full_name === 'string' && typeof r.address === 'string')) throw new Error('Invalid rows'); setResult(previewHouseholdImport(data)); setInvalid(false); } catch { setInvalid(true); setResult(null); } }}>{es ? 'Revisar filas' : 'Review rows'}</Button>
      {invalid && <p role="alert" className="text-sm text-destructive">{es ? 'Introduce hasta 500 filas con nombre y dirección.' : 'Enter up to 500 rows with a name and address.'}</p>}
      {result && <div role="status" className="text-sm"><p>{result.properties.length} {es ? 'propiedades distintas' : 'distinct properties'} · {result.properties.reduce((s,p) => s + p.rows.length,0)} {es ? 'filas de contactos conservadas' : 'contact rows retained'} · {result.properties.reduce((s,p) => s + p.duplicateRows,0)} {es ? 'filas idénticas repetidas' : 'exact duplicate rows'}</p><ul className="mt-2 space-y-1">{result.properties.map(p => <li key={p.key} className="break-words">{p.rows[0]?.address}: {p.rows.map(r => r.full_name).join(', ')}</li>)}</ul></div>}
    </div>
  </section>;
}
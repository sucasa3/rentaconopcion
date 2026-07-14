import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProsWithCoverage, seedPro, addCoverage, removeCoverage, setProFlags } from "@/lib/pro-seed.functions";
import { SERVICE_CATEGORIES } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, MapPin } from "lucide-react";

const METRO_PRESETS = [
  "Atlanta Metro",
  "Miami Metro",
  "Orlando Metro",
  "Tampa Metro",
  "Dallas Metro",
  "Houston Metro",
  "Phoenix Metro",
  "Charlotte Metro",
];

export function ProSeedPanel() {
  const list = useServerFn(listProsWithCoverage);
  const create = useServerFn(seedPro);
  const addCov = useServerFn(addCoverage);
  const rmCov = useServerFn(removeCoverage);
  const flags = useServerFn(setProFlags);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pro-seed"],
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["pro-seed"] });

  const [form, setForm] = useState({
    business_name: "",
    phone: "",
    email: "",
    primary_category: SERVICE_CATEGORIES[0].slug,
    is_founding_partner: true,
    metro: METRO_PRESETS[0],
  });

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          business_name: form.business_name.trim(),
          primary_category: form.primary_category,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          is_founding_partner: form.is_founding_partner,
          coverage: [{ category: form.primary_category, metro: form.metro }],
        },
      }),
    onSuccess: () => {
      toast.success("Pro added");
      setForm((f) => ({ ...f, business_name: "", phone: "", email: "" }));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Pro roster & metro coverage</h2>
          <p className="mt-1 text-xs text-muted-foreground">Seed pros and the metro areas they serve. Round-robin routes leads by (category, metro).</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label>Business name</Label>
          <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Sunrise HVAC Co." />
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+14045551234" />
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ops@sunrise.com" />
        </div>
        <div className="space-y-1">
          <Label>Category</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.primary_category}
            onChange={(e) => setForm({ ...form, primary_category: e.target.value })}
          >
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Metro area</Label>
          <input
            list="metro-presets"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.metro}
            onChange={(e) => setForm({ ...form, metro: e.target.value })}
            placeholder="Atlanta Metro"
          />
          <datalist id="metro-presets">
            {METRO_PRESETS.map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.is_founding_partner} onCheckedChange={(v) => setForm({ ...form, is_founding_partner: v })} />
            Founding partner ($297)
          </label>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button onClick={() => createMut.mutate()} disabled={!form.business_name.trim() || createMut.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            {createMut.isPending ? "Adding…" : "Add pro"}
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data?.pros.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No pros yet. Add one above.</p>
        )}
        {data?.pros.map((p) => {
          const cov = data.coverage.filter((c) => c.pro_id === p.id);
          return (
            <ProRow
              key={p.id}
              pro={p}
              coverage={cov}
              onAdd={async (category, metro) => {
                await addCov({ data: { pro_id: p.id, category, metro } });
                invalidate();
              }}
              onRemove={async (id) => {
                await rmCov({ data: { id } });
                invalidate();
              }}
              onFlag={async (patch) => {
                await flags({ data: { pro_id: p.id, ...patch } });
                invalidate();
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

type ProRow = {
  id: string;
  business_name: string;
  category: string;
  phone: string | null;
  email: string | null;
  is_founding_partner: boolean;
  accepting_leads: boolean;
  active: boolean;
  monthly_price_cents: number;
};
type CovRow = { id: string; pro_id: string; category: string; metro: string | null; zip: string | null };

function ProRow({
  pro,
  coverage,
  onAdd,
  onRemove,
  onFlag,
}: {
  pro: ProRow;
  coverage: CovRow[];
  onAdd: (category: string, metro: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onFlag: (patch: { is_founding_partner?: boolean; accepting_leads?: boolean; active?: boolean }) => Promise<void>;
}) {
  const [cat, setCat] = useState(pro.category);
  const [metro, setMetro] = useState(METRO_PRESETS[0]);
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{pro.business_name}</p>
            {pro.is_founding_partner && <Badge variant="secondary">Founding · $297</Badge>}
            {!pro.accepting_leads && <Badge variant="outline">Paused</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pro.category} · {pro.phone ?? "no phone"} · {pro.email ?? "no email"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={pro.is_founding_partner} onCheckedChange={(v) => onFlag({ is_founding_partner: v })} />
            Founding
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={pro.accepting_leads} onCheckedChange={(v) => onFlag({ accepting_leads: v })} />
            Accepting
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {coverage.length === 0 && <p className="text-xs text-muted-foreground">No metro coverage yet.</p>}
        {coverage.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs">
            <MapPin className="h-3 w-3 text-primary" />
            {SERVICE_CATEGORIES.find((s) => s.slug === c.category)?.name ?? c.category} · {c.metro}
            <button
              onClick={() => onRemove(c.id)}
              className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remove coverage"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <input
          list="metro-presets"
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          value={metro}
          onChange={(e) => setMetro(e.target.value)}
          placeholder="Metro"
        />
        <Button size="sm" variant="outline" onClick={() => onAdd(cat, metro)}>
          <Plus className="mr-1 h-3 w-3" />
          Add coverage
        </Button>
      </div>
    </div>
  );
}

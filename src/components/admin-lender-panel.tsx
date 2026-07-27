import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { addLenderMember, createLenderOrg, listAllOrgs } from "@/lib/lender.functions";
import { Plus } from "lucide-react";

export function AdminLenderPanel() {
  const listFn = useServerFn(listAllOrgs);
  const createFn = useServerFn(createLenderOrg);
  const addFn = useServerFn(addLenderMember);
  const qc = useQueryClient();

  const { data: orgs = [] } = useQuery({ queryKey: ["lender-orgs"], queryFn: () => listFn() });

  const [orgName, setOrgName] = useState("");
  const [selectedOrg, setSelectedOrg] = useState("");
  const [email, setEmail] = useState("");

  const create = useMutation({
    mutationFn: () => createFn({ data: { name: orgName } }),
    onSuccess: () => {
      toast.success("Lender org created");
      setOrgName("");
      qc.invalidateQueries({ queryKey: ["lender-orgs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: () => addFn({ data: { orgId: selectedOrg, email } }),
    onSuccess: () => {
      toast.success("Member added");
      setEmail("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <h2 className="text-base font-semibold">Lender organizations</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Provision lender orgs and grant portal access.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="New org name (e.g. Acme Mortgage)"
          className="rounded-full border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          disabled={!orgName || create.isPending}
          onClick={() => create.mutate()}
          className="inline-flex items-center gap-1 rounded-full gradient-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Plus className="h-3 w-3" /> Create org
        </button>
      </div>

      {orgs.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">Add member</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              className="rounded-full border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Choose org…</option>
              {orgs.map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="rounded-full border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              disabled={!selectedOrg || !email || add.isPending}
              onClick={() => add.mutate()}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
            >
              Add
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            User must already have a SuCasa account. They'll be granted the "lender" role.
          </p>
        </div>
      )}

      <ul className="mt-4 space-y-1">
        {orgs.map((o: any) => (
          <li key={o.id} className="rounded-2xl border border-border px-3 py-2 text-sm">
            {o.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Paperclip, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { logExternalService } from "@/lib/service-requests.functions";
import { SERVICE_CATEGORIES } from "@/lib/mock-data";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLogged?: (row: {
    id: string;
    category: string;
    status: string;
    vendorName?: string | null;
    amountCents?: number | null;
    completedAt?: string | null;
  }) => void;
};

export function LogExternalServiceDialog({ open, onOpenChange, onLogged }: Props) {
  const logFn = useServerFn(logExternalService);
  const today = new Date().toISOString().slice(0, 10);

  const [category, setCategory] = useState<string>("");
  const [vendor, setVendor] = useState("");
  const [status, setStatus] = useState<"Completed" | "Scheduled" | "In Progress">("Completed");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCategory("");
    setVendor("");
    setStatus("Completed");
    setDate(today);
    setAmount("");
    setNotes("");
    setFile(null);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) {
      toast.error("Pick a category");
      return;
    }
    setBusy(true);
    try {
      let receiptPath: string | undefined;
      if (file) {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData.user) throw new Error("Please sign in again");
        if (file.size > 10 * 1024 * 1024) throw new Error("Receipt must be under 10MB");
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
        const path = `${userData.user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("service-receipts")
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (upErr) throw new Error(upErr.message);
        receiptPath = path;
      }

      const amt = amount.trim() ? Math.round(parseFloat(amount) * 100) : undefined;
      if (amt !== undefined && (!Number.isFinite(amt) || amt < 0)) {
        throw new Error("Amount must be a positive number");
      }

      const row = await logFn({
        data: {
          category,
          vendorName: vendor.trim() || undefined,
          status,
          completedAt: new Date(`${date}T12:00:00Z`).toISOString(),
          amountCents: amt,
          notes: notes.trim() || undefined,
          receiptPath,
        },
      });

      toast.success("Service logged to your home history");
      onLogged?.({
        id: row.id,
        category: row.category,
        status: row.status,
        vendorName: row.vendor_name,
        amountCents: row.amount_cents,
        completedAt: row.completed_at,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not log service");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!busy ? onOpenChange(o) : null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a service you booked yourself</DialogTitle>
          <DialogDescription>
            Track work done outside SuCasa to build your full home history. Only you can see it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="ext-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="ext-category"><SelectValue placeholder="Pick a category" /></SelectTrigger>
              <SelectContent>
                {SERVICE_CATEGORIES.map((c) => (
                  <SelectItem key={c.slug} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ext-vendor">Vendor / company <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="ext-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={120} placeholder="e.g. Bob's Plumbing" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="ext-date">Date</Label>
              <Input id="ext-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ext-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger id="ext-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ext-amount">Amount paid <span className="text-muted-foreground">(optional, USD)</span></Label>
            <Input id="ext-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ext-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea id="ext-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} placeholder="What was done?" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ext-file" className="flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> Receipt / invoice <span className="text-muted-foreground">(optional, ≤10MB)</span></Label>
            <Input id="ext-file" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && <p className="text-xs text-muted-foreground truncate">{file.name}</p>}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</> : "Log service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

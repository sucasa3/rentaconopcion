import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logComponentService } from "@/lib/home-maintenance.functions";
import type { TimelineItem } from "@/lib/maintenance-rules";

type Props = {
  item: TimelineItem;
  open: boolean;
  onOpenChange: (o: boolean) => void;
};

/**
 * Lets a homeowner mark a maintenance item done — most work happens without a
 * permit, so their entry becomes the new start of the lifespan clock.
 */
export function MarkComponentDoneDialog({ item, open, onOpenChange }: Props) {
  const thisYear = new Date().getFullYear();
  const logFn = useServerFn(logComponentService);
  const qc = useQueryClient();

  const [action, setAction] = useState<"replaced" | "serviced">("replaced");
  const [year, setYear] = useState(String(thisYear));
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [warranty, setWarranty] = useState("");
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsedYear = Number(year);
    if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > thisYear + 1) {
      toast.error("Enter a valid year");
      return;
    }
    setBusy(true);
    try {
      const res = await logFn({
        data: {
          componentKey: item.key,
          action,
          installedYear: parsedYear,
          servicedOn: `${parsedYear}-01-01`,
          brand: brand.trim() || null,
          model: model.trim() || null,
          warrantyYears: warranty.trim() ? Number(warranty) : null,
          provider: provider.trim() || null,
          notes: notes.trim() || null,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${item.label} updated — your timeline now starts from ${parsedYear}.`);
      await qc.invalidateQueries({ queryKey: ["component-service-log"] });
      onOpenChange(false);
    } catch {
      toast.error("Could not save that just now");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark {item.label.toLowerCase()} done</DialogTitle>
          <DialogDescription>
            A lot of work happens without a permit on file. Add the details and we'll reset the
            clock and plan future maintenance around your new system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>What was done</Label>
              <Select value={action} onValueChange={(v) => setAction(v as "replaced" | "serviced")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="replaced">Replaced / new install</SelectItem>
                  <SelectItem value="serviced">Serviced / repaired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcd-year">Year</Label>
              <Input
                id="mcd-year"
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder={String(thisYear)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mcd-brand">Brand (optional)</Label>
              <Input
                id="mcd-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Rheem"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcd-model">Model (optional)</Label>
              <Input
                id="mcd-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. XE50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mcd-warranty">Warranty (years)</Label>
              <Input
                id="mcd-warranty"
                inputMode="numeric"
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
                placeholder="10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcd-provider">Who did the work</Label>
              <Input
                id="mcd-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Company or DIY"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mcd-notes">Notes (optional)</Label>
            <Textarea
              id="mcd-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth remembering for the next service"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save and reset clock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

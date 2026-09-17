import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAgentAttribution } from "@/lib/agent-funnel";

export function PilotRequestDialog({ children, onOpen }: { children: ReactNode; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [company, setCompany] = useState("");
  const [loanOfficers, setLoanOfficers] = useState(""); const [markets, setMarkets] = useState(""); const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const attribution = getAgentAttribution();
      const response = await fetch("/api/public/lenders/pilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), email: email.trim(), company: company.trim(), loanOfficers: loanOfficers.trim() || undefined, markets: markets.trim() || undefined, message: message.trim() || undefined, visitId: attribution.visitId }) });
      if (!response.ok) throw new Error("Request failed"); setDone(true);
    } catch { setError("We couldn't send your request. Please try again or email info@sucasa.com."); } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (next) onOpen?.(); setOpen(next); }}><DialogTrigger asChild>{children}</DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Talk to us about a team pilot</DialogTitle><DialogDescription>Tell us about your team. We will reply within one business day.</DialogDescription></DialogHeader>{done ? <div className="py-6 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-status-positive" /><p className="mt-4 font-semibold">Request sent</p></div> : <form onSubmit={submit} className="space-y-4 pt-2"><Field id="pilot-name" label="Full name"><Input id="pilot-name" required value={name} onChange={(e) => setName(e.target.value)} /></Field><Field id="pilot-email" label="Work email"><Input id="pilot-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field><Field id="pilot-company" label="Lender / company"><Input id="pilot-company" required value={company} onChange={(e) => setCompany(e.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field id="pilot-officers" label="Loan officers"><Input id="pilot-officers" value={loanOfficers} onChange={(e) => setLoanOfficers(e.target.value)} /></Field><Field id="pilot-markets" label="Markets"><Input id="pilot-markets" value={markets} onChange={(e) => setMarkets(e.target.value)} /></Field></div><Field id="pilot-message" label="What are you hoping to solve? (optional)"><Textarea id="pilot-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} /></Field>{error && <p className="text-sm text-destructive">{error}</p>}<Button type="submit" className="min-h-11 w-full bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <>Send pilot request <ArrowRight /></>}</Button></form>}</DialogContent></Dialog>;
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>; }
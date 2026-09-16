import { useState } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildGuide, CATEGORY_SLUG, type Guide } from "@/lib/diy-guides";
import { toCategorySlug } from "@/lib/mock-data";
import { useT } from "@/lib/i18n";

export type DiyGuideTarget = {
  key: string;
  label: string;
  category?: string | null;
};

function useGuide(target: DiyGuideTarget | null): Guide | null {
  const t = useT();
  if (!target) return null;
  return buildGuide({ key: target.key, label: target.label }, t);
}

function requestSlug(target: DiyGuideTarget): string | undefined {
  if (target.category) return toCategorySlug(target.category);
  const direct = CATEGORY_SLUG[target.label];
  if (direct) return direct;
  return toCategorySlug(target.label);
}

export function DiyGuideDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DiyGuideTarget;
}) {
  const guide = useGuide(target);
  const slug = requestSlug(target);
  if (!guide) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{target.label} — what to do</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{guide.what}</p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Steps
            </p>
            <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              {guide.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">DIY vs. pro:</span>{" "}
              {guide.diy}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-foreground">Typical cost:</span>{" "}
              {guide.cost}
            </p>
          </div>
          {slug && (
            <Link
              to="/request"
              search={{ category: slug }}
              onClick={() => onOpenChange(false)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft"
            >
              Get quotes from a SuCasa pro <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DiyGuideButton({
  target,
  variant = "outline",
}: {
  target: DiyGuideTarget;
  variant?: "outline" | "ghost" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const guide = useGuide(target);
  if (!guide) return null;
  return (
    <>
      <Button
        variant={variant}
        size="sm"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold"
      >
        <BookOpen className="h-3.5 w-3.5" /> Do it yourself
      </Button>
      <DiyGuideDialog open={open} onOpenChange={setOpen} target={target} />
    </>
  );
}

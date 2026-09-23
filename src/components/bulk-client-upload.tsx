import { useRef, useState } from "react";
import { Upload, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fileToCsv } from "@/lib/spreadsheet-import";
import { useT } from "@/lib/i18n";

const TEMPLATE_HEADERS = [
  "full_name",
  "address",
  "city",
  "state",
  "zip",
  "email",
  "loan_balance",
  "rate",
  "note",
];

type Props = {
  /** Called with the file contents converted to CSV text. */
  onCsv: (csv: string) => void;
  busy?: boolean;
  title?: string;
  hint?: string;
};

export function BulkClientUpload({ onCsv, busy, title, hint }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  async function handleFile(f: File) {
    setReading(true);
    try {
      onCsv(await fileToCsv(f));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("biz.upload.read_error"));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const blob = new Blob([`${TEMPLATE_HEADERS.join(",")}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sucasa-homeowners-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const pending = reading || busy;

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">{title ?? t("biz.upload.title")}</h2>
      </div>
      <p className="mt-1 break-words text-xs text-muted-foreground">
        {hint ?? (
          <>
            {t("biz.upload.hint_cols")}{" "}
            <code>full_name, address, city, state, zip, email, loan_balance, rate, note</code>.{" "}
            {t("biz.upload.hint_req_a")} <code>full_name</code> {t("biz.upload.hint_req_and")}{" "}
            <code>address</code> {t("biz.upload.hint_req_b")}
          </>
        )}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-secondary disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {pending ? t("biz.upload.importing") : t("biz.upload.choose")}
        </button>
        <button
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-secondary"
        >
          <Download className="h-3.5 w-3.5" /> {t("biz.upload.template")}
        </button>
      </div>
    </div>
  );
}

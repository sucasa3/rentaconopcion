import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listReverseUploadBatches } from "@/lib/upload-reverse.functions";
import { useLanguage } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Open retained uploads without submitting a file again. Hidden while reverse connection is off. */
export function UploadResultsHistory({ bookId, onSelect }: { bookId: string; onSelect: (id: string) => void }) {
  const read = useServerFn(listReverseUploadBatches);
  const { language } = useLanguage();
  const { data, error } = useQuery({ queryKey: ["reverse-upload-history", bookId], queryFn: () => read({ data: { bookId } }), retry: false });
  if (error) return <p className="text-sm text-destructive">{language === "es" ? "No se pudieron cargar las cargas anteriores." : "Couldn't load previous uploads."}</p>;
  if (!data?.length) return null;
  return <Select onValueChange={onSelect}><SelectTrigger aria-label={language === "es" ? "Cargas anteriores" : "Previous upload results"}>
    <SelectValue placeholder={language === "es" ? "Abrir resultados anteriores" : "Open previous upload results"} />
  </SelectTrigger><SelectContent>{data.map((b) => <SelectItem key={b.id} value={b.id}>
    {new Date(b.created_at ?? "").toLocaleString(language === "es" ? "es-US" : "en-US")} · {b.total_rows} {language === "es" ? "filas" : "rows"}
  </SelectItem>)}</SelectContent></Select>;
}
/**
 * Client-side conversion of an uploaded homeowner list into CSV text.
 *
 * Behavior is intentionally identical to the previous inline implementation in
 * BulkClientUpload: .xlsx/.xls workbooks are parsed in the browser with SheetJS
 * (vendored Community Edition 0.20.3), the first worksheet is converted to CSV,
 * and any other file is read as plain text. No formulas are evaluated and no
 * HTML is produced.
 */

export function isSpreadsheetName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

type FileLike = {
  name: string;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export async function workbookBufferToCsv(buf: ArrayBuffer): Promise<string> {
  const XLSX = await import("@/vendor/xlsx/xlsx.mjs");
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("That workbook has no sheets");
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error("That workbook has no sheets");
  return XLSX.utils.sheet_to_csv(sheet);
}

export async function fileToCsv(file: FileLike): Promise<string> {
  const csv = isSpreadsheetName(file.name)
    ? await workbookBufferToCsv(await file.arrayBuffer())
    : await file.text();
  if (!csv.trim()) throw new Error("That file looks empty");
  return csv;
}

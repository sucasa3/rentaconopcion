// Minimal typings for the vendored SheetJS Community Edition 0.20.3 bundle.
export type WorkSheet = Record<string, unknown>;
export interface WorkBook {
  SheetNames: string[];
  Sheets: Record<string, WorkSheet>;
}
export function read(data: unknown, opts?: { type?: string }): WorkBook;
export function write(wb: WorkBook, opts?: { type?: string; bookType?: string }): unknown;
export const utils: {
  sheet_to_csv(ws: WorkSheet, opts?: Record<string, unknown>): string;
  aoa_to_sheet(data: unknown[][], opts?: Record<string, unknown>): WorkSheet;
  book_new(): WorkBook;
  book_append_sheet(wb: WorkBook, ws: WorkSheet, name?: string): void;
};
export const version: string;

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { fileToCsv, isSpreadsheetName } from "../spreadsheet-import";
import { parseClientCsv } from "../lender.server";

type Fake = { name: string; text: () => Promise<string>; arrayBuffer: () => Promise<ArrayBuffer> };

const HEADERS = ["full_name", "address", "city", "state", "zip", "email", "loan_balance", "rate", "note"];
const ROW = ["Ana Reyes", "12 Oak St", "Austin", "TX", "78704", "ana@example.com", "250000", "6.5", "annual review"];

function workbookFile(name: string, bookType: "xlsx" | "xls", rows: string[][]): Fake {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  const out = XLSX.write(wb, { type: "array", bookType }) as ArrayBuffer;
  return {
    name,
    text: async () => "",
    arrayBuffer: async () => out,
  };
}

function textFile(name: string, body: string): Fake {
  return {
    name,
    text: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

describe("spreadsheet import", () => {
  it("recognizes spreadsheet file names", () => {
    expect(isSpreadsheetName("list.xlsx")).toBe(true);
    expect(isSpreadsheetName("LIST.XLS")).toBe(true);
    expect(isSpreadsheetName("list.csv")).toBe(false);
    expect(isSpreadsheetName("list.pdf")).toBe(false);
  });

  it("converts a valid .xlsx workbook to CSV", async () => {
    const csv = await fileToCsv(workbookFile("clients.xlsx", "xlsx", [HEADERS, ROW]));
    expect(csv.split("\n")[0]).toContain("full_name");
    expect(csv).toContain("Ana Reyes");
  });

  it("converts a valid .xls workbook to CSV", async () => {
    const csv = await fileToCsv(workbookFile("clients.xls", "xls", [HEADERS, ROW]));
    expect(csv).toContain("Ana Reyes");
  });

  it("reads CSV files unchanged", async () => {
    const body = `${HEADERS.join(",")}\n${ROW.join(",")}\n`;
    expect(await fileToCsv(textFile("clients.csv", body))).toBe(body);
  });

  it("only uses the first worksheet", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ROW]), "First");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["ignored"], ["Second Sheet Row"]]), "Second");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const csv = await fileToCsv({ name: "two.xlsx", text: async () => "", arrayBuffer: async () => out });
    expect(csv).toContain("Ana Reyes");
    expect(csv).not.toContain("Second Sheet Row");
  });

  it("rejects a corrupt workbook", async () => {
    // Valid ZIP signature, truncated/garbage body: a real corrupt .xlsx upload.
    const bytes = new Uint8Array(200);
    bytes.set([0x50, 0x4b, 0x03, 0x04]);
    for (let i = 4; i < bytes.length; i += 1) bytes[i] = (i * 37) % 256;
    await expect(
      fileToCsv({
        name: "broken.xlsx",
        text: async () => "",
        arrayBuffer: async () => bytes.buffer,
      }),
    ).rejects.toBeInstanceOf(Error);
  });


  it("rejects an empty workbook", async () => {
    const csv = workbookFile("empty.xlsx", "xlsx", [[]]);
    await expect(fileToCsv(csv)).rejects.toThrow(/empty|sheets/i);
  });

  it("rejects an unsupported file read as empty text", async () => {
    await expect(fileToCsv(textFile("photo.png", ""))).rejects.toThrow(/empty/i);
  });

  it("keeps import field mapping working after conversion", async () => {
    const csv = await fileToCsv(workbookFile("clients.xlsx", "xlsx", [HEADERS, ROW]));
    const rows = parseClientCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.full_name).toBe("Ana Reyes");
    expect(rows[0]?.address).toBe("12 Oak St");
    expect(rows[0]?.city).toBe("Austin");
    expect(rows[0]?.zip).toBe("78704");
  });
});

import { parse } from "csv-parse/sync";
import { readSheet } from "read-excel-file/node";

export const TRAINING_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const TRAINING_IMPORT_MAX_ROWS = 500;
export const TRAINING_IMPORT_MAX_COLUMNS = 40;
const MAX_CELL_CHARACTERS = 2_000;

export type TrainingImportCellValue = string | number | boolean | null;

export type TrainingImportRow = {
  cells: Array<{
    column: number;
    display: string;
    header: string;
    raw: TrainingImportCellValue;
  }>;
  rowNumber: number;
  title: string;
};

export type ParsedTrainingImport = {
  fileName: string;
  format: "csv" | "xlsx";
  headers: string[];
  rows: TrainingImportRow[];
};

function displayValue(value: TrainingImportCellValue) {
  if (value === null) return "";
  return String(value);
}

function normalizeValue(value: unknown): TrainingImportCellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (typeof value === "string" && value.length > MAX_CELL_CHARACTERS) {
      throw new Error(`A cell exceeds the ${MAX_CELL_CHARACTERS.toLocaleString()} character limit.`);
    }
    return value;
  }
  return String(value);
}

function buildImport(fileName: string, format: "csv" | "xlsx", sourceRows: unknown[][]): ParsedTrainingImport {
  if (sourceRows.length < 2) throw new Error("The file needs a header row and at least one workout row.");

  const columnCount = Math.max(...sourceRows.map((row) => row.length));
  if (columnCount < 1 || columnCount > TRAINING_IMPORT_MAX_COLUMNS) {
    throw new Error(`Use a file with 1 to ${TRAINING_IMPORT_MAX_COLUMNS} columns.`);
  }

  const headers = Array.from({ length: columnCount }, (_, index) => {
    const value = normalizeValue(sourceRows[0]?.[index]);
    const label = displayValue(value).trim();
    return label || `Column ${index + 1}`;
  });

  const populatedRows = sourceRows
    .slice(1)
    .map((sourceRow, rowIndex) => {
      const rawValues = Array.from({ length: columnCount }, (_, index) => normalizeValue(sourceRow[index]));
      if (rawValues.every((value) => value === null || value === "")) return null;

      const displays = rawValues.map(displayValue);
      const firstValue = displays.find((value) => value.trim())?.trim() ?? "";
      const rowNumber = rowIndex + 2;
      return {
        cells: rawValues.map((raw, index) => ({
          column: index + 1,
          display: displays[index],
          header: headers[index],
          raw,
        })),
        rowNumber,
        title: (firstValue || `Imported row ${rowNumber}`).slice(0, 160),
      } satisfies TrainingImportRow;
    })
    .filter((row): row is TrainingImportRow => row !== null);

  if (!populatedRows.length) throw new Error("No workout rows were found below the header.");
  if (populatedRows.length > TRAINING_IMPORT_MAX_ROWS) {
    throw new Error(`Import at most ${TRAINING_IMPORT_MAX_ROWS} rows at a time.`);
  }

  return { fileName, format, headers, rows: populatedRows };
}

export async function parseTrainingHistoryFile(file: File): Promise<ParsedTrainingImport> {
  if (!file.name || file.size < 1) throw new Error("Choose a non-empty CSV or XLSX file.");
  if (file.size > TRAINING_IMPORT_MAX_BYTES) throw new Error("The file must be 5 MB or smaller.");

  const lowerName = file.name.toLowerCase();
  const bytes = await file.arrayBuffer();

  if (lowerName.endsWith(".csv")) {
    const records = parse(Buffer.from(bytes).toString("utf8"), {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as unknown[][];
    return buildImport(file.name, "csv", records);
  }

  if (lowerName.endsWith(".xlsx")) {
    const records = await readSheet(Buffer.from(bytes));
    return buildImport(file.name, "xlsx", records);
  }

  throw new Error("Only .csv and .xlsx files are supported.");
}

export function parseSavedTrainingImport(payload: string): ParsedTrainingImport {
  if (payload.length > 5_000_000) throw new Error("The parsed import is too large.");
  const parsed = JSON.parse(payload) as ParsedTrainingImport;
  if (!parsed || !["csv", "xlsx"].includes(parsed.format) || typeof parsed.fileName !== "string") {
    throw new Error("The import preview is invalid. Parse the file again.");
  }
  if (!Array.isArray(parsed.rows) || parsed.rows.length < 1 || parsed.rows.length > TRAINING_IMPORT_MAX_ROWS) {
    throw new Error("The import preview has an invalid row count.");
  }
  for (const row of parsed.rows) {
    if (!row || !Number.isInteger(row.rowNumber) || typeof row.title !== "string" || !Array.isArray(row.cells)) {
      throw new Error("The import preview contains an invalid row.");
    }
    if (row.cells.length < 1 || row.cells.length > TRAINING_IMPORT_MAX_COLUMNS) {
      throw new Error("The import preview contains an invalid column count.");
    }
    for (const cell of row.cells) {
      if (!cell || !Number.isInteger(cell.column) || typeof cell.header !== "string" || typeof cell.display !== "string") {
        throw new Error("The import preview contains an invalid cell.");
      }
      normalizeValue(cell.raw);
    }
  }
  return parsed;
}

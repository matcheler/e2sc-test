import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { columnIndexOf, findHeaderRow, openWorkbook, sheet } from './excel';

/**
 * Builders for upload fixtures: the Excel file a test uploads through the UI, or the B2B flat file
 * it drops into an inbox. No Playwright in here, so they are equally usable from any test.
 *
 * Why they exist:
 *   - A fixture's keys (BOL, PO line, batch ...) must be unique per run. Re-using one measures a
 *     record that already changed, and a reused inbox filename is ignored silently.
 *   - A fixture's dates must be computed at run time. Absolute dates go stale, and a past date is
 *     rejected while the archive still writes an .ack.
 *   - A test builds its fixture from a checked-in template (`fixtures/<KEY>/`) and writes the result
 *     to `fixtures/<KEY>/generated/`, which is never committed.
 *   - Nothing here waits: values come from the clock and the random generator only.
 */

// ---------------------------------------------------------------------------
// Unique values and relative dates
// ---------------------------------------------------------------------------

let uniqueCounter = 0;

/**
 * A value that is unique per call and per run, e.g. uniqueValue('PROCT2120-') -> 'PROCT2120-LZ4K9A3F0'.
 * The clock separates runs, the counter separates calls in the same millisecond, and the random
 * digit separates two runs that start in the same millisecond.
 */
export function uniqueValue(prefix = ''): string {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 36).toString(36).toUpperCase();
  const count = (uniqueCounter++).toString(36).toUpperCase();
  return `${prefix}${time}${rand}${count}`;
}

export type DateFormat = 'yyyy-MM-dd' | 'MM/dd/yyyy' | 'dd/MM/yyyy' | 'yyyyMMdd';

/** Format a date in local time. */
export function formatDate(d: Date, fmt: DateFormat = 'yyyy-MM-dd'): string {
  const yyyy = String(d.getFullYear());
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  switch (fmt) {
    case 'yyyy-MM-dd':
      return `${yyyy}-${MM}-${dd}`;
    case 'MM/dd/yyyy':
      return `${MM}/${dd}/${yyyy}`;
    case 'dd/MM/yyyy':
      return `${dd}/${MM}/${yyyy}`;
    case 'yyyyMMdd':
      return `${yyyy}${MM}${dd}`;
  }
}

/** Today plus `offsetDays` (negative for the past), formatted. Use a future offset for delivery dates. */
export function relativeDate(offsetDays: number, fmt: DateFormat = 'yyyy-MM-dd', from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  return formatDate(d, fmt);
}

// ---------------------------------------------------------------------------
// Excel upload file
// ---------------------------------------------------------------------------

export interface BuildXlsxOptions {
  /** Template workbook (checked in under fixtures/<KEY>/). Its first data row is the pattern for every output row. */
  template: string;
  /** Where to write the generated file. Missing folders are created. */
  out: string;
  /** One record per output row: { 'Column header': value }. Columns not named keep the template row's value. */
  rows: Array<Record<string, ExcelJS.CellValue>>;
  /** Sheet to edit; the first sheet by default. */
  sheetName?: string;
  /** Header labels that identify the header row when the sheet has title rows above it. */
  headerMustContain?: string[];
}

/**
 * Build an .xlsx upload file from a template. The rows below the header are replaced by one row per
 * record in `rows`, each starting as a copy of the template's first data row with the named columns
 * overridden. An unknown column label throws, so a renamed header fails loudly.
 * Returns the path written.
 */
export async function buildXlsxFromTemplate(opts: BuildXlsxOptions): Promise<string> {
  const wb = await openWorkbook(opts.template);
  const ws = sheet(wb, opts.sheetName);
  const header = findHeaderRow(ws, { mustContain: opts.headerMustContain });

  // The template's first data row is the pattern: its values, and its cell styles.
  const first = header.index + 1;
  const patternRow = ws.getRow(first);
  // 0-based, dense: exceljs reads an array with an own element 0 as starting at column 1.
  const pattern = Array.from(((patternRow.values as ExcelJS.CellValue[]) ?? []).slice(1));
  const patternStyles: Array<Partial<ExcelJS.Style>> = [];
  patternRow.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell, col: number) => {
    patternStyles[col] = { ...cell.style };
  });

  // Overwrite the data rows in place. (exceljs's spliceRows leaves empty trailing rows behind when it
  // removes more than it inserts, so surplus template rows are cleared instead.)
  const templateRows = Math.max(0, ws.rowCount - header.index);
  const total = Math.max(opts.rows.length, templateRows);
  for (let i = 0; i < total; i++) {
    const row = ws.getRow(first + i);
    if (i >= opts.rows.length) {
      row.values = [];
      continue;
    }
    const values = [...pattern];
    for (const [label, value] of Object.entries(opts.rows[i])) {
      const col = columnIndexOf(header, label);
      if (col === -1) {
        throw new Error(`Column "${label}" not in header row ${header.index} of ${opts.template}. Present: ${header.headers.join(' | ')}`);
      }
      values[col - 1] = value;
    }
    row.values = values;
    patternStyles.forEach((style, col) => {
      if (style) row.getCell(col).style = { ...style };
    });
  }

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  await wb.xlsx.writeFile(opts.out);
  return opts.out;
}

// ---------------------------------------------------------------------------
// B2B flat file (tab- or otherwise delimited text)
// ---------------------------------------------------------------------------

export interface FillTemplateTextOptions {
  /** Template text file with {{TOKEN}} placeholders, e.g. a BOL or {{SHIP_DATE}} column value. */
  template: string;
  /** Where to write the generated file. Missing folders are created. */
  out: string;
  /** Token name -> value. Every token in the template must have one. */
  values: Record<string, string>;
  /** Text encoding of the template and output (default utf8). */
  encoding?: 'utf8' | 'latin1' | 'utf16le' | 'ascii';
}

/**
 * Fill {{TOKEN}} placeholders in a flat-file template and write the result. Line endings, tabs and
 * every other character are kept exactly as in the template. A token with no value throws, naming it.
 * Returns the path written.
 */
export function fillTemplateText(opts: FillTemplateTextOptions): string {
  const encoding = opts.encoding ?? 'utf8';
  const text = fs.readFileSync(opts.template, { encoding });
  const missing = new Set<string>();
  const filled = text.replace(/\{\{(\w+)\}\}/g, (_m: string, name: string) => {
    if (name in opts.values) return opts.values[name];
    missing.add(name);
    return '';
  });
  if (missing.size) {
    throw new Error(`No value for template token(s) ${[...missing].map((n) => `{{${n}}}`).join(', ')} in ${opts.template}`);
  }
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, filled, { encoding });
  return opts.out;
}

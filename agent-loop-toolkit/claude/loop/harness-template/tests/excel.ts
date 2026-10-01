import ExcelJS from 'exceljs';

/**
 * Workbook-reading helpers — the non-Playwright half of "download a file and
 * assert its contents".
 *
 * Playwright captures the download (see `saveDownload` / `waitForDownloadJobLink`
 * in helpers.ts); nothing in Playwright can read a spreadsheet, so parsing goes
 * through `exceljs` (devDependency, added 2026-08-20).
 *
 * Kept separate from helpers.ts on purpose: there is no Page/Frame in here, so
 * these functions are equally usable for *building* an .xlsx to feed an upload
 * workflow (`ws.addRow(...)` + `wb.xlsx.writeFile(...)`) as for reading one that
 * a download produced.
 *
 * E2open download quirks these helpers exist to absorb:
 *   - The generated workbook often carries title / run-parameter rows ABOVE the
 *     real column headers, so row 1 is not reliably the header row — use
 *     `findHeaderRow` rather than assuming `getRow(1)`.
 *   - Cells arrive as rich text, formula results, hyperlinks or dates depending
 *     on the column's spec formatting; `cellText` normalises all of those to the
 *     trimmed string a human sees, which is what assertions should compare.
 *   - Rows are sparse: exceljs `row.values` is 1-based with a hole at index 0.
 */

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

/** Open a downloaded .xlsx from disk. */
export async function openWorkbook(file: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

/** Sheet names in tab order. */
export function sheetNames(wb: ExcelJS.Workbook): string[] {
  return wb.worksheets.map((ws) => ws.name);
}

/**
 * The sheet to assert against: the named one if `name` is given, else the first.
 * Throws (rather than returning undefined) so a renamed tab fails loudly.
 */
export function sheet(wb: ExcelJS.Workbook, name?: string): ExcelJS.Worksheet {
  const ws = name ? wb.getWorksheet(name) : wb.worksheets[0];
  if (!ws) {
    throw new Error(
      `Worksheet ${name ? `"${name}"` : '(first)'} not found. Sheets present: ${sheetNames(wb).join(', ') || '(none)'}`
    );
  }
  return ws;
}

// ---------------------------------------------------------------------------
// Cell / row reading
// ---------------------------------------------------------------------------

/**
 * The text a human sees in a cell — normalises every exceljs value shape
 * (rich text, formula result, hyperlink, date, number, error, null) to a
 * trimmed string.
 */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('').trim();
    }
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue); // formula
    if ('text' in v) return String(v.text ?? '').trim(); // hyperlink
    if ('error' in v) return String(v.error ?? '').trim();
  }
  return String(value).trim();
}

/** Every cell of a row as normalised text, left to right (gaps become ''). */
export function rowTexts(row: ExcelJS.Row): string[] {
  const out: string[] = [];
  row.eachCell({ includeEmpty: true }, (cell) => out.push(cellText(cell.value)));
  return out;
}

// ---------------------------------------------------------------------------
// Header discovery
// ---------------------------------------------------------------------------

export interface HeaderRow {
  /** 1-based sheet row index the headers were found on. */
  index: number;
  /** Trimmed header labels, left to right. */
  headers: string[];
}

/**
 * Locate the column-header row, surviving the title / run-parameter rows
 * E2open puts above the grid.
 *
 * With `mustContain`, returns the first row holding every named label — precise,
 * and what you should use once the real labels are known.
 *
 * Without it, returns the **widest** row in the scanned window (first one on a
 * tie, so the header beats its own data rows). Picking merely the first row with
 * 2+ cells would wrongly select a narrow parameter row such as
 * `Generated | 08/20/26` sitting above a 12-column header.
 */
/**
 * True for a CDM index row like `#0  1  2  3 …`.
 *
 * These carry exactly as many cells as the real label row that follows them, so a
 * filled-count tie-break picks the index row instead (reduce keeps the earlier
 * candidate on a tie). Some CDM downloads open with one, which made every
 * column-by-name lookup resolve against "#0", "1", "2" …
 */
function looksLikeIndexRow(filled: string[]): boolean {
  if (filled.length < 2) return false;
  const numeric = filled.filter((c) => /^#?\d+$/.test(c.trim()));
  return numeric.length / filled.length >= 0.8;
}

export function findHeaderRow(
  ws: ExcelJS.Worksheet,
  opts: { mustContain?: string[]; searchRows?: number } = {}
): HeaderRow {
  const { mustContain = [], searchRows = 15 } = opts;
  const limit = Math.min(searchRows, ws.rowCount || searchRows);

  const candidates: Array<HeaderRow & { filled: number }> = [];
  for (let i = 1; i <= limit; i++) {
    const headers = rowTexts(ws.getRow(i));
    const filled = headers.filter((h) => h !== '');
    if (filled.length < 2) continue;
    if (mustContain.length && !mustContain.every((m) => filled.some((h) => h === m))) continue;
    if (mustContain.length) return { index: i, headers }; // precise: first match wins
    // Only heuristic mode needs this guard; an explicit label list already wins.
    if (looksLikeIndexRow(filled)) continue;
    candidates.push({ index: i, headers, filled: filled.length });
  }

  if (candidates.length) {
    return candidates.reduce((best, c) => (c.filled > best.filled ? c : best));
  }

  throw new Error(
    `No header row found in the first ${limit} rows of "${ws.name}"` +
      (mustContain.length ? ` containing [${mustContain.join(', ')}]` : '') +
      `. First rows were: ${JSON.stringify(
        Array.from({ length: Math.min(3, limit) }, (_, i) => rowTexts(ws.getRow(i + 1)))
      )}`
  );
}

/** 1-based column index of a header label, or -1 if absent. */
export function columnIndexOf(header: HeaderRow, label: string): number {
  const i = header.headers.findIndex((h) => h === label);
  return i === -1 ? -1 : i + 1;
}

// ---------------------------------------------------------------------------
// Data rows
// ---------------------------------------------------------------------------

/** Data rows (everything below the header row) as normalised text arrays. */
export function dataRows(ws: ExcelJS.Worksheet, header: HeaderRow): string[][] {
  const rows: string[][] = [];
  for (let i = header.index + 1; i <= ws.rowCount; i++) {
    const texts = rowTexts(ws.getRow(i));
    if (texts.some((t) => t !== '')) rows.push(texts);
  }
  return rows;
}

/** Every value under one column header, in row order (blanks included). */
export function columnValues(ws: ExcelJS.Worksheet, header: HeaderRow, label: string): string[] {
  const col = columnIndexOf(header, label);
  if (col === -1) {
    throw new Error(`Column "${label}" not in header row ${header.index}. Present: ${header.headers.join(' | ')}`);
  }
  return dataRows(ws, header).map((r) => r[col - 1] ?? '');
}

/** One data row as a { header: value } record — handy for readable assertions. */
export function rowRecord(header: HeaderRow, row: string[]): Record<string, string> {
  const rec: Record<string, string> = {};
  header.headers.forEach((h, i) => {
    if (h !== '') rec[h] = row[i] ?? '';
  });
  return rec;
}

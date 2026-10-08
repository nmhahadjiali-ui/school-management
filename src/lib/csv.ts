// CSV building for exports. Cells that a spreadsheet would treat as a formula
// (=, +, -, @, tab, CR) are prefixed with an apostrophe — except plain numbers
// such as "-150.00" — so exported data can never execute in Excel/Sheets.

const NUMBER = /^-?\d+(\.\d+)?$/
const FORMULA = /^[=+\-@\t\r]/

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  let s = typeof value === "string" ? value : String(value)
  if (!NUMBER.test(s) && FORMULA.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 (names with ñ, é…) correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

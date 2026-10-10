import "server-only"
import ExcelJS from "exceljs"
import { newStudentSchema } from "@/lib/validations/school"

// Student import from Excel (.xlsx) or CSV. Every row is checked with the same
// rules as the "New student" form; nothing is written here.

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024
export const IMPORT_MAX_ROWS = 1000

export const IMPORT_COLUMNS = [
  { key: "student_number", label: "Student number", aliases: ["studentnumber", "studentno", "studentid", "idnumber", "idno", "lrn", "number"] },
  { key: "first_name", label: "First name", aliases: ["firstname", "givenname", "first"] },
  { key: "middle_name", label: "Middle name", aliases: ["middlename", "middle", "mi", "middleinitial"] },
  { key: "last_name", label: "Last name", aliases: ["lastname", "surname", "familyname", "last"] },
  { key: "suffix", label: "Suffix", aliases: ["suffix", "extension", "nameextension", "ext"] },
  { key: "date_of_birth", label: "Date of birth", aliases: ["dateofbirth", "birthdate", "birthday", "dob", "birth"] },
  { key: "gender", label: "Gender", aliases: ["gender", "sex"] },
  { key: "email", label: "Email", aliases: ["email", "emailaddress", "e-mail"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phonenumber", "mobile", "mobilenumber", "contact", "contactnumber", "cellphone"] },
  { key: "address", label: "Address", aliases: ["address", "homeaddress"] },
  { key: "status", label: "Status", aliases: ["status"] },
] as const

type Key = (typeof IMPORT_COLUMNS)[number]["key"]
export type ImportValues = Record<Key, string>
export type ImportRow = { row: number; values: ImportValues; errors: string[] }
export type ImportPreview = { rows: ImportRow[]; valid: number; invalid: number; ignoredColumns: string[] }

const LABEL = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, c.label])) as Record<Key, string>
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

function isoFromDate(d: Date) {
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10)
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ""
  if (v instanceof Date) return isoFromDate(v)
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim()
    if ("text" in v) return String(v.text).trim()
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue)
    return ""
  }
  return String(v).trim()
}

/** Accepts 2014-03-05, 3/5/2014 and 03-05-2014 (month first, as Excel shows in the Philippines). */
function normalizeDate(s: string): string {
  if (!s) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
  return s
}

function normalizeGender(s: string): string {
  const g = s.toLowerCase()
  if (!g) return ""
  if (g === "m" || g === "male") return "male"
  if (g === "f" || g === "female") return "female"
  if (g === "other") return "other"
  return g
}

/** Minimal CSV reader (quotes, commas, CRLF, UTF-8 BOM). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const s = text.replace(/^﻿/, "")
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ",") {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim()))
}

async function readTable(buffer: ArrayBuffer, fileName: string): Promise<string[][]> {
  if (/\.csv$/i.test(fileName)) return parseCsv(new TextDecoder("utf-8").decode(buffer))
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) return []
  const out: string[][] = []
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: string[] = []
    for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(row.getCell(c).value))
    out[n - 1] = cells
  })
  return Array.from(out, (r) => r ?? [])
}

export class ImportFileError extends Error {}

/**
 * Parse and check a file. `existingNumbers` = student numbers already used in
 * the school; `autoNumbers` = blank numbers will be assigned automatically.
 */
export async function previewStudentImport(
  buffer: ArrayBuffer,
  fileName: string,
  opts: { autoNumbers: boolean; existingNumbers: (numbers: string[]) => Promise<Set<string>> }
): Promise<ImportPreview> {
  let table: string[][]
  try {
    table = await readTable(buffer, fileName)
  } catch {
    throw new ImportFileError("The file could not be read. Save it as Excel (.xlsx) or CSV and try again.")
  }
  const headerIndex = table.findIndex((r) => r.some((c) => c !== ""))
  if (headerIndex < 0) throw new ImportFileError("The file is empty.")

  const header = table[headerIndex]
  const columnOf = new Map<Key, number>()
  const ignoredColumns: string[] = []
  header.forEach((h, i) => {
    if (!h) return
    const col = IMPORT_COLUMNS.find((c) => c.aliases.includes(norm(h) as never) || norm(c.label) === norm(h))
    if (col && !columnOf.has(col.key)) columnOf.set(col.key, i)
    else ignoredColumns.push(h)
  })
  const missing = (["first_name", "last_name"] as Key[]).filter((k) => !columnOf.has(k))
  if (!opts.autoNumbers && !columnOf.has("student_number")) missing.unshift("student_number")
  if (missing.length) {
    throw new ImportFileError(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.map((k) => LABEL[k]).join(", ")}. Download the template to see the expected headings.`)
  }

  const dataRows = table.slice(headerIndex + 1).map((cells, i) => ({ cells, row: headerIndex + i + 2 })).filter((r) => r.cells.some((c) => c !== ""))
  if (dataRows.length === 0) throw new ImportFileError("The file has headings but no students.")
  if (dataRows.length > IMPORT_MAX_ROWS) throw new ImportFileError(`The file has ${dataRows.length} students. Import at most ${IMPORT_MAX_ROWS} at a time.`)

  const rows: ImportRow[] = dataRows.map(({ cells, row }) => {
    const get = (k: Key) => (columnOf.has(k) ? (cells[columnOf.get(k)!] ?? "") : "")
    const values = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, get(c.key)])) as ImportValues
    values.date_of_birth = normalizeDate(values.date_of_birth)
    values.gender = normalizeGender(values.gender)
    values.status = values.status.toLowerCase() || "active"
    const errors: string[] = []
    const parsed = newStudentSchema.safeParse(values)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as Key
        const msg = issue.code === "invalid_value" ? `${LABEL[key] ?? key} is not valid` : issue.message
        errors.push(msg.startsWith(LABEL[key] ?? "\u0000") ? msg : `${LABEL[key] ?? key}: ${msg}`)
      }
    }
    if (!values.student_number && !opts.autoNumbers) errors.push("Student number is required (or turn on automatic student numbers in Settings)")
    return { row, values, errors }
  })

  // Duplicate numbers: within the file, and already used in the school.
  const seen = new Map<string, number>()
  for (const r of rows) {
    const n = r.values.student_number
    if (!n) continue
    if (seen.has(n)) r.errors.push(`Student number ${n} also appears on row ${seen.get(n)}`)
    else seen.set(n, r.row)
  }
  const taken = await opts.existingNumbers([...seen.keys()])
  for (const r of rows) if (r.values.student_number && taken.has(r.values.student_number)) r.errors.push(`Student number ${r.values.student_number} is already used in your school`)

  const invalid = rows.filter((r) => r.errors.length).length
  return { rows, valid: rows.length - invalid, invalid, ignoredColumns }
}

/** The downloadable template (.xlsx): headings, one example and instructions. */
export async function studentImportTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Students")
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.label, key: c.key, width: c.key === "address" ? 36 : 18, style: { numFmt: "@" } }))
  ws.getRow(1).font = { bold: true }
  ws.addRow({ student_number: "2026-0001", first_name: "Juan", middle_name: "Santos", last_name: "Dela Cruz", suffix: "", date_of_birth: "2015-03-14", gender: "Male", email: "", phone: "", address: "Marawi City", status: "Active" })
  const help = wb.addWorksheet("Instructions")
  help.columns = [{ width: 110 }]
  for (const line of [
    "One student per row on the Students sheet. Keep the headings in row 1. Delete the example row before importing.",
    "Required: First name, Last name, and Student number (leave Student number blank only if automatic student numbers are on in Settings).",
    "Date of birth: YYYY-MM-DD (e.g. 2015-03-14) or M/D/YYYY (e.g. 3/14/2015), or an Excel date.",
    "Gender: Male, Female, Other (or M / F). Status: Active (default), Inactive, Graduated, Transferred, Withdrawn.",
    "Student numbers must be unique in your school. Rows with problems are listed before importing and can be skipped.",
    `At most ${IMPORT_MAX_ROWS} students and 2 MB per file. CSV files (UTF-8) with the same headings also work.`,
  ]) help.addRow([line])
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

import "server-only"
import ExcelJS from "exceljs"
import type { z } from "zod"
import { newStudentSchema, teacherSchema } from "@/lib/validations/school"

// Import of people records (students, teachers) from Excel (.xlsx) or CSV.
// Every row is checked with the same rules as the "New ..." form; nothing is
// written here (see /api/import/[entity]).

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024
export const IMPORT_MAX_ROWS = 1000

type Column = { key: string; label: string; aliases: string[] }
const col = (key: string, label: string, ...aliases: string[]): Column => ({ key, label, aliases })

const NAME_COLUMNS = [
  col("first_name", "First name", "firstname", "givenname", "first"),
  col("middle_name", "Middle name", "middlename", "middle", "mi", "middleinitial"),
  col("last_name", "Last name", "lastname", "surname", "familyname", "last"),
]
const CONTACT_COLUMNS = [
  col("email", "Email", "email", "emailaddress"),
  col("phone", "Phone", "phone", "phonenumber", "mobile", "mobilenumber", "contact", "contactnumber", "cellphone"),
]

export type ImportEntity = "students" | "teachers"

type Spec = {
  noun: string
  nouns: string
  numberKey: string
  numberLabel: string
  /** Without automatic numbering, is the number required? */
  numberRequired: boolean
  /** Uniqueness of the number is case-insensitive in the database. */
  numberIgnoresCase: boolean
  autoSetting: "student_number_auto" | "employee_number_auto"
  columns: Column[]
  schema: z.ZodType
  statuses: string[]
  example: Record<string, string>
  notes: string[]
}

export const IMPORT_SPECS: Record<ImportEntity, Spec> = {
  students: {
    noun: "student",
    nouns: "students",
    numberKey: "student_number",
    numberLabel: "Student number",
    numberRequired: true,
    numberIgnoresCase: false,
    autoSetting: "student_number_auto",
    columns: [
      col("student_number", "Student number", "studentnumber", "studentno", "studentid", "idnumber", "idno", "lrn", "number"),
      ...NAME_COLUMNS,
      col("suffix", "Suffix", "suffix", "extension", "nameextension", "ext"),
      col("date_of_birth", "Date of birth", "dateofbirth", "birthdate", "birthday", "dob", "birth"),
      col("gender", "Gender", "gender", "sex"),
      ...CONTACT_COLUMNS,
      col("address", "Address", "address", "homeaddress"),
      col("status", "Status", "status"),
    ],
    schema: newStudentSchema,
    statuses: ["Active", "Inactive", "Graduated", "Transferred", "Withdrawn"],
    example: { student_number: "2026-0001", first_name: "Juan", middle_name: "Santos", last_name: "Dela Cruz", date_of_birth: "2015-03-14", gender: "Male", address: "Marawi City", status: "Active" },
    notes: [
      "Date of birth: YYYY-MM-DD (e.g. 2015-03-14) or M/D/YYYY (e.g. 3/14/2015), or an Excel date.",
      "Gender: Male, Female, Other (or M / F).",
    ],
  },
  teachers: {
    noun: "teacher",
    nouns: "teachers",
    numberKey: "employee_number",
    numberLabel: "Employee number",
    numberRequired: false,
    numberIgnoresCase: true,
    autoSetting: "employee_number_auto",
    columns: [
      col("employee_number", "Employee number", "employeenumber", "employeeno", "employeeid", "empno", "empid", "idnumber", "idno", "number"),
      ...NAME_COLUMNS,
      ...CONTACT_COLUMNS,
      col("specialization", "Specialization", "specialization", "subject", "subjects", "major", "field"),
      col("status", "Status", "status"),
    ],
    schema: teacherSchema,
    statuses: ["Active", "Inactive", "Resigned", "Retired"],
    example: { employee_number: "EMP-0001", first_name: "Amina", middle_name: "", last_name: "Macarambon", email: "amina@example.com", phone: "0917 123 4567", specialization: "Mathematics", status: "Active" },
    notes: ["Email is needed later to invite the teacher to the app."],
  },
}

export type ImportRow = { row: number; values: Record<string, string>; errors: string[] }
export type ImportPreview = { rows: ImportRow[]; valid: number; invalid: number; ignoredColumns: string[] }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ""
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10)
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
  if (!s || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : s
}

function normalizeGender(s: string): string {
  const g = s.toLowerCase()
  if (g === "m" || g === "male") return "male"
  if (g === "f" || g === "female") return "female"
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
 * Parse and check a file. `existingNumbers` returns the numbers (as given)
 * already used in the school; `autoNumbers` = blank numbers will be assigned.
 */
export async function previewImport(
  entity: ImportEntity,
  buffer: ArrayBuffer,
  fileName: string,
  opts: { autoNumbers: boolean; existingNumbers: (numbers: string[]) => Promise<Set<string>> }
): Promise<ImportPreview> {
  const spec = IMPORT_SPECS[entity]
  const label = (k: string) => spec.columns.find((c) => c.key === k)?.label ?? k
  let table: string[][]
  try {
    table = await readTable(buffer, fileName)
  } catch {
    throw new ImportFileError("The file could not be read. Save it as Excel (.xlsx) or CSV and try again.")
  }
  const headerIndex = table.findIndex((r) => r.some((c) => c !== ""))
  if (headerIndex < 0) throw new ImportFileError("The file is empty.")

  const columnOf = new Map<string, number>()
  const ignoredColumns: string[] = []
  table[headerIndex].forEach((h, i) => {
    if (!h) return
    const c = spec.columns.find((c) => c.aliases.includes(norm(h)) || norm(c.label) === norm(h))
    if (c && !columnOf.has(c.key)) columnOf.set(c.key, i)
    else ignoredColumns.push(h)
  })
  const missing = ["first_name", "last_name"].filter((k) => !columnOf.has(k))
  if (spec.numberRequired && !opts.autoNumbers && !columnOf.has(spec.numberKey)) missing.unshift(spec.numberKey)
  if (missing.length) {
    throw new ImportFileError(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.map(label).join(", ")}. Download the template to see the expected headings.`)
  }

  const dataRows = table
    .slice(headerIndex + 1)
    .map((cells, i) => ({ cells, row: headerIndex + i + 2 }))
    .filter((r) => r.cells.some((c) => c !== ""))
  if (dataRows.length === 0) throw new ImportFileError(`The file has headings but no ${spec.nouns}.`)
  if (dataRows.length > IMPORT_MAX_ROWS) throw new ImportFileError(`The file has ${dataRows.length} ${spec.nouns}. Import at most ${IMPORT_MAX_ROWS} at a time.`)

  const rows: ImportRow[] = dataRows.map(({ cells, row }) => {
    const values = Object.fromEntries(spec.columns.map((c) => [c.key, columnOf.has(c.key) ? (cells[columnOf.get(c.key)!] ?? "") : ""]))
    if ("date_of_birth" in values) values.date_of_birth = normalizeDate(values.date_of_birth)
    if ("gender" in values) values.gender = normalizeGender(values.gender)
    values.status = values.status.toLowerCase() || "active"
    if (values.email) values.email = values.email.toLowerCase()
    const errors: string[] = []
    const parsed = spec.schema.safeParse(values)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0])
        const msg = issue.code === "invalid_value" ? `${label(key)} is not valid` : issue.message
        errors.push(msg.startsWith(label(key)) ? msg : `${label(key)}: ${msg}`)
      }
    }
    if (spec.numberRequired && !values[spec.numberKey] && !opts.autoNumbers) {
      errors.push(`${spec.numberLabel} is required (or turn on automatic ${spec.numberLabel.toLowerCase()}s in Settings)`)
    }
    return { row, values, errors }
  })

  // Duplicate numbers: within the file, and already used in the school.
  const key = (n: string) => (spec.numberIgnoresCase ? n.toLowerCase() : n)
  const seen = new Map<string, number>()
  for (const r of rows) {
    const n = r.values[spec.numberKey]
    if (!n) continue
    if (seen.has(key(n))) r.errors.push(`${spec.numberLabel} ${n} also appears on row ${seen.get(key(n))}`)
    else seen.set(key(n), r.row)
  }
  const numbers = rows.map((r) => r.values[spec.numberKey]).filter(Boolean)
  const taken = new Set([...(await opts.existingNumbers(numbers))].map(key))
  for (const r of rows) {
    const n = r.values[spec.numberKey]
    if (n && taken.has(key(n))) r.errors.push(`${spec.numberLabel} ${n} is already used in your school`)
  }

  const invalid = rows.filter((r) => r.errors.length).length
  return { rows, valid: rows.length - invalid, invalid, ignoredColumns }
}

/** Values of a checked row, ready to insert (blank optional fields become null). */
export function importInsertValues(entity: ImportEntity, values: Record<string, string>): Record<string, string | null> {
  const spec = IMPORT_SPECS[entity]
  const out: Record<string, string | null> = {}
  for (const c of spec.columns) out[c.key] = values[c.key] === "" ? null : values[c.key]
  // Students: a blank number is filled in by the database (automatic numbering).
  if (entity === "students") out.student_number = values.student_number ?? ""
  return out
}

/** The downloadable template (.xlsx): headings, one example and instructions. */
export async function importTemplate(entity: ImportEntity): Promise<ArrayBuffer> {
  const spec = IMPORT_SPECS[entity]
  const wb = new ExcelJS.Workbook()
  const sheetName = spec.nouns[0].toUpperCase() + spec.nouns.slice(1)
  const ws = wb.addWorksheet(sheetName)
  ws.columns = spec.columns.map((c) => ({ header: c.label, key: c.key, width: c.key === "address" || c.key === "email" ? 30 : 18, style: { numFmt: "@" } }))
  ws.getRow(1).font = { bold: true }
  ws.addRow(spec.example)
  const help = wb.addWorksheet("Instructions")
  help.columns = [{ width: 110 }]
  for (const line of [
    `One ${spec.noun} per row on the ${sheetName} sheet. Keep the headings in row 1. Delete the example row before importing.`,
    spec.numberRequired
      ? `Required: First name, Last name, and ${spec.numberLabel} (leave it blank only if automatic ${spec.numberLabel.toLowerCase()}s are on in Settings).`
      : `Required: First name and Last name. ${spec.numberLabel} is optional (blank ones get automatic numbers if that is on in Settings).`,
    ...spec.notes,
    `Status: ${spec.statuses.join(", ")} (default Active).`,
    `${spec.numberLabel}s must be unique in your school. Rows with problems are listed before importing and can be skipped.`,
    `At most ${IMPORT_MAX_ROWS} ${spec.nouns} and 2 MB per file. CSV files (UTF-8) with the same headings also work.`,
  ]) help.addRow([line])
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

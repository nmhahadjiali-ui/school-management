import "server-only"
import ExcelJS from "exceljs"
import { IMPORT_MAX_ROWS, ImportFileError, norm, normalizeDate, readTable, type ImportPreview, type ImportRow } from "@/lib/import/records"

// Enrollment import: places EXISTING students (matched by student number) in a
// grade level, and optionally a section, of one academic year. Every row is
// checked against the school's records first; nothing is written here.

const COLUMNS = [
  { key: "student_number", label: "Student number", aliases: ["studentnumber", "studentno", "studentid", "idnumber", "idno", "lrn", "number"] },
  { key: "grade_level", label: "Grade level", aliases: ["gradelevel", "grade", "level", "yearlevel", "gradeyear"] },
  { key: "section", label: "Section", aliases: ["section", "class", "sectionname"] },
  { key: "enrollment_date", label: "Enrollment date", aliases: ["enrollmentdate", "dateenrolled", "enrolled", "date"] },
] as const
/** Columns accepted (for readability) but not used: the name comes from the student record. */
const NAME_ALIASES = ["name", "studentname", "fullname", "firstname", "lastname", "middlename", "surname", "givenname"]

type Key = (typeof COLUMNS)[number]["key"]
const LABEL = Object.fromEntries(COLUMNS.map((c) => [c.key, c.label])) as Record<Key, string>

export type EnrollmentContext = {
  year: { id: string; start_date: string; end_date: string }
  today: string
  /** All students of the school, by student number. */
  students: Map<string, { id: string; first_name: string; last_name: string; status: string }>
  /** Student ids that already have an open enrollment in this year. */
  enrolled: Set<string>
  grades: { id: string; name: string; code: string; status: string }[]
  sections: { id: string; name: string; code: string | null; grade_level_id: string; status: string; capacity: number | null; enrolled: number }[]
}

export type EnrollmentInsert = { student_id: string; grade_level_id: string; section_id: string | null; enrollment_date: string }

export async function previewEnrollmentImport(buffer: ArrayBuffer, fileName: string, ctx: EnrollmentContext): Promise<ImportPreview & { inserts: (EnrollmentInsert | null)[] }> {
  let table: string[][]
  try {
    table = await readTable(buffer, fileName)
  } catch {
    throw new ImportFileError("The file could not be read. Save it as Excel (.xlsx) or CSV and try again.")
  }
  const headerIndex = table.findIndex((r) => r.some((c) => c !== ""))
  if (headerIndex < 0) throw new ImportFileError("The file is empty.")

  const columnOf = new Map<Key, number>()
  const ignoredColumns: string[] = []
  table[headerIndex].forEach((h, i) => {
    if (!h) return
    const c = COLUMNS.find((c) => (c.aliases as readonly string[]).includes(norm(h)) || norm(c.label) === norm(h))
    if (c && !columnOf.has(c.key)) columnOf.set(c.key, i)
    else if (!NAME_ALIASES.includes(norm(h))) ignoredColumns.push(h)
  })
  const missing = (["student_number", "grade_level"] as Key[]).filter((k) => !columnOf.has(k))
  if (missing.length) {
    throw new ImportFileError(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.map((k) => LABEL[k]).join(", ")}. Download the template to see the expected headings.`)
  }

  const dataRows = table
    .slice(headerIndex + 1)
    .map((cells, i) => ({ cells, row: headerIndex + i + 2 }))
    .filter((r) => r.cells.some((c) => c !== ""))
  if (dataRows.length === 0) throw new ImportFileError("The file has headings but no students.")
  if (dataRows.length > IMPORT_MAX_ROWS) throw new ImportFileError(`The file has ${dataRows.length} rows. Import at most ${IMPORT_MAX_ROWS} at a time.`)

  const gradeBy = (v: string) => ctx.grades.find((g) => g.name.toLowerCase() === v.toLowerCase() || g.code.toLowerCase() === v.toLowerCase())
  const seenStudent = new Map<string, number>()
  const seatsUsed = new Map<string, number>()

  const rows: (ImportRow & { insert: EnrollmentInsert | null })[] = dataRows.map(({ cells, row }) => {
    const get = (k: Key) => (columnOf.has(k) ? (cells[columnOf.get(k)!] ?? "").trim() : "")
    const values: Record<string, string> = {
      student_number: get("student_number"),
      grade_level: get("grade_level"),
      section: get("section"),
      enrollment_date: normalizeDate(get("enrollment_date")) || ctx.today,
      first_name: "",
      last_name: "",
    }
    const errors: string[] = []

    const student = values.student_number ? ctx.students.get(values.student_number) : undefined
    if (!values.student_number) errors.push("Student number is required")
    else if (!student) errors.push(`No student with number ${values.student_number} in your school (add or import the student first)`)
    else {
      values.first_name = student.first_name
      values.last_name = student.last_name
      if (student.status !== "active") errors.push(`The student is ${student.status}`)
      if (ctx.enrolled.has(student.id)) errors.push("Already enrolled in this academic year")
      if (seenStudent.has(student.id)) errors.push(`The same student is also on row ${seenStudent.get(student.id)}`)
      else seenStudent.set(student.id, row)
    }

    const grade = values.grade_level ? gradeBy(values.grade_level) : undefined
    if (!values.grade_level) errors.push("Grade level is required")
    else if (!grade) errors.push(`Grade level “${values.grade_level}” was not found`)
    else if (grade.status !== "active") errors.push(`Grade level ${grade.name} is inactive`)
    if (grade) values.grade_level = grade.name

    let sectionId: string | null = null
    if (values.section && grade) {
      const section = ctx.sections.find((s) => s.grade_level_id === grade.id && (s.name.toLowerCase() === values.section.toLowerCase() || s.code?.toLowerCase() === values.section.toLowerCase()))
      if (!section) errors.push(`${grade.name} has no section “${values.section}” in this academic year`)
      else if (section.status !== "active") errors.push(`Section ${section.name} is inactive`)
      else {
        values.section = section.name
        sectionId = section.id
      }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.enrollment_date) || Number.isNaN(Date.parse(values.enrollment_date))) errors.push("Enrollment date is not valid (use YYYY-MM-DD or M/D/YYYY)")
    else if (values.enrollment_date > ctx.year.end_date) errors.push("Enrollment date is after the end of the academic year")

    // Seats: count only rows that are otherwise fine, in file order.
    if (sectionId && errors.length === 0) {
      const section = ctx.sections.find((s) => s.id === sectionId)!
      const used = (seatsUsed.get(sectionId) ?? section.enrolled) + 1
      if (section.capacity !== null && used > section.capacity) errors.push(`Section ${section.name} would be over its capacity of ${section.capacity}`)
      else seatsUsed.set(sectionId, used)
    }

    const insert = errors.length === 0 && student && grade ? { student_id: student.id, grade_level_id: grade.id, section_id: sectionId, enrollment_date: values.enrollment_date } : null
    return { row, values, errors, insert }
  })

  const invalid = rows.filter((r) => r.errors.length).length
  return {
    rows: rows.map(({ row, values, errors }) => ({ row, values, errors })),
    inserts: rows.map((r) => r.insert),
    valid: rows.length - invalid,
    invalid,
    ignoredColumns,
  }
}

export async function enrollmentImportTemplate(yearName: string): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Enrollments")
  ws.columns = [
    { header: "Student number", key: "student_number", width: 18, style: { numFmt: "@" } },
    { header: "Student name", key: "name", width: 28 },
    { header: "Grade level", key: "grade_level", width: 16, style: { numFmt: "@" } },
    { header: "Section", key: "section", width: 14, style: { numFmt: "@" } },
    { header: "Enrollment date", key: "enrollment_date", width: 16, style: { numFmt: "@" } },
  ]
  ws.getRow(1).font = { bold: true }
  ws.addRow({ student_number: "2026-0001", name: "Dela Cruz, Juan", grade_level: "Grade 7", section: "A", enrollment_date: "" })
  const help = wb.addWorksheet("Instructions")
  help.columns = [{ width: 110 }]
  for (const line of [
    `Enrolls existing students in ${yearName} (the academic year selected on the Enrollments page). One student per row; keep the headings in row 1 and delete the example row.`,
    "Student number: must match a student already in your school (add or import students first). Student name is optional and only for your reference.",
    "Grade level: its name or code as on the Grade levels page (e.g. Grade 7 or G7). Section: optional, its name or code, and it must belong to that grade level and year.",
    "Enrollment date: optional (YYYY-MM-DD or M/D/YYYY); blank = today.",
    "Students already enrolled in the year, full sections and other problems are listed before importing and can be skipped.",
    `At most ${IMPORT_MAX_ROWS} rows and 2 MB per file. CSV files (UTF-8) with the same headings also work.`,
  ]) help.addRow([line])
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

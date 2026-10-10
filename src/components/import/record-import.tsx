"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Download, FileSpreadsheet, Loader2 } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button, LinkButton } from "@/components/ui/button"
import { Table, Td, Th } from "@/components/ui/misc"

type Row = { row: number; values: Record<string, string>; errors: string[] }
type Preview = { rows: Row[]; valid: number; invalid: number; ignoredColumns: string[] }

const SHOWN = 300
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** Upload an Excel/CSV file, review every row, then import the valid ones (students or teachers). */
export function RecordImport({
  entity,
  numberKey,
  numberLabel,
  numberRequired,
  autoNumbers,
  nextNumber,
  extraColumns,
  formFields,
  templateHref,
  intro,
}: {
  entity: "students" | "teachers" | "enrollments"
  /** Extra fields sent with the file (e.g. the academic year). */
  formFields?: Record<string, string>
  templateHref?: string
  /** Replaces the default step 1 text. */
  intro?: React.ReactNode
  numberKey: string
  numberLabel: string
  /** Without automatic numbering, is the number required? */
  numberRequired: boolean
  autoNumbers: boolean
  nextNumber?: string
  /** Extra columns shown in the review table: [value key, heading]. */
  extraColumns: [string, string][]
}) {
  const noun = entity.slice(0, -1)
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null)
  const [busy, setBusy] = useState<"preview" | "import" | null>(null)
  const [onlyProblems, setOnlyProblems] = useState(false)

  async function send(mode: "preview" | "import") {
    if (!file) return
    setBusy(mode)
    setError(null)
    try {
      const body = new FormData()
      body.set("file", file)
      body.set("mode", mode)
      for (const [k, v] of Object.entries(formFields ?? {})) body.set(k, v)
      const res = await fetch(`/api/import/${entity}`, { method: "POST", body })
      const json = await res.json().catch(() => ({ error: "Something went wrong. Please try again." }))
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.")
        if (mode === "preview") setPreview(null)
        return
      }
      if (mode === "preview") {
        setPreview(json)
      } else {
        setDone(json)
        setPreview(null)
        setFile(null)
        router.refresh()
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setBusy(null)
    }
  }

  const rows = preview ? (onlyProblems ? preview.rows.filter((r) => r.errors.length) : preview.rows) : []
  const numberNote = autoNumbers ? (
    <>
      {" "}({numberLabel} is optional: blank ones get the next automatic number
      {nextNumber ? <>, starting at <span className="font-mono">{nextNumber}</span></> : null}).
    </>
  ) : numberRequired ? (
    <>
      {" "}and <strong>{numberLabel}</strong>.
    </>
  ) : (
    <> ({numberLabel} is optional).</>
  )

  return (
    <div className="space-y-6">
      <div className="space-y-3 text-sm">
        {intro ?? (
          <p>
            1. Download the template, fill in one {noun} per row, and save it. Required: <strong>First name</strong>, <strong>Last name</strong>
            {numberNote}
          </p>
        )}
        <LinkButton href={templateHref ?? `/api/import/${entity}/template`} variant="secondary" size="sm">
          <Download className="size-4" aria-hidden /> Download Excel template
        </LinkButton>
        <p>2. Choose your file (.xlsx or .csv, up to 1,000 {entity}) and check it. Nothing is saved until you press Import.</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            aria-label={`${noun} file`}
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setPreview(null)
              setDone(null)
              setError(null)
            }}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5"
          />
          <Button onClick={() => send("preview")} disabled={!file || busy !== null}>
            {busy === "preview" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="size-4" aria-hidden />} Check file
          </Button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {done && (
        <Alert tone="success">
          Imported {plural(done.imported, noun)}
          {done.skipped ? `; ${plural(done.skipped, "row")} skipped because of problems` : ""}.{" "}
          <Link href={`/${entity}`} className="font-medium underline">
            View {entity}
          </Link>
        </Alert>
      )}

      {preview && (
        <div className="space-y-3">
          <Alert tone={preview.invalid ? "warning" : "success"}>
            {preview.valid} of {plural(preview.rows.length, "row")} ready to import.
            {preview.invalid
              ? ` ${plural(preview.invalid, "row")} with problems will be skipped. Fix them in the file and check again, or import the others now.`
              : ""}
            {preview.ignoredColumns.length ? ` Ignored columns: ${preview.ignoredColumns.join(", ")}.` : ""}
          </Alert>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Show only rows with problems
            </label>
            <Button onClick={() => send("import")} disabled={preview.valid === 0 || busy !== null}>
              {busy === "import" && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Import {plural(preview.valid, noun)}
            </Button>
          </div>
          <Table label="Rows in the file">
            <thead>
              <tr>
                <Th>Row</Th>
                <Th>{numberLabel}</Th>
                <Th>Name</Th>
                {extraColumns.map(([key, heading]) => (
                  <Th key={key}>{heading}</Th>
                ))}
                <Th>Problems</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, SHOWN).map((r) => (
                <tr key={r.row} className={r.errors.length ? "bg-red-50" : undefined}>
                  <Td className="tabular-nums text-muted">{r.row}</Td>
                  <Td className="font-mono text-xs">{r.values[numberKey] || <span className="text-muted">{autoNumbers ? "automatic" : "—"}</span>}</Td>
                  <Td>{[r.values.last_name, [r.values.first_name, r.values.middle_name, r.values.suffix].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</Td>
                  {extraColumns.map(([key]) => (
                    <Td key={key} className={key === "gender" ? "capitalize" : undefined}>
                      {r.values[key]}
                    </Td>
                  ))}
                  <Td className="text-red-700">{r.errors.join("; ") || <span className="text-green-700">OK</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length > SHOWN && <p className="text-sm text-muted">Showing the first {SHOWN} of {rows.length} rows.</p>}
        </div>
      )}
    </div>
  )
}

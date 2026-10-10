"use client"

import { useState } from "react"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { CheckboxField, Field, Form, SubmitButton } from "@/components/ui/form"
import { updateNumberingSettings } from "@/lib/actions/settings"
import { NUMBER_FORMAT_HELP, formatRecordNumber, numberFormatProblem } from "@/lib/record-number"
import type { SchoolSettings } from "@/types/domain"

function Block({ kind, label, settings, year }: { kind: "student" | "employee"; label: string; settings: SchoolSettings; year: number }) {
  const [format, setFormat] = useState(settings[`${kind}_number_format`])
  const [next, setNext] = useState(String(settings[`${kind}_number_next`]))
  const n = Number(next)
  const problem = numberFormatProblem(format.trim())
  const preview = !problem && Number.isInteger(n) && n >= 1 ? formatRecordNumber(format.trim(), n, year) : null

  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <CheckboxField name={`${kind}_number_auto`} label={`Generate ${label.toLowerCase()} automatically`} defaultChecked={settings[`${kind}_number_auto`]} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field name={`${kind}_number_format`} label="Format" required maxLength={40} defaultValue={format} onChange={(e) => setFormat((e.target as HTMLInputElement).value)} hint={NUMBER_FORMAT_HELP} />
        <Field name={`${kind}_number_next`} label="Next counter value" type="number" min={1} max={99999999} required defaultValue={next} onChange={(e) => setNext((e.target as HTMLInputElement).value)} />
      </div>
      <p className="text-sm text-muted">
        Next number: {preview ? <span className="font-mono font-medium text-foreground">{preview}</span> : <span className="text-red-700">{problem ?? "Enter a counter value of 1 or more."}</span>}
      </p>
    </fieldset>
  )
}

/** Automatic student and employee numbers (assigned by the database when the number is left blank). */
export function NumberingSettingsForm({ settings, year }: { settings: SchoolSettings; year: number }) {
  return (
    <Card>
      <CardHeader
        title="Student and employee numbers"
        description="When automatic numbering is on, leave the number blank when adding a student or teacher and the next one is assigned. Numbers you type yourself are kept, and numbers already in use are skipped."
      />
      <CardBody>
        <Form action={updateNumberingSettings}>
          <div className="space-y-4">
            <Block kind="student" label="Student numbers" settings={settings} year={year} />
            <Block kind="employee" label="Employee numbers" settings={settings} year={year} />
          </div>
          <div className="flex justify-end">
            <SubmitButton>Save numbering</SubmitButton>
          </div>
        </Form>
      </CardBody>
    </Card>
  )
}

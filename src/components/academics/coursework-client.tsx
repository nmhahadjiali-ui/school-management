"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Loader2, Paperclip } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { FileUpload } from "@/components/academics/file-upload"
import { setCourseworkAttachment, submitWork } from "@/lib/actions/operations"

/** Teacher: attach/replace/remove the assignment's file (uploaded straight to Storage). */
export function CourseworkAttachment({ id, folder, current }: { id: string; folder: string; current: { path: string; name: string } | null }) {
  const router = useRouter()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const record = (path: string | null, name: string | null) =>
    startTransition(async () => {
      setError(null)
      const r = await setCourseworkAttachment(id, path, name)
      if (r.ok) {
        toast?.(r.message ?? "Saved.")
        router.refresh()
      } else setError(r.error)
    })
  return (
    <div className="flex flex-wrap items-center gap-3">
      <FileUpload folder={folder} label={current ? "Replace file" : "Attach a file"} onUploaded={(f) => record(f.path, f.name)} />
      {current && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => record(null, null)}>
          Remove attachment
        </Button>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  )
}

/** Student: write an answer and/or attach a file, then submit (resubmit until reviewed). */
export function SubmissionForm({
  assignmentId,
  folder,
  existing,
  locked,
}: {
  assignmentId: string
  /** "<school>/submissions/<assignment>/<student>" */
  folder: string
  existing: { content: string | null; file_path: string | null; file_name: string | null } | null
  locked: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [content, setContent] = useState(existing?.content ?? "")
  const [file, setFile] = useState<{ path: string; name: string } | null>(existing?.file_path ? { path: existing.file_path, name: existing.file_name ?? "file" } : null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (locked) return <Alert tone="info">Your teacher has reviewed this submission, so it can no longer be changed.</Alert>

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="answer">Your answer</label>
      <textarea id="answer" rows={6} maxLength={20000} value={content} onChange={(e) => setContent(e.target.value)} className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm" />
      <div className="flex flex-wrap items-center gap-3">
        <FileUpload folder={folder} label={file ? "Replace file" : "Attach a file"} onUploaded={(f) => setFile(f)} />
        {file && (
          <span className="inline-flex items-center gap-1 text-sm text-muted">
            <Paperclip className="size-4" aria-hidden /> {file.name}
            <button type="button" className="ml-1 text-brand hover:underline" onClick={() => setFile(null)}>remove</button>
          </span>
        )}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Button
        disabled={pending || (!content.trim() && !file)}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const r = await submitWork(assignmentId, { content: content || null, file_path: file?.path ?? null, file_name: file?.name ?? null })
            if (r.ok) {
              toast?.(r.message ?? "Submitted.")
              router.refresh()
            } else setError(r.error)
          })
        }
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {existing ? "Resubmit" : "Submit"}
      </Button>
    </div>
  )
}

"use client"

import { useRef, useState } from "react"
import { Loader2, Paperclip } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const MAX_BYTES = 10 * 1024 * 1024

/**
 * Uploads a file straight from the browser to Supabase Storage with the
 * user's own session (no server round trip, no size limits of serverless
 * functions). Storage RLS decides whether `folder` is writable; the caller
 * then records the returned path with a Server Action.
 */
export function FileUpload({
  folder,
  label = "Attach a file",
  onUploaded,
}: {
  /** e.g. "<school_id>/assignments/<assignment_id>" — no trailing slash. */
  folder: string
  label?: string
  onUploaded: (file: { path: string; name: string }) => void | Promise<void>
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setError(null)
    if (file.size > MAX_BYTES) return setError("Files can be at most 10 MB.")
    setBusy(true)
    try {
      const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120)
      const path = `${folder}/${crypto.randomUUID()}-${safeName}`
      const { error } = await createClient().storage.from("academic-files").upload(path, file, { contentType: file.type || undefined })
      if (error) {
        setError(/mime|type/i.test(error.message) ? "This file type is not allowed. Use PDF, Office documents, images or text." : "The file could not be uploaded. Please try again.")
        return
      }
      await onUploaded({ path, name: file.name })
    } catch {
      setError("The file could not be uploaded. Check your connection and try again.")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="space-y-1">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-slate-50">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
        {busy ? "Uploading…" : label}
        <input
          ref={input}
          type="file"
          className="sr-only"
          disabled={busy}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
          }}
        />
      </label>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  )
}

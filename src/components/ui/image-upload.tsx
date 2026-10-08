"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ImagePlus, Loader2, Trash2 } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import type { ActionResult } from "@/lib/action-result"
import { createClient } from "@/lib/supabase/client"
import { IMAGE_TYPES, imageProblem, MAX_IMAGE_LABEL } from "@/lib/images"
import { cn } from "@/lib/utils"

/**
 * Picture picker: choose a file from the computer → checked here (type, 1.5 MB)
 * → uploaded straight to Storage with the user's own session (Storage RLS and
 * the bucket's own limits decide) → `onSave(path)` records it on the record.
 */
export function ImageUpload({
  bucket,
  folder,
  currentSrc,
  onSave,
  label,
  shape = "square",
  fallback,
}: {
  bucket: "school-logos" | "photos"
  /** Storage folder, no trailing slash, e.g. "<school_id>/students/<student_id>". */
  folder: string
  currentSrc: string | null
  onSave: (path: string | null) => Promise<ActionResult>
  label: string
  shape?: "square" | "circle"
  /** Shown when there is no picture (e.g. initials). */
  fallback?: React.ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, start] = useTransition()
  const working = busy || pending
  const src = preview ?? currentSrc

  async function choose(file: File) {
    setError(null)
    const problem = imageProblem(file)
    if (problem) return setError(problem)
    setBusy(true)
    setPreview(URL.createObjectURL(file))
    try {
      const path = `${folder}/${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`
      const { error: upErr } = await createClient().storage.from(bucket).upload(path, file, { contentType: file.type })
      if (upErr) {
        setPreview(null)
        setError(/size|large/i.test(upErr.message) ? `The maximum is ${MAX_IMAGE_LABEL}.` : /mime|type/i.test(upErr.message) ? "Use a JPG, PNG or WebP picture." : "The picture could not be uploaded. Please try again.")
        return
      }
      start(async () => {
        const r = await onSave(path)
        if (!r.ok) {
          setPreview(null)
          setError(r.error)
        } else {
          if (r.message) toast?.(r.message)
          router.refresh()
        }
      })
    } catch {
      setPreview(null)
      setError("The picture could not be uploaded. Check your connection and try again.")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  function remove() {
    setError(null)
    start(async () => {
      const r = await onSave(null)
      if (!r.ok) return setError(r.error)
      setPreview(null)
      if (r.message) toast?.(r.message)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-4">
      <div className={cn("relative flex size-20 shrink-0 items-center justify-center overflow-hidden border border-border bg-slate-50 text-muted", shape === "circle" ? "rounded-full" : "rounded-lg")}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed / blob URLs
          <img src={src} alt="" className={cn("size-full", shape === "circle" ? "object-cover" : "object-contain")} />
        ) : (
          fallback ?? <ImagePlus className="size-6" aria-hidden />
        )}
        {working && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-slate-50", working && "pointer-events-none opacity-60")}>
            <ImagePlus className="size-4" aria-hidden />
            {src ? `Change ${label}` : `Upload ${label}`}
            <input
              ref={input}
              type="file"
              className="sr-only"
              accept="image/png,image/jpeg,image/webp"
              disabled={working}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void choose(f)
              }}
            />
          </label>
          {currentSrc && (
            <button type="button" onClick={remove} disabled={working} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60">
              <Trash2 className="size-4" aria-hidden /> Remove
            </button>
          )}
        </div>
        <p className="text-xs text-muted">JPG, PNG or WebP, up to {MAX_IMAGE_LABEL}.</p>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </div>
  )
}

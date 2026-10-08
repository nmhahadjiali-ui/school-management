"use client"

import { useEffect } from "react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

/** Catches unexpected errors (including network failures) without leaking details. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error])
  const offline = typeof navigator !== "undefined" && !navigator.onLine

  return (
    <div className="mx-auto max-w-lg space-y-4 py-16">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <Alert tone="error">
        {offline
          ? "You appear to be offline. Check your internet connection and try again."
          : "We could not complete that request. Please try again. If the problem continues, contact your administrator."}
      </Alert>
      {error.digest && <p className="text-xs text-muted">Reference: {error.digest}</p>}
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}

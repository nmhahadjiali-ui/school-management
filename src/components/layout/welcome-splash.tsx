"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { GraduationCap } from "lucide-react"

const SHOW_MS = 1500

/** Brief welcome after signing in: the school's logo (or the default) and name, then `next`. */
export function WelcomeSplash({ name, logoUrl, firstName, next }: { name: string; logoUrl: string | null; firstName: string; next: string }) {
  const router = useRouter()
  const [logoFailed, setLogoFailed] = useState(false)

  useEffect(() => {
    router.prefetch(next)
    const timer = setTimeout(() => router.replace(next), SHOW_MS)
    return () => clearTimeout(timer)
  }, [router, next])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center" aria-live="polite">
      {logoUrl && !logoFailed ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary school-provided URL
        <img src={logoUrl} alt={`${name} logo`} onError={() => setLogoFailed(true)} className="size-32 object-contain motion-safe:animate-[fadein_400ms_ease-out]" />
      ) : (
        <span className="flex size-32 items-center justify-center rounded-2xl bg-brand text-white motion-safe:animate-[fadein_400ms_ease-out]">
          <GraduationCap className="size-16" aria-hidden />
        </span>
      )}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        {firstName && <p className="text-sm text-muted">Welcome, {firstName}</p>}
      </div>
      <span className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
      <span className="sr-only">Loading your dashboard…</span>
    </main>
  )
}

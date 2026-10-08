import { GraduationCap } from "lucide-react"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-lg bg-brand text-white">
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <p className="text-sm font-medium text-muted">School Management Platform</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">{children}</div>
      </div>
    </main>
  )
}

import { AlertCircle, CheckCircle2, Info } from "lucide-react"
import { cn } from "@/lib/utils"

type Tone = "info" | "success" | "error" | "warning"

const tones: Record<Tone, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  success: "border-green-200 bg-green-50 text-green-900",
  error: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
}
const icons = { info: Info, success: CheckCircle2, error: AlertCircle, warning: AlertCircle }

export function Alert({ tone = "info", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  const Icon = icons[tone]
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm", tones[tone], className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  )
}

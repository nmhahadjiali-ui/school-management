import Link from "next/link"
import { cn } from "@/lib/utils"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md"

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 whitespace-nowrap"
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:brightness-110 shadow-sm",
  secondary: "border border-border bg-surface text-foreground hover:bg-slate-50 shadow-sm",
  ghost: "text-foreground hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
}
const sizes: Record<Size, string> = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm" }

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className)
}

type ButtonProps = React.ComponentProps<"button"> & { variant?: Variant; size?: Size }

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />
}

type LinkButtonProps = React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }

export function LinkButton({ variant, size, className, ...props }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />
}

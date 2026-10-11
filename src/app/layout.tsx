import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "School Management", template: "%s · School Management" },
  description: "Multi-school management platform",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extensions (password managers, translators, "webcrx" bridges...) add
    // attributes to <html>/<body> before React loads. Ignore those two tags only;
    // mismatches anywhere inside the page are still reported.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}

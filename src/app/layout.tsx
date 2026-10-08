import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "School Management", template: "%s · School Management" },
  description: "Multi-school management platform",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

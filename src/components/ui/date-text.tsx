"use client"

import { createContext, useContext } from "react"
import { displayDate, type DateFormat } from "@/lib/dates"

const DateFormatContext = createContext<{ format: DateFormat; timeZone?: string }>({ format: "medium" })

/** Provides the school's date format and time zone to every <DateText> below it. */
export function DateFormatProvider({ format, timeZone, children }: { format?: DateFormat | null; timeZone?: string | null; children: React.ReactNode }) {
  return <DateFormatContext.Provider value={{ format: format ?? "medium", timeZone: timeZone ?? undefined }}>{children}</DateFormatContext.Provider>
}

/** The school's date format and time zone, for client code that needs a string. */
export const useDateFormat = () => useContext(DateFormatContext)

/** A date or timestamp in the school's date format ("—" when empty). `time` adds the time of day. */
export function DateText({ value, time = false, empty = "—" }: { value: string | null | undefined; time?: boolean; empty?: string }) {
  const { format, timeZone } = useContext(DateFormatContext)
  if (!value) return <>{empty}</>
  return <time dateTime={value}>{displayDate(value, format, timeZone, time)}</time>
}

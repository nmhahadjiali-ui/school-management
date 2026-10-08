// Map records to <select> options (shared by pages and filters).

type Opt = { value: string; label: string }

export const yearOptions = (years: { id: string; name: string; status: string; is_current: boolean }[]): Opt[] =>
  years.map((y) => ({ value: y.id, label: `${y.name}${y.is_current ? " (current)" : y.status === "archived" ? " (archived)" : ""}` }))

export const gradeOptions = (grades: { id: string; name: string }[]): Opt[] => grades.map((g) => ({ value: g.id, label: g.name }))

export const teacherOptions = (teachers: { id: string; first_name: string; last_name: string }[]): Opt[] =>
  teachers.map((t) => ({ value: t.id, label: `${t.last_name}, ${t.first_name}` }))

export const subjectOptions = (subjects: { id: string; name: string; code: string }[]): Opt[] =>
  subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))

export const sectionOptions = (sections: { id: string; name: string; grade_level: { name: string } | null }[]): Opt[] =>
  sections.map((s) => ({ value: s.id, label: `${s.grade_level?.name ?? ""} – ${s.name}` }))

export const personName = (p: { first_name: string; middle_name?: string | null; last_name: string; suffix?: string | null }) =>
  [p.first_name, p.middle_name, p.last_name, p.suffix].filter(Boolean).join(" ")

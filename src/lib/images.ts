// Picture uploads (school logos, profile photos, student photos).
// The same limits are enforced by the Storage buckets (migration 20261013000001);
// checking here too gives a clear message before anything is uploaded.

export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024 // 1.5 MB
export const MAX_IMAGE_LABEL = "1.5 MB"

/** No SVG: it can contain scripts. */
export const IMAGE_TYPES: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export function imageProblem(file: File): string | null {
  if (!IMAGE_TYPES[file.type]) return "Use a JPG, PNG or WebP picture."
  if (file.size > MAX_IMAGE_BYTES) return `The picture is ${(file.size / 1024 / 1024).toFixed(1)} MB. The maximum is ${MAX_IMAGE_LABEL}.`
  return null
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const FILE = `${UUID}\\.(png|jpg|webp)`
export const LOGO_PATH = (schoolId: string) => new RegExp(`^${schoolId}/${FILE}$`)
export const STUDENT_PHOTO_PATH = (schoolId: string, studentId: string) => new RegExp(`^${schoolId}/students/${studentId}/${FILE}$`)
export const USER_PHOTO_PATH = (folder: string, userId: string) => new RegExp(`^${folder}/users/${userId}/${FILE}$`)
/** Any photo path the /api/photos route may serve (access is still decided by Storage RLS). */
export const ANY_PHOTO_PATH = new RegExp(`^(platform|${UUID})/(students|users)/${UUID}/${FILE}$`)

/** Image URL for a private photo (served through /api/photos), or an external link. */
export function photoSrc(path: string | null | undefined, externalUrl?: string | null): string | null {
  if (path) return `/api/photos?path=${encodeURIComponent(path)}`
  return externalUrl || null
}

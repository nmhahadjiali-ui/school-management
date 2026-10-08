import Link from "next/link"
import type { Metadata } from "next"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { PageHeader, RoleBadge } from "@/components/ui/misc"
import { ProfileForms } from "@/components/profile/profile-forms"
import { getUserId, requirePermission } from "@/lib/auth/session"
import { ImageUpload } from "@/components/ui/image-upload"
import { setMyAvatar } from "@/lib/actions/images"
import { photoSrc } from "@/lib/images"

export const metadata: Metadata = { title: "Profile" }

export default async function ProfilePage() {
  const { profile, school, record } = await requirePermission("profile.self")
  const userId = (await getUserId())!
  const initials = `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase()
  const recordHref = record ? `/${record.type === "guardian" ? "guardians" : `${record.type}s`}/${record.id}` : null
  return (
    <>
      <PageHeader title="Profile" description="Your personal details and password." />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Profile photo" />
            <CardBody>
              <ImageUpload
                bucket="photos"
                folder={`${profile.school_id ?? "platform"}/users/${userId}`}
                currentSrc={photoSrc(profile.avatar_path, profile.avatar_url)}
                onSave={setMyAvatar}
                label="photo"
                shape="circle"
                fallback={<span className="text-xl font-semibold">{initials}</span>}
              />
            </CardBody>
          </Card>
          <ProfileForms profile={profile} />
        </div>
        <Card className="self-start">
          <CardHeader title="Account" />
          <CardBody>
            <dl className="grid grid-cols-[5rem_1fr] gap-y-3 text-sm">
              <dt className="text-muted">Email</dt>
              <dd className="break-all">{profile.email}</dd>
              <dt className="text-muted">Role</dt>
              <dd>
                <RoleBadge role={profile.role} />
              </dd>
              <dt className="text-muted">School</dt>
              <dd>{school?.name ?? "Platform"}</dd>
            </dl>
            <p className="mt-4 text-xs text-muted">Your role and school are managed by an administrator.</p>
            {recordHref && (
              <Link href={recordHref} className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
                View your school record
              </Link>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  )
}

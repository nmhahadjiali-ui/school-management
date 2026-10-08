"use client"

import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { CheckboxField, Form, SubmitButton } from "@/components/ui/form"
import { updateCommunicationSettings } from "@/lib/actions/communication"

type Settings = {
  notifications_enabled: boolean
  email_notifications_enabled: boolean
  sms_notifications_enabled: boolean
  push_notifications_enabled: boolean
  teachers_can_announce: boolean
}

/**
 * School-level communication choices. A channel needs BOTH the platform
 * feature (what the school has — e.g. the SMS add-on) and this switch (what
 * the school chooses to use). Provider credentials are never configured here.
 */
export function CommunicationSettingsForm({ settings, available }: { settings: Settings; available: { email: boolean; sms: boolean; push: boolean } }) {
  const unavailable = " — not included in your school's plan"
  return (
    <Card>
      <CardHeader title="Communication" description="Which channels your school uses for notifications." />
      <CardBody>
        <Form action={updateCommunicationSettings}>
          <div className="space-y-3">
            <CheckboxField name="notifications_enabled" label="Send notifications" hint="Master switch for all notifications (in-app and other channels)." defaultChecked={settings.notifications_enabled} />
            <CheckboxField name="email_notifications_enabled" label={`Email${available.email ? "" : unavailable}`} defaultChecked={settings.email_notifications_enabled && available.email} />
            <CheckboxField name="sms_notifications_enabled" label={`SMS${available.sms ? "" : unavailable}`} hint={available.sms ? "Messages are counted per month for usage reporting." : undefined} defaultChecked={settings.sms_notifications_enabled && available.sms} />
            <CheckboxField name="push_notifications_enabled" label={`Mobile push${available.push ? "" : unavailable}`} defaultChecked={settings.push_notifications_enabled && available.push} />
            <CheckboxField name="teachers_can_announce" label="Allow teachers to post announcements to their own sections and classes" defaultChecked={settings.teachers_can_announce} />
          </div>
          <p className="text-xs text-muted">Channels not included in your plan stay off even if ticked. Each person can further choose their channels in their notification preferences.</p>
          <div className="flex justify-end">
            <SubmitButton>Save communication settings</SubmitButton>
          </div>
        </Form>
      </CardBody>
    </Card>
  )
}

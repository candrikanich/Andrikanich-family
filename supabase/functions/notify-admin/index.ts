// supabase/functions/notify-admin/index.ts
// Triggered by Supabase Database Webhook on profiles INSERT
// Sends an admin notification email via Resend when a new user registers

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const ADMIN_EMAIL    = Deno.env.get('ADMIN_EMAIL') ?? ''

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: {
    id: string
    email: string
    first_name: string
    last_name: string
    status: string
    created_at: string
  }
}

serve(async (req) => {
  try {
    const payload: WebhookPayload = await req.json()

    // Only fire on INSERT into profiles with status=pending
    if (payload.type !== 'INSERT' || payload.table !== 'profiles') {
      return new Response('ignored', { status: 200 })
    }

    if (!RESEND_API_KEY || !ADMIN_EMAIL) {
      console.error('Missing RESEND_API_KEY or ADMIN_EMAIL environment variables')
      return new Response('misconfigured', { status: 500 })
    }

    const { first_name, last_name, email } = payload.record

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@andrikanichfamily.com',
        to: ADMIN_EMAIL,
        subject: `New registration: ${first_name} ${last_name}`,
        html: `
          <p>A new family member has registered and is awaiting approval:</p>
          <ul>
            <li><strong>Name:</strong> ${first_name} ${last_name}</li>
            <li><strong>Email:</strong> ${email}</li>
          </ul>
          <p><a href="https://andrikanichfamily.com/admin/approvals">Review pending approvals →</a></p>
        `,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error('Resend API error:', response.status, body)
      return new Response('email_failed', { status: 500 })
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response('error', { status: 500 })
  }
})

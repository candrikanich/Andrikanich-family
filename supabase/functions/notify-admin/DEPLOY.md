# Deploy: notify-admin Edge Function

## Prerequisites

- Supabase CLI: `npm install -g supabase`
- Resend API key (from resend.com)
- Supabase project created and linked

## Steps

### 1. Link your Supabase project

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

(Find YOUR_PROJECT_REF in Supabase Dashboard → Settings → General)

### 2. Set secrets

```bash
npx supabase secrets set RESEND_API_KEY=re_your_key_here
npx supabase secrets set ADMIN_EMAIL=your@email.com
npx supabase secrets set WEBHOOK_SECRET=a-long-random-secret-string
```

### 3. Deploy

```bash
npx supabase functions deploy notify-admin
```

### 4. Create Database Webhook (in Supabase Dashboard)

1. Database → Webhooks → Create Webhook
2. Name: `on-profile-insert`
3. Table: `profiles`
4. Events: check `INSERT`
5. HTTP Request: POST
6. URL: `https://[project-ref].supabase.co/functions/v1/notify-admin`
7. HTTP Headers:
   - `Authorization: Bearer [your supabase service role key]`
     (Find service role key in Settings → API → service_role)
   - `x-webhook-secret: [your WEBHOOK_SECRET value]`
8. Save

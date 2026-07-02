# LightCrm

LightCrm is a lightweight, table-first CRM MVP built with Next.js, TypeScript, Prisma, PostgreSQL, Zod, and a core command layer that future orchestrators can call through APIs instead of writing directly to the database.

## MVP Scope

- Clients
- Leads
- Cold targets
- Outreach touches
- Reminders
- Calendar events
- Table preferences
- Audit log

## Development

```powershell
pnpm install
pnpm test
pnpm build
pnpm dev
```

## Local PostgreSQL

```powershell
docker compose up -d postgres
$env:DATABASE_URL="postgresql://lightcrm:lightcrm@localhost:54329/lightcrm?schema=public"
pnpm --filter @lightcrm/db prisma db push --schema prisma/schema.prisma
pnpm --filter @lightcrm/db seed
pnpm --filter @lightcrm/web exec next dev --hostname 0.0.0.0 --port 4900
```

## Google Login

LightCRM web access is limited to these Gmail accounts:

- `gubernatorova.juliya@gmail.com`
- `ekaterina.reyzbikh@gmail.com`
- `olegp306@gmail.com`

Configure Google OAuth with these environment variables:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
LIGHTCRM_SESSION_SECRET=...
LIGHTCRM_INTERNAL_API_TOKEN=...
```

For local testing, add the callback URL that matches the port where the web app is running. For the current Codex test server on port `3004`, use:

```text
http://localhost:3004/api/auth/google/callback
```

If you run the README dev command above on port `4900`, also add:

```text
http://localhost:4900/api/auth/google/callback
```

For a test or production deployment, add the matching HTTPS callback:

```text
https://<your-domain>/api/auth/google/callback
```

Set the same `LIGHTCRM_INTERNAL_API_TOKEN` for the web app and Telegram bot so server-to-server CRM API calls keep working while browser users must sign in with Google.

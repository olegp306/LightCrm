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

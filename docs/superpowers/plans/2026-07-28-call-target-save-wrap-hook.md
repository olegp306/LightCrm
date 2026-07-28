# Call Target Save Wrap Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Call Target desktop editing reliable, make long Call Target fields wrap like Leads, and add a primary multiline `Hook` field.

**Architecture:** The fix follows the existing CRM layers: core types/service, Prisma schema/repository, web API validation, table configuration, and the shared `CrmTable` renderer/editor. The save bug is solved by ensuring Call Targets use the same payload shape the shared table component already sends, instead of asking the component to special-case one entity. Multiline display is configured declaratively through column metadata already supported by the grid.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Prisma schema/client, shared `@lightcrm/core` service, `@glideapps/glide-data-grid`, Vitest, `tsc`.

## Global Constraints

- Do not touch unrelated existing dirty changes in the original checkout.
- Work in `/tmp/lightcrm-call-targets-worktree` on branch `codex/call-targets-hook-save`.
- Preserve existing Call Target create/update endpoint path `/api/crm/cold-targets/upsert`.
- `Hook` must be a primary Call Target field, text, multiline in table/details/create UI.
- Long Call Target fields must wrap in desktop table cells using the same existing `wrapText` / `longText` behavior used elsewhere.
- Inline table editing and details drawer editing must persist for Call Targets.
- Add focused tests for payload persistence and wrapping metadata where practical; run typechecks for touched packages.

---

### Task 1: Fix Call Target Save Payload Compatibility

**Files:**
- Modify: `apps/web/app/api/crm/cold-targets/upsert/route.ts`
- Test: `apps/web/app/api/crm/cold-targets/upsert/route.test.ts`

**Interfaces:**
- Consumes: `CrmTable.persistInlinePatch` sends `{ workspaceId, coldTargetId, patch, source }` when `updateRecordIdField="coldTargetId"` is configured.
- Produces: `/api/crm/cold-targets/upsert` accepts both direct create/update payloads and patch update payloads.

- [ ] **Step 1: Add route tests for direct upsert and patch upsert**

Create `apps/web/app/api/crm/cold-targets/upsert/route.test.ts` with tests that mock `getCrm().upsertColdTarget`.

Test direct payload:
```ts
await POST(new Request("http://test.local/api/crm/cold-targets/upsert", {
  method: "POST",
  body: JSON.stringify({
    workspaceId: "default",
    id: "cold-1",
    name: "Maya Ops",
    email: "maya@example.com"
  })
}));
expect(upsertColdTarget).toHaveBeenCalledWith(expect.objectContaining({
  workspaceId: "default",
  id: "cold-1",
  name: "Maya Ops",
  email: "maya@example.com"
}));
```

Test patch payload:
```ts
await POST(new Request("http://test.local/api/crm/cold-targets/upsert", {
  method: "POST",
  body: JSON.stringify({
    workspaceId: "default",
    coldTargetId: "cold-1",
    patch: { email: "new@example.com", role: "Head of Growth" },
    source: { channel: "web-table" }
  })
}));
expect(upsertColdTarget).toHaveBeenCalledWith(expect.objectContaining({
  workspaceId: "default",
  id: "cold-1",
  email: "new@example.com",
  role: "Head of Growth"
}));
```

- [ ] **Step 2: Run test to verify current patch path fails**

Run: `pnpm --filter @lightcrm/web exec vitest run app/api/crm/cold-targets/upsert/route.test.ts`

Expected before implementation: patch payload rejects because `name` is missing or `coldTargetId`/`patch` is not accepted.

- [ ] **Step 3: Implement schema union**

In `apps/web/app/api/crm/cold-targets/upsert/route.ts`, keep direct create/update payload support and add patch payload support:

```ts
const ColdTargetPatch = z.object({
  code: optionalText,
  name: z.string().trim().min(1).optional(),
  company: optionalText,
  role: optionalText,
  email: optionalText,
  phone: optionalText,
  linkedinUrl: optionalText,
  website: optionalText,
  status: z.enum(["new", "queued", "contacted", "replied", "notFit", "archived"]).optional(),
  source: optionalText,
  notesResearch: optionalText,
  archivedLetters: optionalText,
  notes: optionalText,
  preferredLanguage: z.preprocess(
    (value) => (value === "" || value === "auto" ? null : value),
    z.enum(["de", "ru", "en"]).nullable().optional()
  )
}).strict();
```

For patch input:
1. Load existing target with `crm.listRecords({ entity: "coldTarget", workspaceId, includeArchived: true })`.
2. Find by `coldTargetId`; return `404` JSON `{ error: "Cold target not found" }` if missing.
3. Call `crm.upsertColdTarget({ ...existing, ...patch, workspaceId, id: existing.id, name: patch.name ?? existing.name })`.

- [ ] **Step 4: Run route test**

Run: `pnpm --filter @lightcrm/web exec vitest run app/api/crm/cold-targets/upsert/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Run web typecheck**

Run: `pnpm --filter @lightcrm/web typecheck`

Expected: PASS.

### Task 2: Add Primary Multiline Hook Field Across Data Layers

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/commands.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/prisma-repository.ts`
- Modify: `packages/db/src/seed.ts`
- Modify: `apps/web/app/api/crm/cold-targets/upsert/route.ts`
- Test: `packages/core/src/commands.test.ts`
- Test: `packages/db/src/client.test.ts` or existing DB typecheck if no suitable runtime DB test exists

**Interfaces:**
- Consumes: Call Target API and repository upsert payloads.
- Produces: `ColdTarget["hook"]`, `UpsertColdTargetInput["hook"]`, Prisma `ColdTarget.hook`, API field `hook`.

- [ ] **Step 1: Add failing core test**

In `packages/core/src/commands.test.ts`, add:
```ts
it("persists a cold target hook", async () => {
  const repository = new MemoryCrmRepository();
  const crm = createCrmService(repository);

  const target = await crm.upsertColdTarget({
    workspaceId: "workspace-1",
    name: "Hook Target",
    hook: "Mention their new Munich residential project."
  });

  expect(target.hook).toBe("Mention their new Munich residential project.");
});
```

- [ ] **Step 2: Run core test to verify failure**

Run: `pnpm --filter @lightcrm/core test`

Expected before implementation: TypeScript or assertion fails because `hook` is unknown/missing.

- [ ] **Step 3: Add hook to core types and service**

In `packages/core/src/types.ts`, add:
```ts
hook: string | null;
```
to `ColdTarget`, and:
```ts
hook?: string | null;
```
to `UpsertColdTargetInput`.

In `packages/core/src/commands.ts`, set:
```ts
hook: nullable(input.hook ?? existing?.hook),
```
inside the `ColdTarget` record.

- [ ] **Step 4: Add hook to Prisma and repository mapping**

In `packages/db/prisma/schema.prisma`, add:
```prisma
hook String?
```
to model `ColdTarget`.

In `packages/db/src/prisma-repository.ts`, no custom transform is needed if spreading Prisma record into `ColdTarget`; ensure typecheck passes after schema addition.

- [ ] **Step 5: Add hook to seed and API schema**

In `packages/db/src/seed.ts`, include:
```ts
hook: "Reference Bright Supply's new logistics hub before pitching architecture support.",
```
for the seed cold target.

In `apps/web/app/api/crm/cold-targets/upsert/route.ts`, add `hook: optionalText` to both direct and patch validation shapes.

- [ ] **Step 6: Run tests/typechecks**

Run:
```bash
pnpm --filter @lightcrm/core test
pnpm --filter @lightcrm/db typecheck
pnpm --filter @lightcrm/web typecheck
```

Expected: PASS.

### Task 3: Configure Call Target UI for Wrapping, Hook, and Save Flow

**Files:**
- Modify: `apps/web/app/sample-data.ts`
- Modify: `apps/web/app/cold-targets/page.tsx`
- Modify: `packages/ui/src/table-model.test.ts`
- Verify: `packages/ui/src/CrmTable.tsx`

**Interfaces:**
- Consumes: `CrmTableColumn.valueKind = "longText"` and/or `wrapText = true`, `updateRecordEndpoint`, `updateRecordIdField`.
- Produces: Call Target table columns with wrapping; details drawer and inline table edits use `/api/crm/cold-targets/upsert` patch path; `Hook` is visible as a primary field.

- [ ] **Step 1: Add table metadata test for wrapping**

In `packages/ui/src/table-model.test.ts`, extend the wrapping test or add a new one:
```ts
expect(shouldWrapTableColumn({ id: "hook", title: "Hook", valueKind: "longText" })).toBe(true);
expect(shouldWrapTableColumn({ id: "role", title: "Role", wrapText: true })).toBe(true);
```

If `shouldWrapTableColumn` currently ignores `valueKind: "longText"`, update it to return true for longText.

- [ ] **Step 2: Configure Call Target page update identifiers**

In `apps/web/app/cold-targets/page.tsx`, pass:
```tsx
updateRecordEndpoint="/api/crm/cold-targets/upsert"
updateRecordIdField="coldTargetId"
```
to `TablePage`.

- [ ] **Step 3: Add Hook and wrapping metadata to Call Target columns**

In `apps/web/app/sample-data.ts`, for `coldTargets.columns`:
1. Add `{ id: "hook", title: "Hook", width: 300, mobilePriority: 3, valueKind: "longText" }` near `role` / `company`.
2. Change `role` to include `wrapText: true`.
3. Change `notesResearch` to `{ id: "notesResearch", title: "Node Research", width: 360, valueKind: "longText" }`.
4. Change `archivedLetters` to `{ id: "archivedLetters", title: "I Have Letters", width: 320, valueKind: "longText" }`.

- [ ] **Step 4: Add Hook to create fields and sample rows**

In `coldTargets.createRecord.fields`, add:
```ts
{ id: "hook", label: "Hook", multiline: true },
```
after `role`.

In sample rows, add `hook` values for both rows.

- [ ] **Step 5: Verify details drawer save uses patch path**

Confirm `saveDetailsPanelChanges` sends `updateRecordEndpoint` with `updateRecordIdPayload(row.id)` and changed fields. With Step 2 and Task 1, no additional `CrmTable` change should be needed unless tests/manual verification reveal a mismatch.

- [ ] **Step 6: Run tests/typechecks**

Run:
```bash
pnpm --filter @lightcrm/ui test
pnpm --filter @lightcrm/ui typecheck
pnpm --filter @lightcrm/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Browser verification**

Run local web with mock API or available local DB. Verify:
1. Desktop Call Target table shows multiline wrapped `Role`, `Hook`, `Node Research`, and `I Have Letters`.
2. Editing `email` inline sends `{ coldTargetId, patch: { email } }` and succeeds.
3. Editing `hook` inline sends `{ coldTargetId, patch: { hook } }` and succeeds.
4. Editing `hook` in details drawer and pressing Save sends patch and updates row state.


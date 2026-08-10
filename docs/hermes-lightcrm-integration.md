# Hermes <> LightCRM Integration

This document is a working prompt and guardrail spec for connecting Hermes to LightCRM.

## Recommended Architecture

Hermes should not control the LightCRM browser UI directly. It should use a small connector with a whitelist of CRM API calls.

Production base URL:

```text
https://lightcrm.204-168-163-99.sslip.io
```

Test base URL:

```text
https://lightcrm-test.204-168-163-99.sslip.io
```

Authentication:

```http
Authorization: Bearer ${LIGHTCRM_INTERNAL_API_TOKEN}
```

Required Hermes connector environment:

```text
LIGHTCRM_API_BASE=https://lightcrm.204-168-163-99.sslip.io
LIGHTCRM_INTERNAL_API_TOKEN=...
LIGHTCRM_WORKSPACE_ID=default
LIGHTCRM_ACTOR=hermes
```

The token must stay in Hermes secrets or environment variables. It must never be pasted into prompts, chat history, social posts, CRM notes, or logs.

## Safety Model

Use three permission levels.

### Green: allowed without confirmation

- Search leads.
- Search all CRM records.
- Read leads, clients, cold targets, reminders, and calendar events.
- Summarize found records.
- Propose changes as a preview.

### Yellow: require explicit human confirmation

- Create a lead.
- Update a lead.
- Update client contact fields through a lead update.
- Create or update a reminder.
- Create or update a calendar event.
- Create or update a cold target.
- Write into `todo`, `description`, `interest`, `urgency`, `budgetEur`, or `offerFields`.

Confirmation format should include:

```text
Confirm: update lead <lead code or id> with <short summary of exact fields>.
```

### Red: blocked unless a separate admin workflow exists

- Archive, delete, or restore records.
- Bulk updates.
- Backup import/export.
- Sending emails.
- Sending Telegram messages.
- Generating or sending commercial offers.
- Changing CRM settings, Google auth settings, signatures, templates, fee tables, or environment variables.
- Any operation where Hermes is unsure which lead/client/cold target is meant.

## Current CRM API Surface

Use only these endpoints for the first Hermes integration.

### Search Leads

```http
POST /api/crm/leads/search
Content-Type: application/json
Authorization: Bearer ...
```

Input:

```json
{
  "workspaceId": "default",
  "query": "Maxim KP project",
  "limit": 5
}
```

Output:

```json
{
  "matches": [
    {
      "id": "lead-id",
      "code": "L-0001",
      "name": "Lead name",
      "status": "new",
      "clientName": "Client name",
      "project": "Project",
      "area": "120",
      "description": "Short description",
      "interest": "High",
      "urgency": "Soon",
      "todo": "Next action",
      "address": "Address",
      "messenger": "+49...",
      "score": 1,
      "updatedAt": "2026-07-11T10:00:00.000Z"
    }
  ]
}
```

### Global Search

```http
GET /api/crm/search?workspaceId=default&query=...
Authorization: Bearer ...
```

Use this when the user may be referring to a client, cold target, reminder, or lead.

### List Leads

```http
GET /api/crm/leads?workspaceId=default&includeArchived=false
Authorization: Bearer ...
```

### Create Or Upsert Lead

```http
POST /api/crm/leads/upsert
Content-Type: application/json
Authorization: Bearer ...
```

Input:

```json
{
  "workspaceId": "default",
  "clientId": null,
  "name": "Client or lead name",
  "email": null,
  "phone": null,
  "whatsapp": null,
  "company": "Project name",
  "status": "new",
  "sourceChannel": "hermes",
  "externalThreadId": "hermes-thread-id",
  "externalMessageId": "hermes-message-id",
  "notes": "Project: ...\n\nArea: ...\n\nDescription: ...\n\nTodo: ..."
}
```

Allowed `status` values:

```text
new, contacted, qualified, lost, converted, archived
```

Hermes should normally create new leads with `status: "new"` unless the operator explicitly says otherwise.

### Update Lead

```http
POST /api/crm/leads/update
Content-Type: application/json
Authorization: Bearer ...
```

Input:

```json
{
  "workspaceId": "default",
  "leadId": "lead-id",
  "patch": {
    "todo": "Call Maxim on Tuesday and discuss the revised offer.",
    "urgency": "Tuesday",
    "ballSide": "us",
    "sourceChannel": "hermes"
  },
  "source": {
    "channel": "hermes",
    "messageId": "hermes-message-id"
  }
}
```

Allowed patch fields:

```text
clientId
name
email
phone
whatsapp
company
status
notes
client.name
client.phone
client.email
projectName
project
area
description
interest
urgency
todo
ballSide
address
messenger
sourceChannel
clientProjects
budgetEur
offerFields
rawInput
```

`ballSide` must be one of:

```text
us, client
```

Hermes should prefer patching structured fields instead of rewriting the whole `notes` value.

### Create Or Update Reminder

```http
POST /api/crm/reminders/upsert
Content-Type: application/json
Authorization: Bearer ...
```

Input:

```json
{
  "workspaceId": "default",
  "leadId": "lead-id",
  "title": "Follow up with Maxim",
  "description": "Discuss revised offer after Tuesday call.",
  "dueAt": "2026-07-14T09:00:00.000Z",
  "status": "open",
  "sourceChannel": "hermes"
}
```

Allowed `status` values:

```text
open, done, snoozed, archived
```

## Hermes Tool Contract

The Hermes connector should expose these high-level tools instead of raw HTTP.

### `lightcrm_search_leads`

Input:

```json
{
  "query": "string, required",
  "limit": "number, optional, 1..20"
}
```

Output:

```json
{
  "matches": [
    {
      "leadId": "string",
      "code": "string | null",
      "name": "string",
      "clientName": "string | null",
      "status": "string",
      "project": "string | null",
      "todo": "string | null",
      "score": "number"
    }
  ]
}
```

### `lightcrm_get_lead`

Input:

```json
{
  "leadId": "string, required"
}
```

Output: one normalized lead object from `/api/crm/leads`.

### `lightcrm_prepare_lead_update`

This is a dry-run tool. It validates a patch and returns a human-readable preview. It must not write to CRM.

Input:

```json
{
  "leadId": "string, required",
  "patch": {
    "todo": "string | null",
    "urgency": "string | null",
    "interest": "string | null",
    "description": "string | null",
    "status": "new | contacted | qualified | lost | converted | archived | null",
    "budgetEur": "string | null",
    "ballSide": "us | client | null"
  },
  "reason": "string, required"
}
```

Output:

```json
{
  "requiresConfirmation": true,
  "confirmationText": "Confirm: update lead L-0001 with todo and urgency.",
  "resolvedLead": {
    "leadId": "lead-id",
    "code": "L-0001",
    "name": "Lead name"
  },
  "patch": {}
}
```

### `lightcrm_commit_lead_update`

This tool writes to CRM. It can only be called after exact confirmation from the operator.

Input:

```json
{
  "leadId": "string, required",
  "patch": "object, required",
  "confirmedBy": "string, required",
  "confirmationText": "string, required",
  "sourceMessageId": "string, optional"
}
```

Output:

```json
{
  "ok": true,
  "leadId": "lead-id",
  "updatedFields": ["todo", "urgency"],
  "updatedAt": "2026-07-11T10:00:00.000Z"
}
```

### `lightcrm_prepare_lead_create`

This is a dry-run tool. It searches for duplicates before proposing a new lead.

Input:

```json
{
  "name": "string, required",
  "clientName": "string, optional",
  "project": "string, optional",
  "description": "string, optional",
  "todo": "string, optional",
  "email": "string, optional",
  "phone": "string, optional",
  "messenger": "string, optional",
  "sourceText": "string, required"
}
```

Output:

```json
{
  "requiresConfirmation": true,
  "duplicateCandidates": [],
  "confirmationText": "Confirm: create lead for Client / Project.",
  "draft": {}
}
```

### `lightcrm_commit_lead_create`

Writes one lead after explicit confirmation.

Input:

```json
{
  "draft": "object, required",
  "confirmedBy": "string, required",
  "confirmationText": "string, required",
  "sourceMessageId": "string, optional"
}
```

Output:

```json
{
  "ok": true,
  "leadId": "lead-id",
  "code": "L-0001"
}
```

## System Prompt For Hermes

Paste the following into Hermes as the LightCRM operating prompt.

```text
You are Hermes, an operator assistant connected to LightCRM through restricted tools.

Your purpose is to help the operator create, find, understand, and safely update CRM records. LightCRM stores leads, clients, cold targets, reminders, calendar events, commercial-offer data, and outreach drafts. Your highest-priority tasks are lead search, lead creation, lead updates, and maintaining the current next action in each lead's Todo field.

Use LightCRM tools only through the provided connector. Never use browser automation, terminal access, raw database access, backups, import/export, or settings endpoints for CRM operations unless the operator explicitly starts a separate admin workflow.

Authentication secrets are invisible to you. Never ask for, print, store, infer, or expose LIGHTCRM_INTERNAL_API_TOKEN or any Google/Gmail credential.

Default workspaceId is "default".

Entities:
- Lead: an active sales/project opportunity. Important fields are id, code, name, clientName, status, project, area, description, interest, urgency, todo, address, messenger, budgetEur, ballSide, summaryShort, summaryLong, updatedAt.
- Client: a person or company connected to one or more leads.
- Cold target: a prospect for outreach. Do not send email or change outreach drafts unless the operator explicitly asks and the connector exposes a safe draft tool.
- Reminder: a dated follow-up task connected to a lead, client, or cold target.

Safe behavior:
1. For search/read/summarize requests, act directly.
2. For create/update/reminder requests, first prepare a preview and ask for explicit confirmation.
3. Never archive, delete, restore, bulk update, send emails, send Telegram messages, generate commercial offers, change settings, or import backups unless an admin workflow explicitly allows it.
4. If search returns multiple plausible records, ask the operator to choose. Do not guess.
5. If the operator gives ambiguous data, ask one short clarification question.
6. If the operator asks to update a lead, patch only the fields they explicitly changed. Prefer structured fields like todo, urgency, interest, status, budgetEur, ballSide, address, area, description, project over rewriting notes.
7. Preserve existing CRM data. Do not overwrite a non-empty field with an empty value.
8. Never invent names, dates, prices, addresses, contacts, or commitments. Mark uncertainty in the preview.
9. For reminders, normalize dates to ISO datetime with timezone when possible. If the date is unclear, ask a clarification question.
10. Treat "today" relative to the current configured date/time of Hermes.

Lead search workflow:
1. Call lightcrm_search_leads with the user's query.
2. If exactly one high-confidence match exists, summarize it and continue.
3. If several matches exist, show code, name, clientName, project, todo, and score; ask which one to use.
4. If no match exists and the operator asked to create a lead, prepare a create preview.

Lead creation workflow:
1. Extract the client/lead name, project, description, contact details, source text, and next action.
2. Search for duplicates by name, client, phone/email/messenger, and project.
3. If duplicate candidates exist, ask whether to update an existing lead or create a new one.
4. Prepare a create preview. Default status is "new", sourceChannel is "hermes".
5. Commit only after explicit confirmation.

Lead update workflow:
1. Resolve exactly one lead id.
2. Build a minimal patch.
3. Prepare an update preview.
4. Commit only after explicit confirmation.
5. After commit, report the updated fields and the resulting Todo/status.

Todo field rules:
- Todo is the operator's short memory of what happened and what happens next.
- Keep it useful and human-readable.
- When updating from a call or voice transcript, write the concrete next step first, then relevant context.
- Do not put long raw transcripts into Todo. Summarize them.

Confirmation examples:
- "Confirm: update lead L-0042 with Todo: call Maxim Tuesday about revised KP."
- "Confirm: create lead for Ivan Petrov / EFH Neubau with phone +49..."
- "Confirm: create reminder for lead L-0042 on 2026-07-14 09:00."

Response style:
- Be concise and operational.
- When showing search results, use compact bullets.
- When asking for confirmation, include exactly what will be changed.
- When a write succeeds, state what was updated and provide the lead code/id.
```

## Connector Implementation Guardrails

These controls should be implemented in code, not only in the prompt.

1. Endpoint whitelist:
   - Allow: `/api/crm/leads/search`, `/api/crm/search`, `/api/crm/leads`, `/api/crm/leads/upsert`, `/api/crm/leads/update`, `/api/crm/reminders/upsert`.
   - Block by default: archive, backup, Google auth, settings, outreach send, Telegram send, offer generation.

2. Method whitelist:
   - `GET` only for list/search endpoints.
   - `POST` only for approved create/update endpoints.

3. Confirmation gate:
   - Writes require a stored preview id.
   - Commit payload must match the stored preview exactly.
   - Confirmation text must contain the lead code or id and the changed field names.

4. Duplicate protection:
   - Before lead creation, search by name, project, email, phone, and messenger.
   - If any candidate score is high or contact data matches, require a user choice.

5. Field whitelist:
   - Reject unknown patch fields.
   - Reject empty-string overwrites for existing non-empty fields unless explicitly confirmed.

6. Rate limits:
   - Read: reasonable burst, for example 60 requests/minute.
   - Write: low burst, for example 10 requests/minute.
   - Bulk write endpoint should not exist in the first version.

7. Audit log:
   - Log actor, Hermes conversation id, source message id, endpoint, record id, changed fields, before/after hash, and timestamp.
   - Do not log secrets.

8. Dry-run first:
   - Every write-capable high-level tool should have a prepare step and a commit step.
   - The prepare step validates schema and resolves records but does not call write endpoints.

9. Fail closed:
   - If auth is missing, schema validation fails, multiple records match, or the connector sees an unapproved endpoint, return a refusal/error instead of guessing.

10. Test mode first:
   - Point Hermes to `https://lightcrm-test.204-168-163-99.sslip.io` for initial testing.
   - Promote to production only after create/update/search are verified on test data.

## Minimal First Milestone

Implement only:

1. `lightcrm_search_leads`
2. `lightcrm_get_lead`
3. `lightcrm_prepare_lead_update`
4. `lightcrm_commit_lead_update`
5. `lightcrm_prepare_lead_create`
6. `lightcrm_commit_lead_create`

Do not add archive, backup restore, email send, or offer generation to Hermes in the first milestone.


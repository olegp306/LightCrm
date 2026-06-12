# Telegram Semantic Intake, Reply Bundles, and Offer Recovery Plan

## Goal

Make Telegram intake behave like a real CRM operator:

- understand forwarded documents, screenshots, PDFs, audio, and captions by meaning, not by keyword triggers;
- when a user replies to an earlier Telegram message, include the replied-to message text, caption, attachments, and extracted attachment content in the same CRM decision;
- create or update one lead from a related message bundle instead of creating separate draft leads per attachment;
- always attach the original files to the resulting lead;
- surface commercial-offer problems as precise, actionable CRM messages instead of generic server errors;
- verify the result through real Telegram test cases against the test bot and test database.

## Current Failure Summary

1. Attachment-only forwarded content can return `Reason: no executable CRM action` because the orchestrator receives attachment metadata, but not the extracted semantic content from the actual image/PDF/document.
2. A reply like `это новый лид` only affects the current Telegram text. The bot currently does not load the attachments from the replied-to Telegram message into the new lead creation flow.
3. Lead creation uploads and links only attachments from the current message, so a reply to an earlier image/PDF can create a lead without the original file.
4. Multiple related attachments can be treated as separate intakes/leads instead of one intake bundle.
5. Offer generation can fail with a generic server error, which is not useful for CRM work.

## Concrete Telegram Reproduction From 2026-06-12

Transcript fragment:

```text
05:50 Bot: Intent: no_action
Reason: No actionable request or instruction found in the message; no CRM action needed.

07:06 User: запрос от клиента
07:06 Bot: reviewing the files, back shortly
07:06 Bot: Intent: attach_document
Action: request_review
Target: lead_d5bdaadb-d992-4ac3-a8ff-4a2fce0d8940
Project type: запрос от клиента
Reason: No executable CRM action is mapped for semantic intent attach_document.

07:07 User: Это новый лид
07:07 Bot: created L-2026-006 with files: no attachments

07:09 User: sent an attachment
07:09 Bot: saved 1 attachment to L-2026-006

07:10 User: Это не attachment это новый лид
07:11 Bot: updated L-2026-006 with files: no attachments

07:11 User: Новый лид
07:11 Bot: created L-2026-007 with files: no attachments

07:12 Bot: generating offer, back shortly
07:12 Bot: server error, developer notified
```

What this proves:

1. The first message is semantically rich enough to inspect, but it is classified as `no_action`.
2. The phrase `запрос от клиента` is treated as `attach_document` instead of a lead-intake signal.
3. The bot has an active/nearby lead target and attaches later files to that target, but does not properly merge the earlier message/reply bundle into the lead decision.
4. `Это новый лид` creates a lead from the instruction text itself instead of from the replied-to payload.
5. Follow-up correction text can create or update the wrong lead because the conversation has no explicit intake bundle/session state.
6. Offer generation has an async path, but the final failure is generic and does not explain whether the missing piece is numbers, template, fee table, lead fields, or storage.

This transcript is now the main end-to-end regression scenario for the implementation.

## Design Principle

The Telegram message is not the unit of business meaning. The unit is an intake bundle:

- current Telegram message text and caption;
- current message attachments;
- replied-to message text and caption;
- replied-to message attachments;
- forwarded-source content and user/director instruction;
- media-group siblings;
- extracted semantic summaries from every attachment.

LangGraph should reason over this bundle first, then decide whether to create a lead, update a lead, attach files, schedule reminders, or ask for review.

## Implementation Phases

### Phase 1 - Regression Tests for Telegram Reply Bundles

Files:

- `C:\repos\LightCrm\packages\telegram-bot\src\bot.test.ts`
- `C:\repos\LightCrm\packages\telegram-bot\src\bot-core.ts`

Add tests for these cases:

1. Reply `это новый лид` to an earlier photo/document message.
   - Expected: exactly one lead action.
   - Expected: the lead receives the replied-to attachment.
   - Expected: orchestration text includes replied-to caption/text and attachment summary.

2. Forwarded screenshot/email from Anastasia Kurten with a later reply `это новый лид`.
   - Expected: lead facts include customer/person evidence from replied content.
   - Expected: project/title evidence is derived from the attachment summary.
   - Expected: original image remains linked to the lead.

3. Multi-file intake with one text instruction.
   - Expected: one lead or one update, not one lead per file.
   - Expected: all files appear in one intake result.
   - Expected: only one user-facing completion response after the initial `reviewing the files, back shortly`.

Commands:

```powershell
pnpm --filter @lightcrm/telegram-bot test
```

Expected result before implementation:

- New tests fail because reply attachments and attachment semantic content are not included.

### Phase 2 - Build a Telegram Intake Bundle

Files:

- `C:\repos\LightCrm\packages\telegram-bot\src\bot-core.ts`
- `C:\repos\LightCrm\packages\telegram-bot\src\media-groups.ts`
- `C:\repos\LightCrm\packages\telegram-bot\src\bot.ts`

Changes:

1. Extend `TelegramReplyMessage` to carry safe copies of:
   - `document`
   - `photo`
   - `voice`
   - `audio`
   - `groupedAttachments`
   - `media_group_id`
   - `forward_origin` / forwarded metadata if available from Telegram payload

2. Add a helper, for example:

```ts
collectTelegramIntakeBundle(message: TelegramMessage): TelegramIntakeBundle
```

The bundle should return:

- `currentText`
- `currentCaption`
- `replyText`
- `replyCaption`
- `currentAttachments`
- `replyAttachments`
- `allAttachments`
- `directorInstruction`
- `sourceNotes`
- `replyLeadId` if the reply points to a lead card

3. Use this bundle everywhere the bot currently uses only the current message:
   - orchestration input;
   - active lead detection;
   - lead creation;
   - lead update;
   - attachment upload/linking;
   - Telegram response construction.

Expected behavior:

- If the current message has no attachment but the replied-to message has an attachment, the attachment is still uploaded and linked.
- If the reply target is an existing lead card, the bundle updates that lead.
- If the reply target is a raw attachment message and current text says this is a new lead, the bundle creates a new lead from the replied content.

### Phase 3 - Attachment Semantic Extraction

Files:

- `C:\repos\LightCrm\packages\telegram-bot\src\attachment-analysis.ts`
- `C:\repos\LightCrm\packages\telegram-bot\src\bot.ts`
- `C:\repos\LightCrm\packages\telegram-bot\src\bot-core.ts`
- `C:\repos\LightCrm\apps\web\app\api\crm\lead-intake\upload\route.ts`

Add an extraction layer that runs before final orchestration where possible.

Minimum supported extraction:

1. Images and screenshots:
   - use the configured OpenAI model for vision extraction when `OPENAI_API_KEY` is present;
   - extract customer names, project names, location, dimensions/area, request text, due dates, contacts, and language-specific evidence.

2. PDFs:
   - first try text extraction if the PDF contains text;
   - if text extraction is unavailable or empty, create a compact file summary from metadata and mark it as needing review;
   - later extension can render PDF pages and run vision extraction.

3. Documents:
   - extract text from `.docx` where the local runtime supports it;
   - otherwise store a safe summary placeholder and keep the original file.

4. Audio/voice:
   - keep the file attached in this phase;
   - add transcription as the next explicit enhancement if no existing transcription code is present.

Data passed into LangGraph:

```text
Attachment 1:
type: image
filename: ...
short summary: ...
extracted facts:
- customer: ...
- project: ...
- location: ...
- request: ...
evidence: ...
```

Expected behavior:

- The screenshot/email case can become a lead without requiring the user to restate the content.
- The first forwarded development-concept document is not treated as inert `attachment_document` if it contains lead/project evidence.

### Phase 4 - LangGraph Semantic Decision Tuning

Files:

- `C:\repos\LightCrm\packages\orchestrator\src\semantic-graph.ts`
- `C:\repos\LightCrm\packages\orchestrator\src\settings.ts`
- `C:\repos\LightCrm\packages\orchestrator\src\*.test.ts`
- `C:\repos\LightCrm\apps\web\app\settings\*`

Changes:

1. Add a setting-backed instruction that attachment content can be the primary business message.
2. Add a setting-backed instruction for reply semantics:
   - current message may be a director/head instruction;
   - replied-to message may contain the business payload;
   - the final action must combine both.
3. Add examples in settings for:
   - forwarded WhatsApp/email screenshot plus comment;
   - `это новый лид` reply to an attachment;
   - update existing lead by replying to a lead card;
   - multiple files plus one caption;
   - lead creation plus reminder in the same message.
4. Ensure no new hard-coded Russian regex decision logic is introduced. Russian examples may live in settings/examples, not in branching code.

Expected behavior:

- The graph reasons from extracted facts and user instruction together.
- `no executable CRM action` is reserved for truly unrelated material, not for documents with obvious lead evidence.

### Phase 5 - One Bundle, One Lead, All Attachments

Files:

- `C:\repos\LightCrm\packages\telegram-bot\src\bot-core.ts`
- `C:\repos\LightCrm\packages\telegram-bot\src\bot.ts`
- `C:\repos\LightCrm\apps\web\app\api\crm\lead-intake\upload\route.ts`

Changes:

1. The lead creation/update function receives `bundle.allAttachments`.
2. Attachment summaries generated in Phase 3 are saved with the files.
3. If the bot already sent `reviewing the files, back shortly`, send one final result for the bundle.
4. If an async/background failure happens, send:

```text
server error, developer notified
```

5. Lead creation responses must include:
   - compact lead card;
   - `CRM` button;
   - `Undo` button.

Expected behavior:

- A text + PDF + audio + image test produces one draft/lead with three attachments.
- A reply to previous attachment produces one lead with the previous attachment.

### Phase 6 - Commercial Offer Server Error Recovery

Files:

- `C:\repos\LightCrm\apps\web\app\api\crm\leads\generate-offer\route.ts`
- `C:\repos\LightCrm\apps\web\app\api\crm\leads\commercial-offers.ts`
- `C:\repos\LightCrm\apps\web\app\api\crm\leads\commercial-offers.test.ts`
- `C:\repos\LightCrm\packages\telegram-bot\src\bot-core.ts`

Tests:

1. Missing commercial-offer numbers.
   - Expected: no 500.
   - Expected: clear not-ready reason listing missing fields.

2. Missing template.
   - Expected: no 500.
   - Expected: `offer is not ready: commercial offer template is missing`.

3. Missing fee table.
   - Expected: no 500.
   - Expected: `offer is not ready: fee table is missing`.

4. Ready offer.
   - Expected: document generated or existing generation path returns success.

Commands:

```powershell
pnpm --filter @lightcrm/web test
pnpm --filter @lightcrm/telegram-bot test
```

Expected behavior:

- Telegram never shows a generic offer server error for known not-ready states.
- The user can see exactly what is missing before the offer can be generated.

### Phase 7 - Real Telegram Verification

Environment:

- Test bot: `@LightCrmrobot`
- Test database only.
- Use the local or test deployment URL configured in `NEXT_PUBLIC_APP_URL`.

Manual scenarios:

1. Forward the development-concept image/document with rich project info.
   - Expected: bot reads content, extracts project evidence, creates or previews a lead depending on confidence.
   - Expected: original file is attached.

2. Reply `это новый лид` to that forwarded attachment.
   - Expected: one lead.
   - Expected: the replied-to attachment is linked.
   - Expected: extracted facts are visible in lead summary/context.

3. Send the Anastasia Kurten email screenshot.
   - Expected: customer evidence: Anastasia Kurten.
   - Expected: project evidence: house/project in Munich.
   - Expected: screenshot attached.

4. Send multiple attachments with one text instruction.
   - Expected: immediate `reviewing the files, back shortly`.
   - Expected: one final response.
   - Expected: one lead/update with all attachments.

5. Reply to a lead card with a new instruction and attachment.
   - Expected: existing lead updated, no duplicate lead.

6. Ask to generate an offer.
   - Expected: generated offer or precise not-ready reason.
   - Expected: no generic server error.

Verification commands:

```powershell
pnpm lint
pnpm test
pnpm --filter @lightcrm/telegram-bot test
pnpm --filter @lightcrm/web test
```

Browser verification:

- Open `http://localhost:4900/leads`.
- Confirm created leads have correct attachments.
- Confirm attachment summaries are visible in the lead document/card views.
- Confirm CRM button from Telegram opens the lead page.

## Completion Criteria

The implementation is complete only when:

- automated Telegram bundle tests pass;
- automated offer error tests pass;
- real Telegram test cases create/update the expected lead count;
- attachments from replied-to messages are linked to the created/updated lead;
- image/PDF semantic extraction contributes to lead fields or summary;
- generic offer server errors are replaced with actionable CRM reasons;
- no hard-coded phrase/regex decision parser is added for Russian lead creation logic.

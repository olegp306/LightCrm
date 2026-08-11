# Unified Manual Ping Design

**Goal:** Give Leads, Cold Targets, and Clients one manual outreach action and one protocol shape while keeping each entity's history isolated.

## Design

Manual Ping creates one `OutreachTouch` linked to exactly one entity (`leadId`, `coldTargetId`, or `clientId`). The record stores the selected channel (`email`, `linkedin`, `phone`, `telegram`, or `whatsapp`), the current timestamp, outbound direction, and the authenticated actor. No user can choose a different actor in the UI.

The table Ping cell and details card both open the same compact channel picker. Selecting a channel saves immediately, refreshes the row's derived Ping, and appends the entry to the entity's protocol. The protocol displays channel, actor, and date/time in the same compact format for all supported entities.

The latest Ping is derived from the newest outreach touch linked to that exact entity. Histories are never shared across Leads, Cold Targets, or Clients, even when records have the same name or channel.

## Error Handling

The API rejects missing entities, invalid channels, and requests that try to link one touch to more than one entity. UI errors remain in the table/card notice area and do not clear unsaved form state.

## Verification

- API tests cover all supported channels, actor capture, entity isolation, and invalid input.
- UI tests cover the channel list and protocol formatting helpers.
- Manual verification covers picker behavior from table and card on Leads and Cold Targets, plus the Client protocol endpoint, reload persistence, and independent histories.

# Outreach Campaigns Plan

## V1 - launchable campaign

- Store outreach campaign templates in CRM runtime settings.
- Show campaign cards in Settings with a short summary, touch timeline, and editable metaprompt.
- Open a Call Target Details card and start one campaign from that card.
- Create one nearest planned reminder for the first touch, linked to the Call Target.

## V2 - visible cadence planning

- Keep `Start campaign` focused on the nearest actionable touch.
- Add `Draft full cadence` as an explicit operator action.
- When used, create the full cadence as reminders:
  - Touch 1 is `planned`.
  - Future touches are `draft`.
- Avoid creating duplicate reminders for the same Call Target, campaign, touch title, and due date.
- Show the resulting reminders in the Call Target calendar/history section.

## Final Direction

- Add outcome handling: interested, later, existing architect, remove me, silent after 8 touches.
- Advance the campaign after an operator marks a touch as sent.
- Generate the next draft using the campaign metaprompt and target `Node Research`.
- Convert interested replies into Clients and Leads.
- Keep all outreach actions visible in Today and linked back to Call Target history.

Implemented final-layer workflow:

- `Mark touch sent` records an outbound touch, marks the current reminder `done`, and promotes the next touch to `planned`.
- `Stop with outcome` stops the assignment and stores the selected outcome.
- `interested` additionally creates a warm Client and a new Lead from the Call Target using the normal CRM code generation flow.
- Repeating `interested` is idempotent: the endpoint looks for an existing outreach Lead linked to the Call Target id/code before creating anything new.

## Calendar Strategy

Do not create all events automatically on ordinary campaign start. It makes the calendar noisy and assumes the whole sequence will happen even if the target replies early.

The safer workflow is:

- `Start campaign`: create only the nearest planned action.
- `Draft full cadence`: optionally create all touchpoints as draft reminders when the operator wants to inspect the full plan.
- Later, status transitions should promote the next draft to planned only after the previous touch is completed or the operator confirms continuation.

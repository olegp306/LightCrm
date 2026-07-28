# Three-Line Table Text Design

## Goal

Long wrapped table cells should stay readable without making the grid too tall: show up to three lines in the cell, then expose the full text on hover.

## Scope

Apply this behavior universally to columns that already opt into wrapped text:

- columns with `wrapText: true`
- columns with `valueKind: "longText"`
- existing wrapped address cells

## Behavior

- A wrapped cell may render one, two, or three visible text lines.
- Row height may grow to fit three lines, but must not grow beyond that.
- If the text does not fit in three lines, keep the existing small `more` badge in the cell.
- Hovering a truncated wrapped cell shows a compact floating tooltip with the full text.
- Clicking and inline editing behavior must remain unchanged.
- Non-wrapped columns keep the existing single-line behavior.

## Visual Rules

- The tooltip should be readable, high-contrast, and constrained so it does not overflow the table frame.
- Preserve original whitespace enough for notes, but normalize excessive blank lines.
- Do not introduce a new dependency.

## Verification

- Unit tests cover line wrapping and row-height caps.
- Visual verification must cover desktop Call Targets with long `Role` and `Hook` values.
- Browser smoke should confirm the tooltip appears on hover and contains the full text.

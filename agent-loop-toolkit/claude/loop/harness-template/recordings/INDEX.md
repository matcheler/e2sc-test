# Recording library (read this before asking a human for a recording)

Screens or flows already recorded or discovered in this project. If an approved case needs one of these,
reuse the navigation and locators (wrapped in `loginAsSuper` / `startWorkflow` / `getRcpFrame`, with unique
test data) and do NOT request a new recording. Request one only for a screen not listed here, or for a part
of a flow the notes say was not captured.

Each row: flow, box, where the locators and notes are, and what is known to be missing.

| Flow | Box / frame | Recording | Notes (locators, traps) | Not captured |
|---|---|---|---|---|

## Maintenance
When test-author reuses or adds a recording, it adds or updates a row here in the same run. Keep
`.loop/<TICKET>/discovery-*.md` notes referenced by path; if a ticket's `.loop` folder is archived, copy
the notes next to the recording.

# Always-human list

Changes in these areas are never made autonomously. ticket-intake returns NOT_READY for a ticket
that needs them, and reviewer BLOCKs any diff that touches them. A human does the work, or explicitly
approves it in a Jira comment that the intake brief quotes.

DRAFT - review and edit to match your team's rules.

- EDI / EDIFACT message mappings and anything that changes what is sent to external suppliers or customers.
- Shared `STATIC_*` / `DYNAMIC_*` map specs used by more than one flow or local market.
- Uniqueness keys and identity logic (for example PIT ID composition, AutoId definitions) - they affect existing data.
- Role definitions and role-to-view / role-to-action permissions (`role_info.txt`, `role_tgview_info.txt`).
- Deletion or migration of existing data, and changes to historical or point-in-time data.
- Security, authentication, SSO and credentials.
- Build, dependency and platform versions in `pom.xml` / `comp_dependencies`.
- Anything on a production or customer-facing environment (the loop only uses the dev servers).
- Populate, PCMM/AllBundles reloads, p2c and restarts on a shared dev server. The user runs or
  authorises each one; see `~/.claude/loop/servers.md`.
- Re-enabling config that an earlier ticket deliberately disabled (e.g. a commented-out
  `point_in_time_schema.txt` row). Check that ticket's history. If the change isn't needed for this
  ticket's criteria, split it into its own change.

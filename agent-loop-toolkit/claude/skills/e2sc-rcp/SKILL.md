---
name: e2sc-rcp
description: 'Configure RCP base Data Measures (DMs): point_in_time_schema, tgview_info, role_tgview_info, inventory workflow measure lists. Use for: "add a base DM", "update point_in_time_schema", "tgview_info", "role_tgview_info", adding persisted DMs, updating Workflow.properties ViewVariants, download filter synchronization.'
---

# E2open RCP Configuration

Handle base Data Measure (DM) configuration for E2SC workflows — persisted point-in-time measures exposed in MCV views.

## Reference Documentation

**Primary Source:** `.github/skills/e2sc-rcp/guide.md` — Read this first for base DM file locations, column layouts, index rules, reload steps, and Workflow synchronization requirements.

Always load `.github/skills/e2sc-rcp/guide.md` before starting.

## Behavior

- Reads the RCP guide first before making assumptions
- Finds the next free DM indices by scanning existing neighboring entries
- Updates every required file in one pass when adding a new base DM
- Keeps Workflow view definitions and download filters synchronized
- Preserves tab-delimited file structure in dataset files
- Asks only essential questions

## Workflow

### Step 1: Load Reference Guide (DO THIS FIRST)
Load `.github/skills/e2sc-rcp/guide.md`. This provides:
- `point_in_time_schema.txt` column definitions
- `tgview_info.txt` and `role_tgview_info.txt` patterns
- AllBundles.properties DM formatting conventions
- Workflow.properties ViewVariants rules
- Download filter synchronization requirements

### Step 2: Scan Existing Configuration
Inspect nearby existing DMs to determine:
- DM naming pattern and UI title pattern
- Next available DATAMEASUREINDEX values
- Which roles currently expose comparable DMs
- Which Workflow.properties entries must stay in sync
- Which workflow URLs or ViewVariants are the likely enablement targets

### Step 3: Ask ONLY Essential Questions
```
Ask 2-5 targeted questions maximum when missing:
✅ "What is the internal DM name and display title?"
✅ "What data type? (string, numeric, or double)"
✅ "Should autoId be true or false?"
✅ "Is this customer-side (ROLETYPE=3) or supplier-side (ROLETYPE=2)?"
✅ "Which role or roles should be granted access in role_tgview_info?"
✅ "Which workflow or variant should enable this DM?"

❌ DON'T ask: "Which files need updating?" — determine from guide and existing pattern
❌ DON'T ask: "Should I update Workflow.properties too?" — yes, when DM is exposed in a workflow
❌ DON'T ask: "Should I sync the download filter?" — yes, for inventory download workflows
```

### Step 4: Update All Required Files Together
For a new base DM, update the full required surface when applicable:
- `point_in_time_schema.txt`
- `tgview_info.txt`
- `role_tgview_info.txt`
- `AllBundles.properties`
- `Workflow.properties`

Only grant the DM to the specific roles the user requested in `role_tgview_info.txt`, unless the user explicitly asks to mirror all existing comparable roles. Do not stop after a single-file change if the DM is only partially configured.

### Step 5: Validate Before Finishing
- DM name matches exactly across all files
- DATAMEASUREINDEX values are unique and consistent
- Dataset files remain tab-separated
- Workflow ViewVariants include the DM where needed
- Related download filters include the same DM list when applicable

### Step 6: Reload Guidance
```bash
. /e2open/app/e2sc/server/bin/rcp_populate_broker_org_incr.sh
. /e2open/app/e2sc/server/bin/reload_allbundles.sh
. /e2open/app/e2sc/server/bin/reload_workflows.sh
```
Schema changes in `point_in_time_schema.txt` require a full E2SC restart.

---

## Source Files (Repo)

```
solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data.append/point_in_time_schema.txt
solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data.append/tgview_info.txt
solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/role_tgview_info.txt
solution/project/ssp-ext/E2/e2sc/gap-data/cfg.append/AllBundles.properties
solution/project/ssp-ext/E2/e2sc/gap-data/cfg.append/Workflow.properties
```

---

## Critical Constraints

- **Tabs, not spaces**: `.txt` dataset files are tab-delimited — must stay that way
- **Literal `$null`**: Optional columns must use `$null`, not blank values
- **Exact DM key reuse**: Internal DM name must match exactly across schema, tgview, role visibility, and workflow references
- **Index consistency**: `tgview_info.txt` and `role_tgview_info.txt` indices must stay unique and aligned with the surrounding pattern
- **Workflow sync**: If a DM is added to an inventory ViewVariants list, update the corresponding download filter `&dataMeasure=` list too
- **autoId behavior**: `true` enables direct generic-view editing; `false` limits edits to PIT detail view
- **Restart requirement**: Changes to `point_in_time_schema.txt` require a full E2SC restart

---

## Quick Reference: Common Requests

### "Add a new base DM"
1. Load the RCP guide
2. Scan neighboring DM entries and indices
3. Ask which roles should receive access (if not explicit)
4. Ask which workflow/variant should expose the DM (if not explicit)
5. Add the DM across schema, tgview, role visibility, labels/formatting, and requested workflow config
6. Sync any related download filter list
7. Validate and report reload steps

### "Expose this DM in the inventory view"
1. Confirm which workflow or named variant should be updated
2. Update the relevant `workflow.*.url` `ViewVariants`
3. Check for a matching inventory download filter in `Workflow.properties`
4. Add the DM to both places when they share the same measure set

### "Why is the DM visible but not downloadable?"
1. Check `Workflow.properties` for a missing download filter `&dataMeasure=` entry
2. Compare it with the visible `ViewVariants` list
3. Sync the lists and report the mismatch

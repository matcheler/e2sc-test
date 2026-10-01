---
name: e2sc-io
description: 'Add or fix IoDocTypeDef document type definitions for upload/download operations. Use for: "add download button", "add upload/download document type", "fix DownloadConfigurator error", "configure COLLAB_ATTRIBUTES download", "POINT_IN_TIME download", IoDocTypeDef XML changes, reload IoDocTypeDef.'
---

# E2open IoDocTypeDef Configuration

Handle `IoDocTypeDef*.xml` configuration — defining upload/download document types.

## Reference Documentation

**Primary Source:** `.github/skills/e2sc-io/guide.md` — Read this first before making any changes.

## Behavior

- Reads the guide first to understand the DocumentType structure and parameters
- Adds `<DocumentType>` at the bottom of `IoDocTypeDef_ext.xml`
- Runs the reload script and reports the result
- Asks only essential questions

## Workflow

### Step 1: Read the Guide
Always load `.github/skills/e2sc-io/guide.md` before starting.

### Step 2: Ask Only Essential Questions
```
✅ "What FILE_TYPE is needed?" (if not clear from context)
✅ "Is this an upload or download?" (if not specified)

❌ DON'T ask: "Should I reload?" — always reload after changes
```

### Step 3: Edit IoDocTypeDef_ext.xml
Add the new `<DocumentType>` block at the bottom, before `</DocumentTypes>`, with a JIRA comment.

**File path:**
```
solution/project/ssp-ext/E2/e2sc/gap-data/xml.replace/IoDocTypeDef_ext.xml
```

### Step 4: Reload
```bash
bash scripts/reload_iodoctypedef.sh IoDocTypeDef_ext.xml
```

Report success or parse the error log.

---

## Common Troubleshooting

| Symptom | Root Cause | Action |
|---------|-----------|--------|
| `Unexpected Exception null` in JSP | IoDocTypeDef XML not reloaded on server, or `DOWNLOAD_PSDSELECTOR` wrong | Run `reload_iodoctypedef.sh`, restart server |
| Download button not visible | `BulkIoButtons` missing from `Workflow.properties` selector | Add to correct `filter.*Selector.url` |
| Button visible but error on click | Missing PSD in `PAGE_SECTION_DEF_MAPPING` (DB) | Run data installer or insert `exe_psd_mapping` rows into DB |
| Role permission error | `role_info` not loaded | Run data installer or insert rows |

## Supporting Config Files Checklist

| # | File | Purpose |
|---|------|---------|
| 1 | `IoDocTypeDef_ext.xml` | DocumentType definition |
| 2 | `PCMM_PSD_*.xml` | PSD for download selector (if needed) |
| 3 | `IoDocTypeDef_ext.xml` | DOWNLOAD_PSDSELECTOR value |
| 4 | `role_info.txt` | Role permission rows for the doctype |
| 5 | `AllBundles.properties` | `core.web.io.DocumentType.<Name>.description` label |
| 6 | `Workflow.properties` | `&BulkIoButtons=Download[DocTypes=<Name>[<Queue>]]` in selector filter |

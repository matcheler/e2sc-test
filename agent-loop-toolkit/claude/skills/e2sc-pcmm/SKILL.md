---
name: e2sc-pcmm
description: 'Add or fix PCMM PSD PageSectionDefinition fields in PCMM XML files. Use for: "add a field to PSD", "fix PCMM PSD", "reload PCMM", adding collab list fields, fixing PSD validation errors, checking COLLAB_ATTR vs DIM_ATTR vs Collab ObjectName types, updating PCMM_PSD_*.xml files.'
---

# E2open PCMM Configuration

Handle all Plan Collaboration (PC) MetaModel XML configuration — primarily PSD (PageSectionDefinition) field changes in `PCMM_PSD_*.xml` files.

## Reference Documentation

**Primary Source:** `.github/skills/e2sc-pcmm/guide.md` — Read this first for all PCMM/PSD patterns, ObjectName rules, and reload procedures.

## Behavior

- Look up the correct `<ObjectName>` for any field by searching server XML
- Make all edits across every affected `<PageSectionDefinition>` block at once
- Validate the XML before reloading
- Run the reload script and report the result
- Ask only essential questions

## Workflow

### Step 1: Read the Guide
Always load `.github/skills/e2sc-pcmm/guide.md` before starting.

### Step 2: Look Up the Field Definition
Before adding any field, find the correct `<ObjectName>` and `widget`:
```bash
grep -n "YourFieldName" /e2open/app/e2sc/server/xml/PCMM_PageSectionDefinitions_ext.xml
```
If not found there, also check:
```bash
grep -rn "YourFieldName" /e2open/app/e2sc/server/xml/*.xml | head -20
```

### Step 3: Ask Only Essential Questions
```
✅ "Which PageSectionDefinition(s) should this field be added to?" (if not specified)
✅ "Should it appear in <Fields> (default view), <AvailableFields> (column picker), or both?"

❌ DON'T ask: "What ObjectName should I use?" — look it up from server XML
❌ DON'T ask: "Should I reload?" — always reload after changes
```

### Step 4: Make All Edits at Once
Use `multi_replace_string_in_file` to update all affected `<PageSectionDefinition>` blocks simultaneously.

### Step 5: Reload and Verify
```bash
bash scripts/reload_pcmm_script.sh <filename.xml>
```
Report success (`PCMetaModel successfully reloaded.`) or parse the error.

---

## ObjectName Quick Reference

| ObjectName | Example Fields | widget="AutoComplete"? |
|------------|---------------|----------------------|
| `Collab` | CustomerName, SupplierName, CustSiteName, SuppSiteName, CustItemName, SuppItemName | ✅ Yes |
| `COLLAB_ATTR` | ProjDefCollabAttribString*, GlobalSupplierId, CommodityCode, CurrencyCode, LeadTime | ❌ No |
| `DIM_ATTR` | CustomerDUNS, SiteType, CustSiteHierarchyLevel*, CustItemHierarchyLevel*, VehicleWhereUsedDIMList | ❌ No |
| `DataMeasure` | ConsumptionForecast, ConsumptionCommit, WeeklyDemand, DailyDemand | ❌ No |

**Critical rule:** `widget="AutoComplete"` is only valid on `<ObjectName>Collab</ObjectName>`.

---

## File Locations

| Purpose | Repo Path |
|---------|-----------|
| MTIM Item Forecast PSD | `solution/project/ssp-ext/E2/e2sc/gap-data/xml.replace/PCMM_PSD_mtimItemFcst_ext.xml` |
| General PSD | `solution/project/ssp-ext/E2/e2sc/gap-data/xml.replace/PCMM_PageSectionDefinitions_ext.xml` |
| Blue Bar MCV PSD | `solution/project/ssp-ext/E2/e2sc/gap-data/xml.replace/PCMM_PSD_mtimBlueBarMCV_ext.xml` |

---

## Common Validation Errors

### `core.server.psd.validationFailed`
1. Run: `grep -n "YourFieldName" /e2open/app/e2sc/server/xml/PCMM_PageSectionDefinitions_ext.xml`
2. Compare `<ObjectName>` and `widget` with what's in your file
3. Fix mismatches — the server is the source of truth for field types

### `core.server.xmlParseError`
Check for malformed XML: unclosed tags, wrong nesting, stray characters.

---

## Reload Script Reference

```bash
# Reload single PCMM XML file
bash scripts/reload_pcmm_script.sh PCMM_PSD_mtimItemFcst_ext.xml

# Reload all PCMM XML files
bash scripts/reload_pcmm_script.sh
```

Expected success output: `PCMetaModel successfully reloaded.`

---
name: e2sc-cfg
description: 'Generate and update CFG properties: AllBundles.properties labels, field formatting, validation messages, Workflow.properties. Use for: "add label in AllBundles", "update fieldFormat", "add validation message", state/action labels, field formatting rules, master data PSD context labels.'
---

# E2open CFG Configuration

Manage all configuration properties and labels in E2open SCPM — AllBundles.properties labels, field formatting, validation messages, and other CFG properties.

## Reference Documentation

**Primary Source:** `.github/skills/e2sc-cfg/guide.md` — Read this first for all CFG patterns, AllBundles.properties structures, field formatting, and label conventions.

Always load `.github/skills/e2sc-cfg/guide.md` before starting.

## Behavior

- Takes initiative to complete tasks fully
- Scans existing configuration files for patterns
- Generates ALL required property entries at once
- Asks only essential questions (2-3 max)
- Makes reasonable assumptions when appropriate
- Validates and writes configuration files immediately

## Workflow

### Step 1: Load Reference Guide (DO THIS FIRST)
Load `.github/skills/e2sc-cfg/guide.md`. This provides AllBundles.properties pattern structures, field labeling conventions, formatting rules, and label naming patterns.

### Step 2: Scan Existing Configuration
Scan AllBundles.properties for existing label patterns, naming conventions, prefixes/suffixes, and context-specific patterns (if PSD context labels).

### Step 3: Ask ONLY Essential Questions
```
Ask 2-3 targeted questions maximum:
✅ "What labels do you need?" (states, actions, fields, etc.)
✅ "Are these for OC, PC, or both?" (context)
✅ "Any specific formatting requirements?" (number/date formats)

❌ DON'T ask: "Should I create AllBundles.properties?" - YES, always
❌ DON'T ask: "What pattern should I use?" - You have the guide, decide
❌ DON'T ask: "Do you need validation messages?" - YES, always include
```

### Step 4: Generate ALL Configuration
Generate complete configuration: state labels, action labels, field labels, formatting rules, error/validation messages, master data labels, relationship labels, UI section headers. **Don't ask permission — JUST DO IT.**

### Step 5: Write Files Immediately
Update/create AllBundles.properties, update master data labels if needed, validate all entries follow patterns from guide. **Don't ask "Should I write these?" — Just write them.**

### Step 6: Summarize
Brief summary: number of entries added, configuration files updated, key patterns used, where to deploy.

---

## Configuration Patterns

### AllBundles.properties Label Pattern
```properties
# OCMetaModel field labels
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoHeader.FieldName=User Label

# State labels
exe.web.state.Order.DiscreteOrder.StateSystemName=State Label

# Action labels
exe.web.action.Order.DiscreteOrder.USER_ACTION_N=Action Label

# Relationship labels
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.Relationship.RelationshipName=Label
```

### Field Formatting Pattern
```properties
exe.web.fieldFormat.Order.PoHeader.PdfFloat14={_core.number.format.unitprice_}
exe.web.fieldFormat.Order.PoLineItem.Quantity={_core.number.format.float_}
exe.web.fieldFormat.Order.PoRequestSchedule.PdfDate50={_core.web.date.shortFormat_}
exe.web.fieldFormat.Order.PoHeader.PdfDate1={_core.web.date.longFormat_}
```

### Master Data Field Labels (PSD Context)
```properties
# Search context (more descriptive)
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31=GPDS Milestone Date

# List context (shorter for column headers)
pc.web.broker_domain.broker_org.default_cusu_group.CollabList.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31=Milestone Date

# Reference pattern (reuse labels across contexts)
pc.web.broker_domain.broker_org.default_cusu_group.CollabList.SomeContext.SomeObject.SomeField={_pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.SomeContext.SomeObject.SomeField_}
```

### Validation Error Messages
```properties
FIELD_NAME_REQUIRED=Field name is required before proceeding.
FIELD_NAME_FUTURE_DATE=Field name must be a future date.
FIELD_NAME_VALIDATION_FAILED=Field name validation failed - provide reason.
```

---

## Quick Reference: Common Labeling Tasks

### "Add labels for new state USER_STATE_25"
1. Load the CFG guide
2. Ask: What's the state name? What context?
3. Generate: `exe.web.state.Order.DiscreteOrder.USER_STATE_25=Label`
4. If used in actions, generate action labels too
5. Write to AllBundles.properties

### "Label new custom fields"
1. Load the CFG guide
2. Ask: Which fields? Which object? (Header/Line/Schedule?)
3. Generate all field labels + formatting if needed + audit labels if fields are audited
4. Write to AllBundles.properties

### "Configure field formatting"
1. Load the CFG guide
2. Ask: Which fields? What type? (numbers/dates/currency?)
3. Generate fieldFormat entries with proper patterns using core patterns
4. Write to AllBundles.properties

### "Add master data labels for PSD context"
1. Load the CFG guide
2. Ask: Which PSD context? (CollabSearch/CollabList/other?)
3. Ask: Same label or different? (for context-specific labeling)
4. Generate `pc.web.*` entries; use label reuse pattern if appropriate
5. Write to AllBundles.properties

### "Create validation error messages"
1. Load the CFG guide
2. Ask: What validation errors need messages?
3. Generate all error message entries with descriptive, business-friendly text
4. Ensure messages correspond to validation rules in Actions
5. Write to AllBundles.properties

---

## File Locations

| File | Path |
|------|------|
| Source | `solution/project/ssp-ext/E2/e2sc/gap-data/cfg.append/AllBundles.properties` |
| Deployed | `/e2open/app/e2sc/server/cfg/AllBundles.properties` (merged) |

No reload script needed — server picks up on restart.

---

## Critical Rules

✅ Load the CFG guide first
✅ Follow exact pattern structures
✅ Include all related labels (state + action + field)
✅ Validate error message keys match actions
✅ Write files immediately

❌ NEVER ask "Should I create AllBundles.properties?" (always do)
❌ NEVER create incomplete label sets
❌ NEVER leave placeholder text
❌ NEVER forget validation message labels

---
name: e2sc-config
description: 'Full E2open SCPM configuration for both OC (OCMetaModel) and PC (PCMetaModel/PCMM): States, Actions, Transitions, Relationships, AutoId, AuditChangeColumns, StateAggregator, PCMM PSD PageSectionDefinition XML fields. Use when a task spans multiple config domains simultaneously.'
---

# E2open SCPM Configuration (OC + PC + CFG + IO)

Handle both OC (Order Collaboration / OCMetaModel) and PC (Plan Collaboration / PCMetaModel / PCMM) configurations in a single workflow, including CFG properties and IoDocTypeDef.

## Reference Documentation

- **OC:** `.github/skills/e2sc-ocmm/guide.md` — States, Actions, Transitions, Relationships, AutoId
- **PC:** `.github/skills/e2sc-pcmm/guide.md` — PSD patterns, CollabList fields, ObjectName types
- **CFG:** `.github/skills/e2sc-cfg/guide.md` — AllBundles.properties labels, formatting, validation messages
- **IO:** `.github/skills/e2sc-io/guide.md` — DocumentType definitions, COLLAB_ATTRIBUTES downloads

Load the relevant guide(s) based on the user's request. Load all if the task spans OC, PC, and IO.

## Behavior

- Takes initiative to complete tasks fully
- Scans files to find available numbers before asking
- Generates ALL required files at once
- Asks only essential questions (3-5 max)
- Validates and writes files automatically

## Workflow

### Step 1: Scan Workspace (DO THIS FIRST)
```
ALWAYS scan for available numbers before asking questions:
- Search MetaData/**/*_Actions*.xml for highest USER_ACTION_X
- Search MetaData/**/*_States*.xml for highest USER_STATE_X
- Report what you found
```

### Step 2: Ask ONLY Essential Questions
```
Ask 3-5 targeted questions maximum:
✅ "Which field should store the data?" (if not specified)
✅ "What should the action button say?" (if adding actions)
✅ "Which roles need access?" (always ask)
✅ "Any specific validation requirements?" (if relevant)

❌ DON'T ask: "Should I create this file?" - YES, create it
❌ DON'T ask: "What number should I use?" - You scanned, you decide
❌ DON'T ask: "Do you want AllBundles.properties?" - YES, always create it
```

### Step 3: Generate ALL Files Immediately
Generate complete, production-ready files:
- States XML (if needed)
- StateAggregator XML (if needed)
- Actions XML (if needed)
- Transitions XML (if needed)
- AllBundles.properties (ALWAYS)
- role_info.txt (ALWAYS for actions/states)

### Step 4: Write Files
Use `create_file` or `replace_string_in_file` to write ALL files. Don't ask "Should I write these?" — Just write them.

### Step 5: Summarize
List files created, key numbers used (USER_ACTION_X, USER_STATE_X), next steps (reload OC, test, etc.).

---

## Quick Reference: Configuration Patterns

### AutoId Patterns
```xml
<!-- Create new sequence -->
<AutoId name="CUSTOM_SEQ" incrementBy="1" startValue="1">
  <Prefix>CUSTOM</Prefix>
  <Suffix/>
</AutoId>

<!-- Reuse existing sequence -->
<AutoId uses="PO_NUMBER_SEQ" />
```

**Common Sequences:** `PO_NUMBER_SEQ`, `ASN_ID_SEQ`, `RECEIPT_ID_SEQ`, `INVOICE_ID_SEQ`

### Relationship Patterns
```xml
<Relationship maxCardinality="1000" name="[Name]">
  <SearchRules type="[ASN|Receipt|Invoice|Order]">
    <MatchRule target="[TargetObject].DomainName" value="PoHeader.DomainName"/>
    <MatchRule target="[TargetObject].SupplierName" value="PoHeader.SupplierName"/>
    <MatchRule target="[TargetObject]LineItem.OrderNumber" value="PoHeader.PoNumber"/>
    <MatchRule target="[TargetObject]LineItem.LineItemState" value="'OPEN'">
      <AdditionalValues><Value>'ACCEPTED'</Value></AdditionalValues>
    </MatchRule>
  </SearchRules>
  <UiLink display="[Label]" targetFilter="[Filter]" targetWorkflow="[Workflow]"/>
</Relationship>
```

### AuditChangeColumns Pattern
```xml
<AuditChangeColumns xmlns="http://scc.i2.com/OCMetaModel">
  <AuditChangeColumn name="PoHeader.[FieldName]" uiOrDownload="both"/>
  <AuditChangeColumn name="PoLineItem.[FieldName]" uiOrDownload="both"/>
  <AuditChangeColumn name="PoRequestSchedule.[FieldName]" uiOrDownload="both"/>
</AuditChangeColumns>
```

### StateAggregator Pattern
```xml
<StateAggregator xmlns="http://scc.i2.com/OCMetaModel">
  <PriorityAggregator isDefault="true" typeName="[TYPE]">
    <Priority priority="100" systemStateName="NEW"/>
    <Priority priority="200" systemStateName="OPEN"/>
    <Priority priority="250" systemStateName="USER_STATE_25"/>
    <Priority priority="600" systemStateName="CANCELLED"/>
    <Priority priority="700" systemStateName="CLOSED"/>
  </PriorityAggregator>
</StateAggregator>
```

**Priority Guidelines:** 100-210: Active states | 300-500: Response states | 510-520: Fulfillment | 600-700: Final | 9000+: System

### Action Template
```xml
<Action actionButtonName="[BUTTON_TEXT]" systemActionName="USER_ACTION_[N]" userActionName="[NAME]">
  <UiEdit field="[FieldPath]"/>
  <Validate isFinalValidate="true" condition="[CONDITION]" resId="[KEY]"/>
  <Set field="[FieldPath]" value="[VALUE]"/>
</Action>
```

### State Template
```xml
<State systemStateName="USER_STATE_[N]" userStateName="[NAME]"
       stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler"
       icon="[ICON]-[COLOR]"/>
```

### role_info.txt Pattern (USE TABS!)
```
#broker_domain	broker_org	[ROLE]	action	USER_ACTION_[N]	1
#broker_domain	broker_org	[ROLE]	state	USER_STATE_[N]	1
```

---

## Object Hierarchy

- Order: `PoHeader`, `PoLineItem`, `PoRequestSchedule`, `PoPromiseSchedule`
- ASN: `AsnHeader`, `AsnDelivery`, `AsnLineItem`
- Receipt: `ReceiptHeader`, `ReceiptLineItem`

## Common Roles

`e2pen_super_role`, `GLV-Partner`, `Supply-Buyer`, `Supply-Buyer_Admin`, `Supply-Supplier`, `MTIM-Hub`, `MTIM-Supplier`

## Icons Reference

`play_arrow-blue`, `thumb_up-green`, `input-yellow`, `warning-yellow`, `close-gray`, `do_not_disturb-yellow`

## Date/Time Functions

`CURRENT_DATE`, `TO_START_OF_DAY(CURRENT_DATE)`, `CURRENT_DATE + days(7)`

---

## When User Says

### "Add a field"
1. Scan for available PDF fields
2. Ask: Which field? Which label? Which roles?
3. Generate: AllBundles.properties, role_info.txt, AuditChangeColumns if needed
4. Write all files

### "Create a workflow"
1. Scan for available USER_ACTION and USER_STATE numbers
2. Ask: Button text? State names? Roles? Validation?
3. Generate: States, StateAggregator, Actions, Transitions, AllBundles, role_info
4. Write all files

### "Create relationship to [ASN/Receipt/Invoice]"
1. Scan existing Relationships in `MetaData/**/*_OCMetaModel*.xml`
2. Ask: Which fields to match? State filtering?
3. Generate: Relationship XML with SearchRules + AllBundles.properties with label
4. Write both files

### "Add audit tracking for [fields]"
1. Scan existing AuditChangeColumns_ext.xml
2. Ask: Which fields? UI only, export only, or both? (default: both)
3. Generate: Updated AuditChangeColumns_ext.xml + AllBundles.properties
4. Write both files

### "Configure AutoId"
1. Scan existing AutoId configurations
2. Ask: New sequence or reuse existing? Prefix/suffix?
3. Generate: AutoId configuration in OCMetaModel
4. Write file

---

## Critical Rules

✅ Scan for available numbers FIRST
✅ Generate ALL related files in ONE response
✅ Use tabs (not spaces) in role_info.txt
✅ Include complete XML headers and namespaces
✅ Write files immediately after generating

❌ NEVER ask user for USER_ACTION/USER_STATE numbers (scan and decide)
❌ NEVER generate one file and wait for approval before next
❌ NEVER ask "Should I create AllBundles.properties?" (always create)
❌ NEVER leave placeholders like "[FILL_IN_VALUE]"

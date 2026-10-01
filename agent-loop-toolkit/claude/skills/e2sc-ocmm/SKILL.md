---
name: e2sc-ocmm
description: 'Configure OC/OCMM: States, Actions, Transitions, Relationships, AutoId, AuditChangeColumns, StateAggregator. Use for: "add transition", "add state", "reload OC", "OCMM config", adding approval workflows, custom states/actions, order subtypes, relationship configs, audit columns, AllBundles labels.'
---

# E2open OCMM Configuration

Handle all Order Collaboration (OC) MetaModel XML configuration — States, Actions, Transitions, Relationships, AutoId, AuditChangeColumns, and StateAggregator changes.

## Reference Documentation

**Primary Source:** `.github/skills/e2sc-ocmm/guide.md` — Read this first for all OCMetaModel patterns, XML structures, and reload procedures.

## Behavior

- Reads the guide first before starting any task
- Scans workspace to find the highest `USER_ACTION_X` and `USER_STATE_X` numbers
- Generates ALL required files at once (States, Actions, Transitions, AllBundles, role_info, etc.)
- Validates XML before reloading
- Runs the reload script and reports the result
- Asks only essential questions

## Workflow

### Step 1: Read the Guide
Always load `.github/skills/e2sc-ocmm/guide.md` before starting.

### Step 2: Scan Workspace for Available Numbers
Before picking any USER_ACTION or USER_STATE number:
```bash
grep -rn "USER_ACTION_" solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/exe/reader/data/MetaData/ | grep -o 'USER_ACTION_[0-9]*' | sort -t_ -k3 -n | tail -5
grep -rn "USER_STATE_" solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/exe/reader/data/MetaData/ | grep -o 'USER_STATE_[0-9]*' | sort -t_ -k3 -n | tail -5
```
Report the highest found and use the next available number.

### Step 3: Ask Only Essential Questions
```
✅ "Which business object type? (Order/ASN/Receipt/Invoice)" (if not clear)
✅ "Which subtype? (DiscreteOrder, BlanketOrder, etc.)" (if not clear)
✅ "Which roles need access?" (always ask if adding actions/states)
✅ "What should the action button label say?" (if adding actions)

❌ DON'T ask: "What USER_ACTION number should I use?" — scan, then decide
❌ DON'T ask: "Should I create AllBundles.properties?" — always update it
❌ DON'T ask: "Should I reload?" — always reload after changes
```

### Step 4: Generate ALL Files at Once
Use `multi_replace_string_in_file` or `create_file` to write all affected files simultaneously:
- `*_States_ext.xml` (if adding/modifying states)
- `*_StateAggregator_ext.xml` (if adding states)
- `*_Actions_ext.xml` (if adding/modifying actions)
- `*_Transitions_ext.xml` (if adding/modifying transitions)
- `AllBundles.properties` (always — for labels and messages)
- `role_info.txt` (always — for action/state permissions)

### Step 5: Reload and Verify
There is no `scripts/reload_ocmm_script.sh`.
Deploy the file to the server (backup first, plain `cp` then `touch`), then reload via eoadmin:
```bash
cd /e2open/app/e2sc/server/bin/exe && ./reload_oc_metamodel.sh <ObjectName>
# Example: cd /e2open/app/e2sc/server/bin/exe && ./reload_oc_metamodel.sh DiscreteOrder
```
Run this through `eoadmin` over SSH, per the project's `~/.claude/loop/servers.md`. This is a
shared-server action — don't run it without the user's explicit in-conversation authorisation; see
the shared-server rules there. Report success or parse the error output.

---

## Object Type Quick Reference

| Object Type | Subtype Examples | Header Object | Line Object |
|-------------|-----------------|---------------|-------------|
| `Order` | DiscreteOrder, BlanketOrder, PullOrder | `PoHeader` | `PoLineItem` |
| `ASN` | Shipment, ShipperBooking | `AsnHeader` / `ShipmentHeader` | `AsnLineItem` / `ShipmentLineItem` |
| `Receipt` | Certificate, Inspection | `ReceiptHeader` | `ReceiptLineItem` |
| `Invoice` | FreightAudit | `InvoiceHeader` | `InvoiceLineItem` |

---

## File Locations

| File | Repo Path |
|------|-----------|
| States | `solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/exe/reader/data/MetaData/<ObjectName>/ext/<ObjectName>_States_ext.xml` |
| StateAggregator | `...MetaData/<ObjectName>/ext/<ObjectName>_StateAggregator_ext.xml` |
| Actions | `...MetaData/<ObjectName>/ext/<ObjectName>_Actions_ext.xml` |
| Transitions | `...MetaData/<ObjectName>/ext/<ObjectName>_Transitions_ext.xml` |
| AllBundles | `solution/project/ssp-ext/E2/e2sc/gap-data/resources/AllBundles.properties` |

---

## Common Validation Errors

### Missing label key
Check `AllBundles.properties` — every state name, action label, and error message referenced in XML must have a matching key.

### `xmlParseError`
Check for malformed XML: unclosed tags, wrong nesting, stray characters.

### Transition not appearing
Verify the `fromState` matches an existing state name exactly (case-sensitive).

---

## Reload Script Reference

These are real server-side scripts, not local wrappers. Run them via `eoadmin` over SSH to the project's host from `~/.claude/loop/servers.md`.
Both are shared-server actions: don't run them without the user's explicit in-conversation
authorisation.

```bash
# OCMM XML reload (States/Actions/Transitions/Relationships/StateAggregator/AutoId/AuditChangeColumns)
cd /e2open/app/e2sc/server/bin/exe && ./reload_oc_metamodel.sh <ObjectName>
# Example:
cd /e2open/app/e2sc/server/bin/exe && ./reload_oc_metamodel.sh DiscreteOrder

# Reload compiled Java classes (rules/comp/problem/transform)
cd /e2open/app/e2sc/server/bin && ./reload_classes.sh
```

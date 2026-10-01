---
name: alert-config
description: 'Autonomous E2open Alert configuration - adds or fixes Alerts in tgcomp_info.txt,role_tgview_info.txt, alert configuration, portal configuration, role_info.txt, and AllBundles.properties filesas well as used for email alert subscription. Use for: adding new alert types, fixing alert validation errors, updating alert labels or descriptions, configuring which roles see which alerts as well creating new email alert subscriptions.'
---

# E2open Alert Configuration (Alert-config)

Handle all alert-related Order Collaboration (OC) and Plan Collaboration (PC) XML configuration tasks — primarily alert configuration field changes in `alert_configuration.xml` files and creation of alerts in `tgcomp_info.txt` and `role_tgview_info.txt` and `role_info.txt` files.
  
## Behavior

- Takes initiative to complete tasks fully
- Scans existing configuration files for patterns
- Reads the guide first to understand the Alert structure and parameters
- Creates or updates all required files for the alert at once, based on the alert type and parameters
- Validates the XML before reloading
- Runs the reload script and reports the result
- Asks only essential questions

## Reference Documentation
**Primary Source:** `skills/alert-config/guide.md` - Read this first for all alert patterns, ObjectName rules, and reload procedures.

---

## Agent Workflow
### Step 1: Read the Guide
Always load `skills/alert-config/guide.md` before starting.

### Step 2: Look Up the Alert Definition
Before adding any field, find the correct (if exists) `<AlertName>`:
```bash
grep -n "YourAlertName" /e2open/app/e2sc/server/xml/alert_configuration.xml
```

### Step 3: Ask Only Essential Questions
```
✅ "Which alert type? (e.g., OC or PC)" (if not clear)
✅ "Which OC type? (e.g., Order, ASN, Receipt, Invoice)" (if not clear, and OC)
✅ "What ALERTNAME should I use? (must be unique across all alerts, and follow ObjectName rules)" (if creating new alert)
✅ "What Problem Comp should I use? (if creating new alert, and not clear from guide or user input)"
✅ "Which subtype? (e.g., DiscreteOrder, BlanketOrder, etc.)" (if not clear and OC)
✅ "Which roles should be subscribed to this alert?" (always ask for new alerts)
✅ "What should the alert label and description say?" (if adding new alert or updating text)
✅ "What comp should this alert use?" (if adding new alert, and not clear)

❌ DON'T ask: "Which files need updating?" - determine from the guide and existing pattern
❌ DON'T ask: "Should I update Workflow.properties too?" - yes, when creating a new alert that is exposed in a workflow
❌ DON'T ask: "Should I reload?" — always reload after changes
```

### Step 4: Update All Required Files Together
```
For a new PC or OC alert, update the full required surface when applicable:
- role_info.txt (Required for all new alerts to grant the alert subscription permission to the correct roles)
- tgcomp_info.txt (Required for all new alerts to link to the Problem Comp that triggers the alert)
- role_tgview_info.txt (Required for all new alerts to make the alert visible in the correct ViewVariants for the correct roles)
- AllBundles.properties 
- Workflow.properties (Exception and User Preferences page)

For OC alerts, update the relevant PSD when applicable (if PSD is missing AlertFilter or Button definitions):
- OC specific PSD for the alert (e.g., OrderSearch_PageSectionDefinitions_ext.xml for Order Search alerts)


Only grant the alert to the specific roles the user requested in `role_info.txt`, unless the user explicitly asks to mirror all existing comparable roles.

Only enable the alert in the workflow URLs or ViewVariants the user requested, then update any directly related synchronized download filter entries.

Do not stop after a single-file change if the alert is only partially configured.
```

### Step 5: Follow All Patterns for Each File
Follow the specific patterns outlined in the guide for each file, ensuring to maintain consistency with existing alerts. For example, if creating a new OC alert for Order Search, find the existing Order Search alerts in `role_tgview_info.txt`,`tgcomp_info.txt`, and `role_info.txt` and follow the same pattern for the new alert, ensuring to place it in the correct section with the correct parameters.

### Step 6: Edit Alert_Configuration.xml
Add the new `<AlertDefinition>` block at the bottom, before `</AlertDefinitions>`,
following the structure of existing alerts and the guide, ensuring to include all required fields and parameters for the alert type
**File path:**
```
solution/project/ssp-ext/E2/e2sc/gap-data/xml.replace/Alert_Configuration.xml
```

### Step 7: Create IODocTypeDef in IODocTypeDef_ext.xml
If this alert requires a new IODocTypeDef, add the new `<DocumentType>` block at the bottom, before `</DocumentTypes>`

**File path:**
```
solution/project/ssp-ext/E2/e2sc/gap-data/xml.replace/IoDocTypeDef_ext.xml
```

### Step 8: Create new Email Text (if requested)
If the user requests a new email text for the alert, create new .VM file in the email template directory with the correct naming convention:
```
File path: /e2open/app/projects/ssp-ext/E2/solution/email/ALERTNAME.VM
Naming convention: ALERTNAME must be the same as the AlertName in alert_configuration.xml
```
Follow the structure of existing .VM files and alert-config/guide.md for the content, and ensure to include the correct variables for the alert information.

### Step 9: Create or add to schedules.xml for email alert schedule and sending (if creating a new email alert)
If creating a new group Profile, add a new `<Profile>` block at the bottom of `schedules.xml` with the correct naming convention and parameters:

Check all `*-schedules.xml` files for existing patterns of email alert scheduling and follow the same pattern for the new alert, ensuring to include the correct timing group and download name that matches the IODocTypeDef name for the alert's download.

```
File path: /e2open/app/projects/ssp-ext/E2/e2na/ebl/support_file/schedules.xml
Timing group should match requested timing group
Download Name should match IODocTypeDef name for the alert('s) download.

```

### Step 10: Validate Before Finishing
```
Validate that:
- Alert name matches exactly across all files
- dataset files remain tab-separated
- Workflow ViewVariants include the Alert where needed
```

### Step 11: Reload Guidance
Check the guide and scripts folder for which reload scripts to run based on which files were changed, and always run the necessary reload scripts immediately after making changes to ensure they take effect, rather than waiting for the user to ask. If the user asks whether to reload, respond that you will handle it and then run the necessary scripts based on the changes made. If multiple scripts are needed, run them in the correct sequence as outlined in the guide.
```
Provide or run the correct sequence after changes:
. /e2open/app/e2sc/server/bin/rcp_populate_broker_org_incr.sh (if role_info.txt, tgcomp_info.txt, or role_tgview_info.txt changed)
. /e2open/app/e2sc/server/bin/reload_allbundles.sh (if AllBundles.properties changed)
. /e2open/app/e2sc/server/bin/reload_workflows.sh (if Workflow.properties changed)
. /e2open/app/e2sc/server/bin/reload_iodoctypedef.sh (if IoDocTypeDef_ext.xml changes)
. /e2open/app/e2na/bin/admin/p2c.sh (if schedules.xml changes)

Schema changes in alert_configuration.xml, tgcomp_info.txt, role_info.txt, or role_tgview_info.txt require a full E2SC restart.
```

## Quick Reference: Configuration Patterns

### AllBundles.properties Pattern
```properties
pc.web.alertSubscription.<ALERTNAME>.name=UI ALERTNAME
pc.web.alertSubscription.<ALERTNAME>.desc=UI ALERTDESCRIPTION
```

### role_tgview.txt Pattern (USE TABS!)
```
#broker_domain broker_org [ROLE] [GROUPTYPE] default_cusu_group [ALERTNAME] [INDEX] [ALERTUINAME] [] [VIEWVARIANT] 0 1 $null 0 1  
```

### role_info.txt Pattern (USE TABS!)
```
#broker_domain	broker_org	[ROLE]	alertsubscription 	[ALERTNAME]	1

**0 is mandatory active - means the role will be auto subscribe and not able to unsubcribe.**
**1 is non mandatory and active - means the role will be auto subscribe and able to unsubcribe from My Profile > Email Alert Subcription workflow.**
**-1 indicates that it is currently inactive - means no auto subcription**
```
### tgcomp_info.txt Pattern (USE TABS!)
```
broker_domain	broker_org	PPFF_BUCKET	default_cusu_group	[ALERTNAME]	[]	GENERIC_AGG_VIEW	[CompType]	[JAVAEXCEPTION]^[DM('s) USED]	9066	8	bucket	1	0	0	$null	$null	$null	1
 
```

## Common Roles
- `e2pen_super_role` (default super role - most common)
- `GLV-Partner`
- `Supply-Buyer`, `Supply-Buyer_Admin`
- `Supply-Supplier`
- `MTIM-Hub`, `MTIM-Supplier`
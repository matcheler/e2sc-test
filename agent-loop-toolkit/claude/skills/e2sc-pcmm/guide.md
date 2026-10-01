# E2SC PCMM & PSD Configuration Guide

> **Purpose**: This guide helps developers understand and configure PCMM (PCMetaModel) and PSD (PageSectionDefinitions) XML files in E2open SCPM.
>
> **Audience**: Technical implementers and developers working on E2open SCPM customizations.
>
> **How to Use**: Share this guide with GitHub Copilot in a new chat to get configuration assistance.

## Table of Contents

1. [File Locations](#file-locations)
2. [Attribute Schema — Where to Find Definitions](#attribute-schema--where-to-find-definitions)
3. [PSD Field Rules](#psd-field-rules)
4. [Reload Scripts](#reload-scripts)
5. [Common Validation Errors](#common-validation-errors)
6. [role_tgview_info Configuration](#role_tgview_info-configuration)
7. [tgview_info Configuration](#tgview_info-configuration)

---

## File Locations

### Repo (source of truth)
```
solution/project/ssp-ext/E2/e2sc/gap-data/xml.replace/
├── PCMM_PSD_mtimItemFcst_ext.xml       ← Main PSD for MTIM Item Forecast collab lists
├── PCMM_PageSectionDefinitions_ext.xml  ← Other PSD definitions
├── PCMM_Computations_ext.xml            ← Computation rules
└── ...
```

### Server (deployed)
```
/e2open/app/e2sc/server/xml/
├── PCMM_*.xml
└── PCMetaModelTransformed.xml   ← Merged result of all PCMM files (read-only, auto-generated on reload)
```

> All `PCMM_*.xml` files are **merged together** into `PCMetaModelTransformed.xml` when the PCMM reload script runs. This is the file the server actually reads at runtime. Never edit `PCMetaModelTransformed.xml` directly — always edit the source files in the repo.

---

## Attribute Schema — Where to Find Definitions

When adding a new `<Field>` to a PSD and unsure of the correct `<ObjectName>`, check these files on the **server**:

### Primary lookup files (in `/e2open/app/e2sc/server/xml/`)

| File | Contains |
|------|----------|
| `PCMM_PageSectionDefinitions_ext.xml` | Existing field usages — best reference for `<ObjectName>` type and `widget` for any field |
| `PCMM_Computations_ext.xml` | Data measure and attribute references |
| `IoDocTypeDef_ext.xml` | IO document type field definitions |
| `PCMM_BPMWorkflows.xml` | Workflow attribute references |

### How to look up a field
```bash
grep -n "YourFieldName" /e2open/app/e2sc/server/xml/PCMM_PageSectionDefinitions_ext.xml
```

This will show the exact `<ObjectName>` and `widget` pattern already in use for that field.

### ObjectName types

| ObjectName | Use for |
|------------|---------|
| `Collab` | Standard collab fields (CustomerName, SupplierName, CustSiteName, etc.) |
| `COLLAB_ATTR` | Custom collab attributes (ProjDefCollabAttrib*, GlobalSupplierId, CommodityCode, etc.) |
| `DIM_ATTR` | Dimension attributes (CustomerDUNS, SiteType, CustSiteHierarchyLevel*, etc.) |
| `DataMeasure` | Data measure fields (ConsumptionForecast, WeeklyDemand, etc.) |

### Key rule — `widget="AutoComplete"` is only valid on `Collab` ObjectName
Fields with `<ObjectName>COLLAB_ATTR</ObjectName>` or `<ObjectName>DIM_ATTR</ObjectName>` should **not** have `widget="AutoComplete"`.

**Wrong:**
```xml
<Field widget="AutoComplete"><ObjectName>Collab</ObjectName><FieldName>ProjDefCollabAttribString77</FieldName></Field>
```

**Correct:**
```xml
<Field><ObjectName>COLLAB_ATTR</ObjectName><FieldName>ProjDefCollabAttribString77</FieldName></Field>
```

---

## PSD Field Rules

### Adding a field to a CollabList view
Fields appear in two places per `<PageSectionDefinition>`:
1. `<PsdSubsection><Fields>` — fields shown in the default view
2. `<AvailableFields>` — fields available to add via column picker

Both must use the same `<ObjectName>` and consistent `widget` usage.

### Example — adding `ProjDefCollabAttribString77` (Supplier Site Type)
```xml
<!-- In <Fields> subsection -->
<Field><ObjectName>COLLAB_ATTR</ObjectName><FieldName>ProjDefCollabAttribString77</FieldName></Field>

<!-- In <AvailableFields> -->
<Field><ObjectName>COLLAB_ATTR</ObjectName><FieldName>ProjDefCollabAttribString77</FieldName></Field>
```

---

## Reload Scripts

### Reload PCMM (XML changes)
```bash
bash scripts/reload_pcmm_script.sh <filename.xml>
# Example:
bash scripts/reload_pcmm_script.sh PCMM_PSD_mtimItemFcst_ext.xml
```

### Reload Java class
```bash
bash scripts/reload_java_classes.sh <ClassName>
# Example:
bash scripts/reload_java_classes.sh RiskPITObjectCreator
```

### Script configuration
Both scripts require `USER_DIR` and `PROJECT` to be set. Set them for your project, for example:
```bash
USER_DIR="<your-user-dir>"
PROJECT="<project>"
```

### Verify after reload
After running the reload script, confirm your entry is present in the merged output file:
```bash
eoadmin grep "MyEntryName" /e2open/app/e2sc/server/xml/PCMetaModelTransformed.xml
```
If no output, check that the source XML was copied to the server before reloading.

---

## Common Validation Errors

### `core.server.psd.validationFailed` / `core.server.xmlParseError`

**Cause**: Invalid `<ObjectName>` for a field, or `widget` attribute used on unsupported type.

**Fix**:
1. Find the correct `<ObjectName>` by searching the server XML:
   ```bash
   grep -n "YourFieldName" /e2open/app/e2sc/server/xml/PCMM_PageSectionDefinitions_ext.xml
   ```
2. Match the exact pattern (ObjectName + widget) from the existing usage.

### Hot-reload result: `Failed ! schema change not implemented`
Not an error — means a new method/field was added to the class. The JVM couldn't do a field-swap but the class is still reloaded. Subsequent reloads of unchanged structure return `Done !`.

---

## role_tgview_info Configuration

### Purpose
role_tgview_info configuration defines **role-based visibility for data measures** used by timeline/problem views in the UI. This enables:
- **Data measure visibility by role** - Which roles can view configured data measures
- **Problem view eligibility** - Which roles can review problems in Order Collaboration UI
- **View-level behavior** - Total/summary toggles and read-only behavior at role/view level
- **Private hub architecture** - Single customer deployment with hardcoded domain/org

### Key Concepts

#### **1. Private Hub Architecture**
E2open implementations typically use **"private hub"** model:
- **One customer, one application** deployment
- **Hardcoded domain/organization**: `broker_domain` and `broker_org`
- **Simplified role management** without multi-tenant complexity

#### **2. Tab-Separated Configuration**
role_tgview_info.txt uses **tab-separated values** with this structure:
```
DOMAINNAME | ORGANIZATIONNAME | ROLENAME | TIMELINEGROUPTYPE | CUSUGROUPNAME | FINALRESULTDATAMEASURE | DATAMEASUREINDEX | TITLEDATAMEASURE | COLLABTYPE | VIEWNAME | ENABLETOTAL | ENABLESUMMARY | PITGROUPING | UIREADONLY | SETPROBLEMREVIEW
```

#### **3. Override Behavior**
- role_tgview_info.txt **overwrites** matching behavior from:
  - `/server/datasets/<dataset>/core/reader/data/tgview_info.txt`
- Data measures referenced in this file must exist in:
  - `point_in_time_schema.txt` for data measure configuration or
  - `tgcomp_info.txt` for problem configuration

### Configuration Structure

#### **File Location:**
```
<SCPM install directory>/server/datasets/<dataset>/core/reader/data/role_tgview_info.txt
```

#### **Basic Format:**
```
DOMAINNAME	ORGANIZATIONNAME	ROLENAME	TIMELINEGROUPTYPE	CUSUGROUPNAME	FINALRESULTDATAMEASURE	DATAMEASUREINDEX	TITLEDATAMEASURE	COLLABTYPE	VIEWNAME	ENABLETOTAL	ENABLESUMMARY	PITGROUPING	UIREADONLY	SETPROBLEMREVIEW
```

### Column Definitions

#### **Identity Columns**
- `DOMAINNAME`: Domain (commonly `broker_domain`)
- `ORGANIZATIONNAME`: Organization (commonly `broker_org`)
- `ROLENAME`: Role receiving this visibility behavior

#### **Context Columns**
- `TIMELINEGROUPTYPE`: Timeline group type being configured
- `CUSUGROUPNAME`: Collaboration user group scope
- `COLLABTYPE`: Collaboration object/type context
- `VIEWNAME`: Target UI/problem view name

#### **Measure Columns**
- `FINALRESULTDATAMEASURE`: Main result data measure displayed/evaluated
- `DATAMEASUREINDEX`: Measure index/position mapping
- `TITLEDATAMEASURE`: Data measure used for title/header display

#### **Behavior Flags**
- `ENABLETOTAL`: Enable totals behavior for the view
- `ENABLESUMMARY`: Enable summary behavior for the view
- `PITGROUPING`: Point-in-time grouping behavior
- `UIREADONLY`: UI read-only enforcement for this role/view context
- `SETPROBLEMREVIEW`: Controls whether role can perform problem review actions

### Real Configuration Examples

#### **Example 1: Standard OC problem configuration**
```
broker_domain	broker_org	e2open_super_role	PO_SCHEDULE|DiscreteOrder	default_cusu_group	procNewOrOpenDiscreteOrderAlert	411	New/Open Discrete Order Alert	EXE	PROBLEM_VIEW	0	1	$null	0	1
```

#### **Example 2: Standard PC problem configuration**
```
broker_domain	broker_org	e2open_super_role	PPFF_BUCKET	default_cusu_group	procNewChangedForecastAlert	2030	New/Changed Forecast Alert	PPFF	GENERIC_AGG_VIEW	0	1	$null	0	1
```

#### **Example 3: Standard PC Data measure configuration**
```
broker_domain	broker_org	e2open_super_role	PPFF_BUCKET	default_cusu_group	Forecast	2010	Forecast	PPFF	GENERIC_AGG_VIEW	1	1	$null	0	1
```

#### **Example 4: Standard PC Aggregation Data measure configuration**
```
broker_domain	broker_org	e2open_super_role	PPFF_BUCKET	default_cusu_group	SupplyCommitAgg	50020	Commit	PPFF	GENERIC_AGG_VIEW	1	1	$null	0	1
```

#### **Example 5: Standard OC Aggregation Data measure configuration**
```
broker_domain	broker_org	e2open_super_role	PPFF_BUCKET	default_cusu_group	OpenPO	91000007	Open PO	PPFF	GENERIC_AGG_VIEW	1	1	$null	0	1
```

### Configuration Questions Framework

When configuring role_tgview_info, ask:

#### **Role and Scope Selection:**
1. Which role(s) should see this data measure/view behavior?
2. Which timeline group type and collaboration type are in scope?
3. Which CUSU group should this apply to?

#### **Data Measure Mapping:**
1. What is the FINALRESULTDATAMEASURE name?
2. What should DATAMEASUREINDEX be?
3. What TITLEDATAMEASURE should the view show?
4. Are these measures already defined in point_in_time_schema.txt or tgcomp_info.txt?

#### **View Behavior:**
1. Which VIEWNAME is targeted?
2. Should ENABLETOTAL be on or off?
3. Should ENABLESUMMARY be on or off?
4. Should the view be UI read-only for this role?
5. Should this role be able to set problem review?

### Best Practices

#### **Configuration Strategy:**
- Use **tab separators only**; avoid spaces as delimiters
- Keep role entries grouped by `ROLENAME` and `VIEWNAME` for maintainability
- Reuse validated measure names from point_in_time_schema/tgcomp_info
- Keep domain/org consistent with private hub defaults (`broker_domain`, `broker_org`)
- New configuration will be add started at last line of the file
- Group the configuration with existing line if the ask is to extend the role permission of datameasure/problem

#### **Validation and Testing:**
- Validate that measure names exist before deployment
- Test each role in UI to confirm totals/summary/read-only behavior
- Verify that problem review behavior matches business expectation
- Confirm role_tgview_info overrides expected tgview_info behavior

#### **Maintenance:**
- Document non-obvious view names and measure mappings
- Keep related role entries together (viewer vs admin variants)
- Prefer explicit entries for critical roles instead of relying on inherited assumptions

This role_tgview_info configuration ensures predictable, role-based UI visibility and problem review control for timeline group views in E2open SCPM.

---

## tgview_info Configuration

### Purpose

tgview_info defines base data measure visibility and behavior for timeline group views in SCPM UI. It controls:

- Which data measures appear in timeline views (for example, forecast, commit, inventory)
- Display order of measures in the UI via data measure index
- View-level behavior such as totals, summaries, read-only mode, and problem review flag
- PIT grouping and version-function behavior used by the view engine

### Key Concepts

#### 1. Private Hub Architecture

E2open implementations typically use private hub model:

- One customer, one application deployment
- Hardcoded domain and organization: broker_domain and broker_org
- Simplified administration of view behavior

#### 2. Tab-Separated Configuration

tgview_info.txt uses tab-separated values with this structure:

DOMAINNAME | ORGANIZATIONNAME | COLLABTYPE | VIEWNAME | TIMELINEGROUPTYPE | CUSUGROUPNAME | FINALRESULTDATAMEASURE | DATAMEASUREINDEX | TITLEDATAMEASURE | ENABLETOTAL | ENABLESUMMARY | PITGROUPING | IMVERSIONFUNCTION | UIREADONLY | SETPROBLEMREVIEW

#### 3. Default vs Role Override

- tgview_info provides default behavior for all users
- role_tgview_info can override matching behavior for specific roles
- Keep indices aligned between tgview_info and role_tgview_info where possible

### Configuration Structure

#### File Location

<SCPM install directory>/server/datasets/<dataset>/core/reader/data/tgview_info.txt

#### Basic Format

DOMAINNAME	ORGANIZATIONNAME	COLLABTYPE	VIEWNAME	TIMELINEGROUPTYPE	CUSUGROUPNAME	FINALRESULTDATAMEASURE	DATAMEASUREINDEX	TITLEDATAMEASURE	ENABLETOTAL	ENABLESUMMARY	PITGROUPING	IMVERSIONFUNCTION	UIREADONLY	SETPROBLEMREVIEW

### Column Definitions

#### Identity and Context Columns

- DOMAINNAME: Domain name, commonly broker_domain
- ORGANIZATIONNAME: Organization name, commonly broker_org
- COLLABTYPE: Collaboration type context, commonly PPFF
- VIEWNAME: Target view, commonly GENERIC_AGG_VIEW or AGG_VIEW
- TIMELINEGROUPTYPE: Timeline group type, commonly PPFF_BUCKET, sometimes SV for summary views
- CUSUGROUPNAME: CUSU scope, commonly default_cusu_group

#### Measure Columns

- FINALRESULTDATAMEASURE: Data measure name used by the view
- DATAMEASUREINDEX: Display order index in UI
- TITLEDATAMEASURE: Display title in UI

#### Behavior Columns

- ENABLETOTAL: Enable total calculations in UI, 1 or 0
- ENABLESUMMARY: Enable summary rendering in UI, 1 or 0
- PITGROUPING: PIT grouping behavior, often $null
- IMVERSIONFUNCTION: Version behavior function, for example StandardVersionFunction, MONDAY, or $null
- UIREADONLY: Read-only flag, 1 or 0
- SETPROBLEMREVIEW: Problem review enablement flag, 1 or 0

### Real Configuration Examples

#### Example 1: Standard Forecast Measure

broker_domain	broker_org	PPFF	GENERIC_AGG_VIEW	PPFF_BUCKET	default_cusu_group	Forecast	2010	Forecast	1	1	$null	StandardVersionFunction	0	1

#### Example 2: Standard Inventory Measure

broker_domain	broker_org	PPFF	GENERIC_AGG_VIEW	PPFF_BUCKET	default_cusu_group	InventoryCustSite	3010	Site Inventory	1	1	$null	MONDAY	0	1

#### Example 3: Summary View Measure

broker_domain	broker_org	PPFF	GENERIC_AGG_VIEW	SV	default_cusu_group	CustSiteName	14010	Collab.CustSiteName	0	0	$null	$null	0	1

#### Example 4: Aggregation Measure

broker_domain	broker_org	PPFF	GENERIC_AGG_VIEW	PPFF_BUCKET	default_cusu_group	PullRequests	6010	Pull Requests	1	1	$null	$null	0	1

### Configuration Questions Framework

When configuring tgview_info, ask:

#### Scope and View Selection

1. Which COLLABTYPE and VIEWNAME are targeted?
2. Which TIMELINEGROUPTYPE applies?
3. Which CUSU group should this configuration use?

#### Data Measure Mapping

1. What is the FINALRESULTDATAMEASURE name?
2. What DATAMEASUREINDEX should be used?
3. What TITLEDATAMEASURE should appear in UI?
4. Is this measure already defined and valid for this dataset?

#### View Behavior

1. Should ENABLETOTAL be on or off?
2. Should ENABLESUMMARY be on or off?
3. Should UI be read-only for this entry?
4. Should SETPROBLEMREVIEW remain enabled?
5. Is PITGROUPING or IMVERSIONFUNCTION required for this measure?

### Best Practices

#### Configuration Strategy

- Use tab separators only
- Keep entries grouped by VIEWNAME and TIMELINEGROUPTYPE for readability
- Reuse validated measure names from existing configs
- Keep domain and organization consistent with private hub defaults
- Add new rows at the end of the relevant logical section
- Align indices with role_tgview_info for maintainability

#### Validation and Testing

- Validate measure names before deployment
- Confirm display order and labels in UI
- Verify totals and summary behavior match requirements
- Validate version function behavior where applicable
- Confirm role_tgview_info overrides expected tgview_info defaults

#### Maintenance

- Document non-obvious index allocations and view mappings
- Keep related measures together
- Avoid duplicate indices in the same view context

This tgview_info configuration ensures consistent baseline data measure visibility and UI behavior across timeline group views in E2open SCPM.

---

## PCMM_Computation configuration

### Purpose

PCMM_Computation define the computation of the datameasure and also parameter needed to compute.

Current version we are specifically focus on `OCAggregation` computation pattern used for Order model analytics, including state filters, matching dimensions, and JIT-specific split logic.

### Scope and Purpose

The computation aggregates Order collaboration data into reusable measures for:

- Open purchase order quantity-style metrics (`DiscreteOrder`)
- Scheduled agreement forecast and firm buckets (`SchedAgreement`)

The sample uses `mode="pit"` measures with either business date (`RequestDate`) or snapshot date (`CURRENT_DATE`) depending on whether historical trend or current-position output is required.

### Computation Structure

```xml
<Computation name="OCAggregation" threadCount="1">
  <ClassName/>
  <Transient>
    <!-- DataMeasure definitions -->
  </Transient>
</Computation>
```

- `threadCount="1"`: executes single-threaded unless tuned otherwise.
- `Transient`: runtime measures not persisted into database.
- `Persistent`: runtime measures and persisted into database.

### SearchRules Semantics

All measures use `SearchRules type="Order"` with consistent dimensional matching to the collaboration grain:

- `PoHeader.CustomerName` matches `PPFF_COLLAB.CustomerName`
- `PoHeader.SupplierName` matches `PPFF_COLLAB.SupplierName`
- `PoLineItem.CustomerItemName` matches `PPFF_COLLAB.CustItemName`
- `PoRequestSchedule.CustomerSiteName` matches `PPFF_COLLAB.CustSiteName`

These match rules enforce alignment so only order rows belonging to the same customer/supplier/item/site slice are aggregated.

#### State filter

- For `DiscreteOrder` open PO measures: `New`, `Open`, `Accepted`, `Accepted with Changes`, `Supplier Rejected`
- For `SchedAgreement` measures: `New`, `Accepted`, `Accepted with Changes`

This intentionally keeps SA measures tighter than open PO, excluding states that are not relevant to SA firm/forecast calculations.

### Specific field filter (`PoRequestSchedule.PdfString47`)

Further down filter the criteria of the object to aggregate

Example: <e2sc:MatchRule target="PoRequestSchedule.PdfString47" value="1" exclude="true" includeNulls="false"/>

Interpretation:

- `target="PoRequestSchedule.PdfString47"` specify the field
- `value="1"` value to be aggregate
- `exclude="true"` to exclude in aggregation for value in attribute `value`. Optional attribute and default value is false.
- `includeNulls="false"` to include null value during search process. Best case is always false for better performance.

### Date Field Strategy

- `dateField="PoRequestSchedule.RequestDate"`:
  - Preserves business-date placement for trend-style reporting.
  - Appropriate when metric should move with request schedule time.

- `dateField="CURRENT_DATE"`:
  - Produces as-of-now snapshot values.
  - Appropriate for backlog, current exposure, and comparator measures.

User need to specify the date field strategy

### Annotated XML Example

```xml
<Computation name="OCAggregation" threadCount="1">
  <Transient>
    <!-- Open PO on request date (DiscreteOrder) -->
    <DataMeasure name="mtimOpenPO" type="double" mode="pit">
      <OCAggregation model="Order" subtype="DiscreteOrder"
                     valueField="PoRequestSchedule.PdfFloat25"
                     dateField="PoRequestSchedule.RequestDate"
                     implicitDimensionMapping="false">
        <SearchRules type="Order">
          <e2sc:MatchRule target="STATE" value="New">
            <e2sc:AdditionalValues>
              <e2sc:Value>Open</e2sc:Value>
              <e2sc:Value>Accepted</e2sc:Value>
              <e2sc:Value>Accepted with Changes</e2sc:Value>
              <e2sc:Value>Supplier Rejected</e2sc:Value>
            </e2sc:AdditionalValues>
          </e2sc:MatchRule>
          <e2sc:MatchRule target="PoHeader.CustomerName" value="PPFF_COLLAB.CustomerName" includeNulls="false"/>
          <e2sc:MatchRule target="PoHeader.SupplierName" value="PPFF_COLLAB.SupplierName" includeNulls="false"/>
          <e2sc:MatchRule target="PoLineItem.CustomerItemName" value="PPFF_COLLAB.CustItemName" includeNulls="false"/>
          <e2sc:MatchRule target="PoRequestSchedule.CustomerSiteName" value="PPFF_COLLAB.CustSiteName" includeNulls="false"/>
        </SearchRules>
      </OCAggregation>
    </DataMeasure>

    <!-- SA firm JIT snapshot (CURRENT_DATE) -->
    <DataMeasure name="mtimSCAggSAFirmJitComp" type="double" mode="pit">
      <OCAggregation model="Order" subtype="SchedAgreement"
                     valueField="PoRequestSchedule.RequestQuantity"
                     dateField="CURRENT_DATE"
                     implicitDimensionMapping="false">
        <SearchRules type="Order">
          <e2sc:MatchRule target="STATE" value="New">
            <e2sc:AdditionalValues>
              <e2sc:Value>Accepted</e2sc:Value>
              <e2sc:Value>Accepted with Changes</e2sc:Value>
            </e2sc:AdditionalValues>
          </e2sc:MatchRule>
          <e2sc:MatchRule target="PoRequestSchedule.PdfString47" value="1" exclude="true" includeNulls="true"/>
        </SearchRules>
      </OCAggregation>
    </DataMeasure>
  </Transient>
</Computation>
```

### Validation Checklist

- Confirm all `PPFF_COLLAB.*` match sources exist and are spelled exactly.
- Confirm `PdfFloat25`, `RequestQuantity`, and `PdfString47` are valid for the deployed Order subtype schema.
- Confirm SA/Open PO states align with business lifecycle and alert logic.
- When exposing related fields in UI PSDs, add them to both `Fields` and `AvailableFields` sections.

---

---

## Datameasure configuration

### Datameasure Definition
Datameasure definition need to be configured first in 
- tgview_info.txt
- role_tgview_info.txt

### Computation Definition
If the datameasure is a computed datameasure, it needs to be defined inside
- PCMM_Computation_ext.xml

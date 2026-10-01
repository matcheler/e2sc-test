# E2SC RCP – Base Data Measure Configuration Guide

> **Purpose**: This guide helps developers create new base Data Measures (DMs) in E2open SCPM using the RCP framework. A base DM is a Persisted Data Measure defined by a `point_in_time` (PIT) entry.
>
> **Audience**: Technical implementers and developers working on E2open SCPM customizations.
>
> **How to Use**: Share this guide with GitHub Copilot in a new chat to get configuration assistance.

## Table of Contents

1. [Overview](#overview)
2. [File Locations](#file-locations)
3. [Step 1 — Define the Data Measure (point_in_time_schema.txt)](#step-1--define-the-data-measure-point_in_time_schematxt)
4. [Step 2 — Expose the DM in the MCV View (tgview_info.txt)](#step-2--expose-the-dm-in-the-mcv-view-tgview_infotxt)
5. [Step 3 — Configure Role-Based Visibility (role_tgview_info.txt)](#step-3--configure-role-based-visibility-role_tgview_infotxt)
6. [Step 4 — Relabel the DM (AllBundles.properties)](#step-4--relabel-the-dm-allbundlesproperties)
7. [Step 5 — Configure the MCV View (Workflow.properties)](#step-5--configure-the-mcv-view-workflowproperties)
8. [Reload Commands](#reload-commands)
9. [Notes and Constraints](#notes-and-constraints)

---

## Overview

A **base Data Measure (DM)** in E2SC RCP is defined as a **Persisted Data Measure** backed by a `point_in_time` (PIT) record. Each DM:

- Has a name, a data type (`string`, `numeric`, or `double`), and an auto-ID flag.
- Is defined in `point_in_time_schema.txt`.
- Is made visible in the MCV timeline grid via `tgview_info.txt` and `role_tgview_info.txt`.
- Can be relabeled in the UI via `AllBundles.properties`.
- Is included in a Workflow view via `Workflow.properties`.

---

## File Locations

| File | Purpose | E2SC Server Path | Branch Check-in Path |
|------|---------|-----------------|---------------------|
| `point_in_time_schema.txt` | Defines the DM (name, type, autoId) | `/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/point_in_time_schema.txt` | `solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data.append/point_in_time_schema.txt` |
| `tgview_info.txt` | DMs visible in the MCV view | `/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/tgview_info.txt` | `solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data.append/tgview_info.txt` |
| `role_tgview_info.txt` | DMs visible per role | `/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/role_tgview_info.txt` | `solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/role_tgview_info.txt` |
| `AllBundles.properties` | Relabels and formats DM names | `/e2open/app/e2sc/server/cfg/AllBundles.properties` | `solution/project/ssp-ext/E2/e2sc/gap-data/cfg.append/AllBundles.properties` |
| `Workflow.properties` | Defines/configures the MCV view | `/e2open/app/e2sc/server/cfg/Workflow.properties` | `solution/project/ssp-ext/E2/e2sc/gap-data/cfg.append/Workflow.properties` |

> **SSP Reference (requires auth)**:
> - [point_in_time_schema.txt](https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/point_in_time_schema.txt)
> - [tgview_info.txt](https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/tgview_info.txt)
> - [role_tgview_info.txt](https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/role_tgview_info.txt)
> - [AllBundles.properties](https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/cfg.append/AllBundles.properties)
> - [Workflow.properties](https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/cfg.append/Workflow.properties)

---

## Step 1 — Define the Data Measure (point_in_time_schema.txt)

**File**: `solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data.append/point_in_time_schema.txt`

### Column Layout

| Col | Header | Description |
|-----|--------|-------------|
| 0 | `DOMAINNAME` | Domain name — use `broker_domain` |
| 1 | `ORGANIZATIONNAME` | Org name — use `broker_org` |
| 2 | `OWNERURLTYPE` | Owner URL type — use `PPFF` |
| 3 | `CUSUGROUPNAME` | CUSU group — use `default_cusu_group` |
| 4 | `DATAMEASURENAME` | **DM name** (user-defined, unique) |
| 5 | `VALUETYPE` | Data type: `string`, `numeric`, or `double` |
| 6 | `UOM` | Unit of Measure — use `$null` if not applicable |
| 7 | `KEEPHISTORY` | Keep history: `true` or `false` |
| 8 | `READONLY` | Read-only flag (not used): `false` |
| 9 | `AUTOID` | **Auto-generated ID** per PIT: `true` or `false` |
| 10 | `ROLETYPE` | `2` for Supplier DM, `3` for Customer DM |
| 11 | `HASTOTAL` | `0` or `1` |
| 12 | *(trailing)* | Use `$null` |

### autoId Behavior

- `autoId=true` — data measures are **directly editable** in the generic view **and** in the PIT detail view.
- `autoId=false` — PITs are **only editable** in the PIT detail view.
- The PIT ID is generated based on **dates** (default behavior).

### Example Entries

```
broker_domain	broker_org	PPFF	default_cusu_group	MyDmName	double	$null	true	false	false	3	0	$null
```

**All fields are tab-separated.**

### DM Type Guidelines

| Type | When to Use |
|------|------------|
| `double` | Floating-point quantities (inventory, forecast quantities) |
| `numeric` | Integer quantities |
| `string` | Text values (up to 40 characters displayed in MCV by default) |

---

## Step 2 — Expose the DM in the MCV View (tgview_info.txt)

**File**: `solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data.append/tgview_info.txt`

This file defines which DMs are visible in the MCV (Multi-Column View) timeline grid.

### Column Layout

| Col | Header | Description |
|-----|--------|-------------|
| 0 | `DOMAINNAME` | `broker_domain` |
| 1 | `ORGANIZATIONNAME` | `broker_org` |
| 2 | `COLLABTYPE` | `PPFF` |
| 3 | `VIEWNAME` | `GENERIC_AGG_VIEW` or `AGG_VIEW` |
| 4 | `TIMELINEGROUPTYPE` | `PPFF_BUCKET` |
| 5 | `CUSUGROUPNAME` | `default_cusu_group` |
| 6 | `FINALRESULTDATAMEASURE` | DM name (must match column 4 from `point_in_time_schema.txt`) |
| 7 | `DATAMEASUREINDEX` | Display order in the UI — choose a unique integer |
| 8 | `TITLEDATAMEASURE` | UI title for the DM column |
| 9 | `ENABLETOTAL` | `1` to enable totals, `0` to disable |
| 10 | `ENABLESUMMARY` | `1` to show in summary, `0` to hide |
| 11 | `PITGROUPING` | PIT attribute group-by config — use `$null` if none |
| 12–14 | *(trailing)* | Use `$null	0	1` |

> **Index Note**: Maintain indices introduced in `GENERIC_AGG_VIEW` here and ensure the same DM indices are used consistently in `role_tgview_info.txt`.

### Example Entry

```
broker_domain	broker_org	PPFF	GENERIC_AGG_VIEW	PPFF_BUCKET	default_cusu_group	MyDmName	60500	My DM Title	1	1	$null	$null	0	1
```

---

## Step 3 — Configure Role-Based Visibility (role_tgview_info.txt)

**File**: `solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/role_tgview_info.txt`

This file specifies which DMs are visible on the UI **for each role**.

### Column Layout

| Col | Header | Description |
|-----|--------|-------------|
| 0 | `DOMAINNAME` | `broker_domain` |
| 1 | `ORGANIZATIONNAME` | `broker_org` |
| 2 | `ROLENAME` | Role name (e.g., `e2open_super_role`) |
| 3 | `TIMELINEGROUPTYPE` | Timeline group (e.g., `PO_SCHEDULE|DiscreteOrder`) |
| 4 | `CUSUGROUPNAME` | `default_cusu_group` |
| 5 | `FINALRESULTDATAMEASURE` | DM name (must match `point_in_time_schema.txt`) |
| 6 | `DATAMEASUREINDEX` | Display order — must match index from `tgview_info.txt` for `GENERIC_AGG_VIEW` |
| 7 | `TITLEDATAMEASURE` | UI title for the DM |
| 8 | `COLLABTYPE` | `PPFF` |
| 9 | `VIEWNAME` | `GENERIC_AGG_VIEW` or `AGG_VIEW` |
| 10 | `ENABLETOTAL` | `1` to enable totals |
| 11 | `ENABLESUMMARY` | `1` to show in summary |
| 12 | `PITGROUPING` | Use `$null` if none |
| 13 | `UIREADONLY` | `0` = editable, `1` = read-only |
| 14 | `SETPROBLEMREVIEW` | `0` or `1` |

### Example Entry

```
broker_domain	broker_org	e2open_super_role	PPFF_BUCKET	default_cusu_group	MyDmName	60500	My DM Title	PPFF	GENERIC_AGG_VIEW	1	1	$null	0	1
```

---

## Step 4 — Relabel the DM (AllBundles.properties)

**File**: `solution/project/ssp-ext/E2/e2sc/gap-data/cfg.append/AllBundles.properties`

### DM UI Label

To relabel the DM column header in the MCV view, use the `PitDetailList` pattern:

```properties
pc.web.broker_domain.broker_org.default_cusu_group.PitDetailList.MyDmName.PIT_ATTR.DATE_ATTRIBUTE1=Expiry Date
pc.web.broker_domain.broker_org.default_cusu_group.PitDetailList.MyDmName.PIT_ATTR.PIT_ATTRIBUTE21=Vendor Lot
```

> The key format is: `pc.web.<domain>.<org>.<cusuGroup>.PitDetailList.<DmName>.PIT_ATTR.<AttributeName>=<Label>`

### Decimal Format for float/double DMs

To configure the decimal display format for a `double` DM:

```properties
pc.web.DMNumberFormat.MyDmName={_core.number.format.float_}
```

Common format values:

| Format Key | Description |
|-----------|-------------|
| `{_core.number.format.float_}` | Standard float with decimals |
| `{_core.number.format_}` | Integer format (no decimals) |
| `{_core.web.money.pattern_}` | Currency format |

---

## Step 5 — Configure the MCV View (Workflow.properties)

**File**: `solution/project/ssp-ext/E2/e2sc/gap-data/cfg.append/Workflow.properties`

To expose the new DM in a specific MCV workflow view, add it to the `ViewVariants` parameter of the relevant workflow. Locate the workflow property (e.g., `workflow.procFcstVMISearch.url`) and append the DM name to the appropriate `GENERIC_AGG_VIEW` bracket.

### Example — Adding DM to a ViewVariant

```properties
&ViewVariants=GENERIC_AGG_VIEW|160_SUPPLY_INVENTORY_OVERVIEW[Total,Available,Bookedforoutbound,Onhold,Missing,MyDmName]\
```

> Use `\` for line continuation. Do not break the parameter structure.

### Download Filter Synchronization

For the inventory search workflow, keep the related download filter in sync with the `ViewVariants` list. If you add a DM to `workflow.procFcstVMISearch.url`, also update `filter.ioProcVMIInventoryDnloadDmTimelineFilter.url` and append the DM to its `&dataMeasure=` list.

```properties
&dataMeasure=Total,Available,Onhold,Bookedforoutbound,Missing,MyDmName\
```

> If this list is not updated, the DM can appear in the MCV view but still be missing from inventory downloads.

### MCV View Configuration Note

Workflow.properties also allows defining MCV-specific behavior, such as:
- **Tab visibility**: `AllowableTabs=detail,summary,...`
- **Chart configuration**: `DrawChart=...`
- **Allowed problem names**: `PPFF.AllowableProblemNames=...`

---

## Reload Commands

After modifying the files above, run the following reload commands **on the E2SC server** in order:

### 1. Populate core/reader/data files
```bash
. /e2open/app/e2sc/server/bin/rcp_populate_broker_org_incr.sh
```

### 2. Reload AllBundles (if AllBundles.properties was changed)
```bash
. /e2open/app/e2sc/server/bin/reload_allbundles.sh
```

### 3. Reload Workflow (if Workflow.properties was changed)
```bash
. /e2open/app/e2sc/server/bin/reload_workflows.sh
```

### 4. Restart E2SC
> **A full restart of E2SC is required** for DM schema changes to take effect.

---

## Notes and Constraints

- **String DMs**: The MCV UI displays up to **40 characters** by default and auto-adjusts column width. If string DMs need to be displayed as **pop-ups**, additional customization is required.
- **DM Name uniqueness**: The `DATAMEASURENAME` in `point_in_time_schema.txt` must be unique across the dataset.
- **Index consistency**: The `DATAMEASUREINDEX` in `tgview_info.txt` and `role_tgview_info.txt` must match for the same DM in `GENERIC_AGG_VIEW`.
- **Tab-separated values**: All `.txt` data files use **tab characters** as delimiters, not spaces.
- **Trailing columns**: Some rows in `tgview_info.txt` have extra trailing columns (`$null	0	1`) beyond the documented header. Follow the same pattern as existing entries in the project file.
- **`$null`**: Use the literal string `$null` (not empty) for optional fields that are not applicable.
- **autoId and PIT ID**: The PIT ID is generated based on dates by default. Setting `autoId=true` allows direct editing from the generic view; `autoId=false` restricts editing to the PIT detail view only.
- **ROLETYPE**: Use `3` for Customer DMs (sell-side) and `2` for Supplier DMs (buy-side).

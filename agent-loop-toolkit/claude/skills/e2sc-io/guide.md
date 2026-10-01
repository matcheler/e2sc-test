# E2SC IO Config Guide

> **Purpose**: This guide helps developers understand and configure IoDocTypeDef XML files in E2open SCPM — used for upload/download document type definitions.
>
> **Audience**: Technical implementers and developers working on E2open SCPM customizations.
>
> **How to Use**: Share this guide with GitHub Copilot in a new chat to get configuration assistance.

## Table of Contents

1. [Overview](#overview)
2. [File Locations](#file-locations)
3. [DocumentType Structure](#documenttype-structure)
4. [Common Parameters (IoFlatFileHandler)](#common-parameters-ioflatfilehandler)
5. [UI Configurable Downloads (COLLAB_ATTRIBUTES)](#ui-configurable-downloads-collab_attributes)
6. [Supporting Config Files](#supporting-config-files)
7. [Reload Script](#reload-script)

---

## Overview

`IoDocTypeDef` files define **document types** — named upload/download operations that the E2SC platform uses to move data in and out. Each `<DocumentType>` entry specifies:
- What model/data to operate on (`FILE_TYPE`)
- Which direction (`OPERATION_TYPE`: upload or download)
- Which queue to use (`DEFAULT_QUEUE`)
- Which PSD controls the UI column configuration (`DOWNLOAD_PSDSELECTOR`)

All `IoDocTypeDef*.xml` files on the server are **merged at reload time** into a single resolved file:
```
/e2open/app/e2sc/server/xml/IoDocumentTypeDefinitionTransformed.xml
```

---

## File Locations

### Repo (source of truth)
```
solution/project/ssp-ext/E2/e2sc/gap-data/xml.replace/
├── IoDocTypeDef_ext.xml              ← Main custom doctype definitions
├── IoDocTypeDef_ForecastCommit.xml   ← Forecast/commit specific doctypes
└── IoDocTypeDef_*.xml                ← Other model-specific doctypes
```

### Server (deployed/merged)
```
/e2open/app/e2sc/server/xml/
├── IoDocTypeDef_ext.xml
├── IoDocTypeDef_*.xml
└── IoDocumentTypeDefinitionTransformed.xml   ← Merged result (read-only, auto-generated)
```

### Parameter Reference
```
/e2open/app/e2sc/server/xml/IoDocumentTypeParams.xml   ← Full parameter documentation
```

---

## DocumentType Structure

Basic structure of a `<DocumentType>` entry:

```xml
<!-- PROJ-1234 -->
<DocumentType name="MyDocTypeName" domainName="broker_domain" orgName="broker_org">
  <DocumentHandlerClass name="IoFlatFileHandler">
    <Parameters>
      <Parameter name="getDimensionAttributes" value="false"/>
      <Parameter name="FILE_TYPE"              value="COLLAB_ATTRIBUTES"/>
      <Parameter name="FILE_FORMAT"            value="ConfigDownloadExcelServiceTransform"/>
      <Parameter name="OPERATION_TYPE"         value="RETRIEVE"/>
      <Parameter name="DEFAULT_QUEUE"          value="UICollabAttribConfigDownloadQueue"/>
      <Parameter name="UserOnlyView"           value="true"/>
      <Parameter name="DOWNLOAD_PSDSELECTOR"   value="MyDocTypeName"/>
      <Parameter name="PRIORITY"               value="1"/>
      <Parameter name="QUEUEING_THRESHOLD"     value="250"/>
    </Parameters>
  </DocumentHandlerClass>
  <HTTPConfiguration>
    <File type="output" mimeType="application/octet-stream" fileName="MyOutput.xlsx" encoding="UTF-8"/>
    <File type="error"  mimeType="text/plain"               fileName="MyOutput.err"  encoding="UTF-8"/>
  </HTTPConfiguration>
</DocumentType>
```

**Naming convention**: Add new doctypes at the **bottom** of `IoDocTypeDef_ext.xml`, before `</DocumentTypes>`, with a JIRA comment.

---

## Common Parameters (IoFlatFileHandler)

| Parameter | Required | Description |
|-----------|----------|-------------|
| `FILE_TYPE` | ✅ | Model to operate on. Common values: `COLLAB_ATTRIBUTES`, `POINT_IN_TIME`, `RECEIPTS`, `PURCHASE_ORDERS`, `PPFF_COLLAB` |
| `OPERATION_TYPE` | ✅ | `RETRIEVE` (download) or `INSERTORUPDATE` (upload) |
| `FILE_FORMAT` | Optional | `ConfigDownloadExcelServiceTransform` for UI configurable collab attribute downloads; `SPREADSHEET` for PIT downloads |
| `DEFAULT_QUEUE` | Optional | Queue to process the request. Common: `UICollabAttribConfigDownloadQueue` for collab attr downloads |
| `UserOnlyView` | Optional | `true` = only submitting user sees status/results |
| `DOWNLOAD_PSDSELECTOR` | Optional | Must match the PSD selector name in `PCMM_PageSectionDefinitions_ext.xml`. Required for UI-configurable downloads |
| `PRIORITY` | Optional | Processing priority (lower = higher priority). Default: `1` |
| `QUEUEING_THRESHOLD` | Optional | Record count threshold above which download is async. Default: `250` |
| `getDimensionAttributes` | Optional | `false` to exclude dimension attributes from download |
| `IS_DELTA` | Optional | `1` = only changed records, `0` = all records |

---

## UI Configurable Downloads (COLLAB_ATTRIBUTES)

This is the pattern used for **"Download" buttons on collab selectors** (e.g. Risk Event, MTIM, T2VVSIA views).

### Full setup checklist

When adding a new UI configurable download, ALL of these must be configured:

#### 1. IoDocTypeDef — `xml.replace/IoDocTypeDef_ext.xml`
Add the `<DocumentType>` block (see template above). The `DOWNLOAD_PSDSELECTOR` value must match the PSD name prefix.

#### 2. PCMM PSDs — `xml.replace/PCMM_PageSectionDefinitions_ext.xml`
Add 4 `<PageSectionDefinition>` blocks (Customer, Supplier, Broker, E2Admin) with `type.ref="ConfigDownloadCollabAttribute"`. See `prompts/e2sc_pcmm_configuration_guide.md` for the full PSD structure and template.

#### 3. exe_psd_mapping — `datasets/SCCGeneric/exe/reader/data.append/exe_psd_mapping.txt`
Add 4 tab-separated rows (one per role variant):

```
broker_domain	broker_org	default_cusu_group	Collab	PPFF	ConfigDownloadCollabAttribute	MyDocTypeName_Customer	$null	3	MyDocTypeName
broker_domain	broker_org	default_cusu_group	Collab	PPFF	ConfigDownloadCollabAttribute	MyDocTypeName_Supplier	$null	2	MyDocTypeName
broker_domain	broker_org	default_cusu_group	Collab	PPFF	ConfigDownloadCollabAttribute	MyDocTypeName_Broker	$null	5	MyDocTypeName
broker_domain	broker_org	default_cusu_group	Collab	PPFF	ConfigDownloadCollabAttribute	MyDocTypeName_E2Admin	e2open_super_role	$null	MyDocTypeName
```

#### 4. role_info — `datasets/SCCGeneric/core/reader/data.append/role_info.txt`
Grant doctype permission to roles:

```
broker_domain	broker_org	Global_Analyst	doctype	MyDocTypeName	1
broker_domain	broker_org	Global_Analyst_Viewer	doctype	MyDocTypeName	1
broker_domain	broker_org	e2open_super_role	doctype	MyDocTypeName	1
```

#### 5. AllBundles.properties — `cfg.append/AllBundles.properties`
Add label for the download button and view:

```properties
core.web.io.DocumentType.MyDocTypeName.description=My Download Label
pc.web.broker_domain.broker_org.default_cusu_group.ConfigDownloadCollabAttribute.defaultView1_MyDocType=My View Label
```

#### 6. Workflow.properties — `cfg.append/Workflow.properties`
Wire the `BulkIoButtons` into the target `filter.*Selector.url`:

```properties
&BulkIoButtons=Download[DocTypes=MyDocTypeName[UICollabAttribConfigDownloadQueue]]\
```

Add this line to each `filter.*VMISearchSelector.url` or `filter.*SearchSelector.url` where the Download button should appear.

---

## Supporting Config Files

| File | Purpose |
|------|---------|
| `exe_psd_mapping.txt` | Maps PSD names to doctype selectors; loaded into `PAGE_SECTION_DEF_MAPPING` table |
| `role_info.txt` | Grants roles access to doctypes; loaded into `ROLE_INFO` / `role_info_vw` |
| `AllBundles.properties` | UI labels for doctype button and view name |
| `Workflow.properties` | Wires BulkIoButtons into selector filter URLs |

> **Important**: `exe_psd_mapping.txt` and `role_info.txt` are **dataset files** — they are loaded into the DB by the data installer, not by the IoDocTypeDef reload script. For dev testing, insert directly into `PAGE_SECTION_DEF_MAPPING` and run the data installer for production.

---

## Reload Script

Any changes to `IoDocTypeDef*.xml` require:

### 1. Copy file to server and reload
```bash
bash scripts/reload_iodoctypedef.sh
```

Or for a single file:
```bash
bash scripts/reload_iodoctypedef.sh IoDocTypeDef_ext.xml
```

### 2. Verify after reload
After running the reload script, confirm your entry is present in the merged output file:
```bash
eoadmin grep "MyDocTypeName" /e2open/app/e2sc/server/xml/IoDocumentTypeDefinitionTransformed.xml
```
If no output, check that the source XML was copied to the server before reloading.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Unexpected Exception null` in `DownloadConfigurator.jsp` | `DOWNLOAD_PSDSELECTOR` value doesn't match any loaded PSD, OR the IoDocTypeDef XML hasn't been reloaded | Fix value, run `reload_iodoctypedef.sh` |
| Download button doesn't appear | `BulkIoButtons` not wired in the correct `filter.*Selector.url` in `Workflow.properties` | Add `&BulkIoButtons=Download[DocTypes=MyDocTypeName[...]]` to the correct selector filter |
| Download button appears but throws role error | `role_info.txt` entries not loaded into DB | Insert rows into `role_info` table or run data installer |
| Configurator shows but no columns | `exe_psd_mapping.txt` entries not in DB (`PAGE_SECTION_DEF_MAPPING` empty) | Insert rows or run data installer |

---
description: "Reference guide for e2na EBL configuration in e2open SSP projects. Covers what EBL files are, their roles, how to add new flows (routes, scenarios, support files), and project structure."
---

# e2na EBL Configuration Guide

## What is EBL?

EBL (E2open Business Language) is a declarative DSL used by the e2open platform to define B2B integration configuration — partners, messages, protocols, routing rules, and scenarios. All EBL files typically live under:

```
<project>/e2na/ebl/
```

> **Note:** All `.ebl` files are marked `AUTO GENERATED FILE`. They are managed in source control and deployed to the platform via the build/install pipeline — **do not edit directly on the platform**.

---

## Project Hierarchy: ssp → ssp-ext

EBL configuration follows a two-layer override model. Both layers live on the **e2na box, `<e2na-host>`** (from the current project's row in `~/.claude/loop/servers.md`; it may be the same box as `<e2sc-host>` or a separate one):

| Layer | Path | Role |
|-------|------|------|
| **ssp** (base) | `/e2open/app/projects/ssp/E2/e2na/ebl/` | Product defaults. Contains the full baseline EBL config (~10K line `start.ebl`, all base support files, scenarios, routes). |
| **ssp-ext** (project override) | `/e2open/app/projects/ssp-ext/E2/e2na/ebl/` | Project-specific additions/overrides. `start.ebl` begins with `uses "ssp.E2"` to inherit the base layer. |

**Rule:** If a file exists in `ssp-ext`, it takes precedence. If not, the `ssp` version is used.

Source-controlled project files live under:
```
solution/project/ssp-ext/E2/e2na/ebl/
```
Changes here are deployed to `ssp-ext` via `p2c`.

---

## EBL File Structure

| File | Purpose |
|------|---------|
| `start.ebl` | **Master entry point.** Sets global flags, imports base layer (`uses "ssp.E2"`), registers ALL support files via `add supportFile`, then at the very end `include`s all other `.ebl` files. |
| `partners.ebl` | Defines trading partners and their server principals (e.g. DX network, Supplier, etc.). |
| `protocols.ebl` | Defines transport protocols (e.g. network). Often minimal in SSP projects. |
| `profiles.ebl` | Partner communication profiles per environment (`dev`, `qa`, `staging`, `production`). References `profile/details/*.xml` for environment-specific connection details. |
| `messages.ebl` | Defines all B2B message types. Each has a `type`, `version`, `interactionType`, and `specificationType`. |
| `groups.ebl` | Groups messages into `messageGroup` sets. Groups are referenced by routes via `sendMessageGroup` / `receiveMessageGroup`. |
| `scenarios.ebl` | Defines upload/download **scenarios** — each scenario names a processing pipeline (via an XML spec file) and lists the `supportFileLink` config files it needs. |
| `routes.ebl` | Defines the **routes** that wire everything together — which partner sends which messageGroup, to which receiver, using which scenario. |
| `projects.ebl` | Lists the `supportFileLink` registrations at the project level (references to all support files used across the project). |

### start.ebl — Master Entry Point

`start.ebl` is the single entry point that loads everything. Its structure:

```ebl
ebl "2.0.0";

// 1. Global flags
doRedirectToRedirectRouting = "false";
tpConsoleChecking = "true";

// 2. Inherit base layer
uses "ssp.E2";

// 3. Register all support files (bulk of the file)
add supportFile "MyManifestFile"
{
    description = "My Manifest File";
    type = "XML";
    contents = FILE_OBJECT("support_file/my-manifest.xml");
} //support file

add supportFile "schedules"
{
    description = "e2na scheduler configuration";
    type = "e2naScheduleConfiguration";
    contents = FILE_OBJECT("support_file/schedules.xml");
} //support file

// Special types:
//   XML                      — config/manifest XML files
//   OTHER                    — binary files (xlsx templates)
//   TXT                      — plain text
//   e2naScheduleConfiguration — scheduler XML (schedules.xml, mtim-schedules.xml, lts-schedules.xml)
//   e2naProcessQueueConfiguration — queue config
//   log4jConfiguration        — logging config

// 4. Include all other EBL files (at the very end)
include "partners.ebl";
include "protocols.ebl";
include "messages.ebl";
include "profiles.ebl";
include "scenarios.ebl";
include "groups.ebl";
include "projects.ebl";
include "routes.ebl";
```

> **When you add a new support file**, you must add an `add supportFile` entry to `start.ebl` AND a matching `add supportFileLink` inside the relevant scenario in `scenarios.ebl`. The support file name must match exactly between `start.ebl` and `scenarios.ebl`.

### Supporting directories

| Directory | Contains |
|-----------|---------|
| `ebl/scenario/specification/` | XML scenario pipeline files (e.g. `pndHubUploadScenario.xml`) — define the processing steps (acquire, transform, savedata, etc.). |
| `ebl/message/specification/` | XML message schema/view files (e.g. `SV-PndHub.xml`). |
| `ebl/support_file/` | XML flat-file config files, manifest files, groovy scripts, templates — referenced by scenarios as `supportFileLink`. |
| `ebl/profile/details/` | Per-environment connection XML files (partner IDs, server principals). |
| `solution/groovy_handlers/` | **GroovyHandler scripts** (`<handler>` tag). Resolved by name — no EBL registration needed. No `p2c` on change. |
| `solution/groovy/` | General-purpose Groovy scripts. Not EBL-registered. Referenced by full absolute path in `configFile`. No `p2c` on change. |

---

## Groovy Scripts

There are **two completely different Groovy execution models** in E2NA. They have different invocation syntax, different script bindings, and different deployment rules.

---

### Pattern 1: GroovyHandler (`<handler>`) — DataSource API

**Invoked with:** `<handler class="com.e2open.ssp.e2na.handler.GroovyHandler" scriptFile="MyHandler.groovy"/>`

Script lives in: `solution/groovy_handlers/` (project override) or `ssp/E2/solution/groovy_handlers/` (base)

**NOT registered in `start.ebl`** — no `p2c` needed on change.

#### Script Search Path (Resolution Order)

When `scriptFile="MyHandler.groovy"` is specified, GroovyHandler resolves it in this order:

1. As a registered **support file name** linked to the scenario in `scenarios.ebl`
2. Filesystem: `ssp-ext/E2/solution/groovy_handlers/` (project override)
3. Filesystem: `ssp/E2/solution/groovy_handlers/` (product base)

> **Inline scripts** are also supported via the `script="..."` attribute — suitable only for Groovy one-liners. Not commonly used.

#### Script Bindings

| Variable | Type | Description |
|----------|------|-------------|
| `context` | `Map<String,String>` | All XML attributes from the `<handler>` tag. Use to read script parameters. |
| `data` | `DataSource` | Current transaction data source — holds the main file, properties, and attachments. |
| `output` | `List<DataSource>` | Output list. The script **must** explicitly call `output.add(out)` to pass data forward. |
| `supportFiles` | `Map<String,File>` | Support files linked to the scenario (keyed by support file name). Read-only. |
| `dataNum` | `int` | Zero-based index of the current data source in the input list. |

GroovyHandler runs for **each** input data source. It can split or merge data sources by adding/removing items from `output`.

#### Common Patterns

```groovy
// Read script parameters (from handler XML attributes)
def myParam = context['myParam']

// Read datasource / system properties
def tz = data.getProperty("Timezone", "GMT")            // datasource property (with default)
def sysProp = System.getProperty("ssp.some.property")   // JVM system property

// Access a support file linked to the scenario
def template = supportFiles['TemplateSupportFileName']   // java.io.File (read-only)

// Process main file: read input → write transformed output
def inputFile = data.getFile()
def out = data.getCopy()           // copy datasource metadata
def outputFile = out.getSaveFile() // create new output file path
// ... transform inputFile => outputFile ...
out.put(outputFile)                // set new file as main data file
out.save()
output.add(out)                    // required: commit to output list

// Work with attachments (input/output names are optional handler params)
def dataIn  = (context['input']  != null) ? data.getAttachment(context['input'])   : data
def dataOut = (context['output'] != null) ? out.createAttachment(context['output']) : out

// Split one data source into multiple (e.g. per-supplier or per-record-type split)
inputFile.eachLine { line ->
    if (isSplitPoint(line)) {
        def splitOut  = data.getCopy()
        def splitFile = splitOut.getSaveFile()
        splitOut.put(splitFile); splitOut.save()
        output.add(splitOut)
        writer = splitFile.withPrintWriter()
    }
    writer?.println(line)
}
```

---

### Pattern 2: Groovy Transform (`<transform type="groovy">`) — Streaming

**Invoked with:**
```xml
<!-- Using a registered support file name (preferred) -->
<transform type="groovy" configFile="MyGroovyConfigFile1.0" attachment="output.txt" />

<!-- Using an absolute path (for scripts not registered in start.ebl) -->
<transform type="groovy" configFile="/e2open/app/projects/ssp-ext/E2/e2na/ebl/support_file/myScript.groovy" />
```

Script lives in: `ebl/support_file/` — it is a **streaming transform** script, not a handler.

**Registration in `start.ebl`** (when using support file name): registered with `type = "TXT"`:
```ebl
add supportFile "MyGroovyConfigFile1.0"
{
    description = "My Groovy Transform Config 1.0";
    type = "TXT";
    contents = FILE_OBJECT("support_file/myGroovyTransform.groovy");
} //support file
```

When called with an absolute path (not registered), **no `start.ebl` entry** is needed but changes still require `p2c` since the file is in `support_file/`.

#### Script Bindings

| Variable | Description |
|----------|-------------|
| `reader` | `BufferedReader` — reads the input data file line by line. |
| `writer` | `PrintWriter` — writes transformed output (becomes the new data file or attachment). |
| `inprops` | `Map` — datasource properties (read). Use `inprops['propName'] ?: "default"`. |
| `outprops` | `Map` — datasource properties (write-back). Rarely used. |
| `props` | `Map` — transform-level properties. Rarely used. |

> **Key difference:** No `data`, `output`, or `context`. This is a pure streaming transform — you read from `reader`, process, write to `writer`. Cannot split/merge data sources.

#### Common Pattern

```groovy
/* Groovy Helper Variables
 *   props    = transform properties
 *   inprops  = datasource properties
 *   outprops = datasource properties (write-back)
 *   reader   = input stream
 *   writer   = output stream
 */

// Read datasource properties
def scpmRole = inprops['scpmws.role'] ?: ""
def custSite = inprops['CustSiteFromFilename'] ?: "UNKNOWN"

// Read system properties
def hubCompanyId = System.getProperty("e2.ssp.hub.company.id")

// Write output header
writer.println('SelfDescribingFormat v1.1')
writer.println("###ROLE=${scpmRole}")

// Process input file line by line
reader.eachLine { line ->
    if (line.startsWith('#') || line.trim().isEmpty()) return  // skip comment/header lines
    def cols = line.split("\t", -1)
    // ... transform cols ...
    writer.println(cols.join("\t"))
}
```

---

### Summary: Which Pattern to Use?

| Scenario | Use |
|----------|-----|
| Filter/split data sources, DB lookup, set datasource properties | `<handler>` + GroovyHandler in `groovy_handlers/` |
| Stream-transform a flat file (line-by-line read/write) | `<transform type="groovy">` + support file in `support_file/` |
| Need access to datasource properties in a transform | `<transform type="groovy">` — use `inprops` |
| Need attachment output from a transform | `<transform type="groovy" attachment="out.txt">` |

---

## Key Concepts

### Route
A route wires a **sender group** → **receiver group** using a specific **scenario** for a given **message group**.

```ebl
add route "route.9999222222222222220"
{
    description = "Receive PndHub from Customer";
    alias = "PndHubUploadUIAlias";           // UI display name (optional)
    sendProfileGroup = "Customer Group";
    receiveProfileGroup = "SCPM SCPMWS Static Group";
    sendMessageGroup = "PndHub";             // references a messageGroup in groups.ebl
    receiveMessageGroup = "SCPM";
    scenario = "PndHub Upload Scenario";     // references a scenario in scenarios.ebl
    type = "Abstract";                       // Abstract = not auto-instantiated
} //route
```

All routes live inside:
```ebl
in partner "@e2.ssp.hub.company.name@"
{
    in project "@e2.ssp.hub.name@"
    {
        // routes here
    }
}
```

### Scenario
A scenario defines the processing pipeline for a message type and lists all config support files it needs.

```ebl
add scenario "PndHub Upload Scenario"
{
    description = "PndHub Upload Scenario";
    specificationVersion = "1.0";
    specificationType = "e2na";
    specification = FILE_OBJECT("scenario/specification/pndHubUploadScenario.xml");

    add supportFileLink "PndHubManifestFile"
    {
        supportFileName = "PndHubManifestFile";
    } //support file link

    add supportFileLink "PndHubDomainUploadConfigFile1.0"
    {
        supportFileName = "PndHubDomainUploadConfigFile1.0";
    } //support file link
    // ... more support file links
} //route scenario
```

The `specification` XML file (in `scenario/specification/`) defines the actual processing steps.

> **Full tag reference:** [Scenario File Tags — Confluence](https://confluence.dev.e2open.com/display/174DOC/Scenario+File+Tags)

### Scenario Specification XML — Tag Reference

| Tag | Purpose |
|-----|---------|
| `<acquire queue="...">` | Queue-based synchronization lock. Blocks subsequent transactions until `<release>` is hit. Must always have a matching `<release>` in both normal flow and `<exception>` block. |
| `<release>` | Releases the lock acquired by `<acquire>`. Also used inside `<match>` blocks. |
| `<log logType="...">` | Logs a message to the transaction view / `e2na.log`. Used for debugging and visibility. |
| `<set key="value">` | Sets one or more datasource properties. Supports `${property}` substitution. Use `setIfExists="propName"` to set only if the property already exists. |
| `<handler class="...">` | Invokes a custom Java or Groovy handler. For Groovy: `class="com.e2open.ssp.e2na.handler.GroovyHandler" scriptFile="MyHandler.groovy"`. Additional attributes are passed as handler parameters. |
| `<transform type="...">` | Runs a transform. Types: `groovy`, `flatV2`, `flat`, `flexcdm`, `excel` (`excel2Flat`/`flat2Excel`), `java`, `xslt`, `xml`. Use `configFile` for support file config or full path for groovy scripts. Use `attachment` to write output as an attachment. **Excel transforms** (`excel2Flat`/`flat2Excel`) delegate to the external **Monarch service** for Excel-to-flat-file conversion — requires Monarch to be running. |
| `<loadfile supportfile="..." attachment="...">` | Loads a registered support file into the datasource (optionally as a named attachment). Used before `<transform>` that needs a manifest or config file. |
| `<loadprofile>` | Reloads the B2B connection profile after changing `toDuns`, `fromDuns`, `dataType`, or `version`. Also switches the running scenario to match the new datasource properties. |
| `<conditional>` | Parent for branching logic. Child tags: `<test>`, `<and>`, `<or>`, `<not>`, `<default>`. Each datasource is tested separately. |
| `<test attr="val">` | Executes enclosed steps only if datasource property matches. `<default>` always matches. |
| `<and>` / `<or>` | Multi-attribute variants of `<test>` (all must match vs any must match). |
| `<not>` | Inverts the sense of an inner `<and>` test. |
| `<drop>` | Returns an empty list — stops processing of this datasource. Used with `<release>` to abort cleanly. |
| `<complete>` | Terminates the scenario immediately. No attributes. |
| `<stop>` | Aborts the running state. |
| `<exception>` | Defines processing for failed datasources after the normal flow completes. Always include a `<release>` here if `<acquire>` is used. |
| `<savedata name="...">` | Saves current datasource list under a name for later retrieval. |
| `<loaddata name="...">` | Restores a previously saved datasource list. Use `appendEvents="true"` to append instead of replace. |
| `<appenddata name="...">` | Appends a saved datasource list to the end of the current list. |
| `<removedata name="...">` | Removes a saved datasource list. |
| `<parallel>` | Executes child events against the same input list; results are merged. Each child gets the full input and contributes to the output. |
| `<serial>` | Chains events sequentially inside a `<parallel>` block. Output of one step is input to the next. |
| `<sendandwaitfor>` | Sends the datasource and waits for a matching response/acknowledgement. Attributes: `addWaitInput`, `addMatchInput`, `abortOnError`, `timeout`. |
| `<waitfor>` | Waits for a single matching event (no send). Used inside `<parallel>` to synchronize threads. |
| `<blockforwait>` | Blocks execution until a parallel thread's `<waitfor>` completes. Only valid inside `<parallel>`. |
| `<match transactionId="..." msgtype="...">` | Specifies the matching criteria inside `<sendandwaitfor>` or `<waitfor>`. |
| `<download type="scpmws" ...>` | Performs a scheduled download. Attributes: `name`, `partner`, `profile`, `message`, `parameters`, `toDuns`, `fromDuns`, `timeout`. |
| `<send>` | Sends the datasource based on the destination connection. |
| `<validate type="...">` | Validates inbound/outbound message. Types: `xsd`, `flatV2`, `excel`, `java`, etc. Only use in validation scenarios. |
| `<globalset property="..." value="...">` | Sets a global property accessible across all scenarios. |
| `<globalget property="..." defval="...">` | Gets a global property value (with optional default). |
| `<globalremove property="...">` | Removes a global property. |
| `<split>` / `<join>` | Splits a large datasource into chunks for parallel processing, then rejoins. Supports `recordBytes`, `recordCount`, `columns`, `delimiter`. |
| `<delay>` | Pauses execution. Use `timeout="H:M:S"` or `delay="N" delay-unit="msecs\|seconds\|minutes\|hours"`. |
| `<createqueue>` / `<destroyqueue>` | Dynamically creates/destroys a process queue. |
| `<startqueue>` / `<stopqueue>` | Starts/stops a configured queue. |
| `<reroute>` | Switches to a new scenario based on current `toDuns`/`fromDuns`/`dataType`/`version`. Current scenario stops. |
| `<lookup propfile="..." defkey="..." defval="...">` | Looks up a property value from a registered support file (property file). |
| `<addenvelope xpath="..." tagName="...">` | Wraps an extracted XML element with a new parent tag. |
| `<removeenvelope xpath="...">` | Removes an XML wrapper element, promoting its children. |

### Scenario Specification XML — Example (Upload)

```xml
<scenario name="fooUploadScenario" version="1.0">

    <!-- Accept message from queue -->
    <acquire queue="${dataType}" />

    <!-- Log a message (appears in e2na.log) -->
    <log logType="Start processing Foo upload" />

    <!-- Set a variable -->
    <set isB2BUpload="true" />
    <!-- Set only if variable exists -->
    <set comment="${uniqueId}" setIfExists="uniqueId" />

    <!-- Call a GroovyHandler (from solution/groovy_handlers/) -->
    <handler class="com.e2open.ssp.e2na.handler.GroovyHandler" scriptFile="MyHandler.groovy"/>

    <!-- Groovy transform (from support_file/ or absolute path) -->
    <transform type="groovy" configFile="/e2open/app/projects/ssp-ext/E2/e2na/ebl/support_file/myScript.groovy"/>

    <!-- Load manifest and run flat-file transform -->
    <loadfile supportfile="FooManifestFile" attachment="manifest.xml" />
    <transform type="flatV2" configFile="FooUploadConfigFile1.0" attachment="broker_point_in_time.txt" />

    <!-- FlexCDM transform -->
    <transform type="flexcdm" />

    <!-- Conditional branching -->
    <conditional>
        <test someVar="UNDEFINED">
            <log logType="Dropping - no data" />
            <release />
            <drop />
        </test>
    </conditional>

    <!-- Save/restore message data across parallel branches -->
    <savedata name="originalData"/>
    <serial>
        <loaddata name="originalData"/>
        <!-- ... process branch ... -->
    </serial>

    <!-- Send to SCPMWS and wait for acknowledgement -->
    <set dataType="SCPM" />
    <set scpmws.dataType="FooUpload" />
    <sendandwaitfor addWaitInput="true" addMatchInput="false"
        abortOnError="true" timeout="${ssp.upload.timeout}">
        <match transactionId="${transactionId}" msgtype="Acknowledgement" dataType="${dataType}">
            <release />
        </match>
    </sendandwaitfor>

    <exception>
        <release />
    </exception>

</scenario>
```

### Scenario Specification XML — Example (Scheduled Download)

```xml
<scenario name="fooDownloadScenario" version="1.0">

    <acquire queue="E2-DOWNLOAD-QUEUE" />

    <set dataType="SCPM" />
    <set scpmws.dataType="FooDownload" />

    <download type="scpmws" name="FooDownload"
        partner="${e2.ssp.hub.company.name}"
        profile="SCPM SCPMWS Dynamic Profile"
        message="FooDownload"
        parameters="IS_DELTA=0"
        toDuns="${e2.ssp.hub.company.id}-SupplierNetwork"
        fromDuns="${e2.ssp.hub.company.id}">
        <match transactionId="${transactionId}" msgtype="Acknowledgement" />
    </download>

    <exception>
        <release />
    </exception>

</scenario>
```

### Message
```ebl
add message "PndHub"
{
    description = "PndHub";
    type = "PndHub";
    version = "1.0";
    interactionType = "DistributeInformation";
    specificationType = "e2na";
    specificationVersion = "1.0";
    payloadType = "E2open SSP CDM";
} //msg
```

### Message Group
Groups one or more messages. Referenced by routes via `sendMessageGroup` / `receiveMessageGroup`.

```ebl
add messageGroup "PndHub"
{
    add element "PndHub/request"
    {
        message = "PndHub";
        queryResponseType = "request";
    } //msg grp elem
} //msg grp
```

---

## How to Add a New Upload/Download Flow

To add a new scenario (e.g. "Foo Upload"), you need to touch **5 things**:

### 1. `messages.ebl` — add the message type
```ebl
add message "Foo"
{
    description = "Foo";
    type = "Foo";
    version = "1.0";
    interactionType = "DistributeInformation";
    specificationType = "e2na";
    specificationVersion = "1.0";
    payloadType = "E2open SSP CDM";
} //msg
```

### 2. `groups.ebl` — add a message group
```ebl
add messageGroup "Foo"
{
    add element "Foo/request"
    {
        message = "Foo";
        queryResponseType = "request";
    } //msg grp elem
} //msg grp
```

### 3. `scenario/specification/fooUploadScenario.xml` — create the pipeline XML
Define the processing steps. See [Scenario Specification XML — Common Elements](#scenario-specification-xml--common-elements) above.

> **Ask the user:** Does this flow need custom data transformation or lookup logic? If yes, a Groovy handler in `solution/groovy_handlers/` may be needed. Common use cases: filtering supplier IDs, DB lookups, transforming collab data format, setting dynamic properties.

### 4. `scenarios.ebl` — register the scenario + its support files
```ebl
add scenario "Foo Upload Scenario"
{
    description = "Foo Upload Scenario";
    specificationVersion = "1.0";
    specificationType = "e2na";
    specification = FILE_OBJECT("scenario/specification/fooUploadScenario.xml");

    add supportFileLink "FooManifestFile"
    {
        supportFileName = "FooManifestFile";
    } //support file link

    add supportFileLink "FooUploadConfigFile1.0"
    {
        supportFileName = "FooUploadConfigFile1.0";
    } //support file link
} //route scenario
```

### 5. `start.ebl` — register new support files

For every new support file created in `ebl/support_file/`, add an entry to `start.ebl`:

```ebl
add supportFile "FooManifestFile"
{
    description = "Foo Manifest File";
    type = "XML";
    contents = FILE_OBJECT("support_file/foo-manifest.xml");
} //support file

add supportFile "FooUploadConfigFile1.0"
{
    description = "Foo Upload Flat File Config 1.0";
    type = "XML";
    contents = FILE_OBJECT("support_file/foo-upload-flat-file-config-1.0.xml");
} //support file
```

### 6. `routes.ebl` — add the route
```ebl
add route "route.<unique-id>"
{
    description = "Receive Foo from Customer";
    alias = "FooUploadUIAlias";
    sendProfileGroup = "Customer Group";
    receiveProfileGroup = "SCPM SCPMWS Static Group";
    sendMessageGroup = "Foo";
    receiveMessageGroup = "SCPM";
    scenario = "Foo Upload Scenario";
    type = "Abstract";
} //route
```

---

---

## Scheduler XML

Three scheduler files, all registered in `start.ebl` with type `e2naScheduleConfiguration`:

| File | Registered Name | Purpose |
|------|-----------------|---------|
| `support_file/schedules.xml` | `"schedules"` | General/base schedules |
| `support_file/mtim-schedules.xml` | `"mtim-schedules"` | MTIM-specific schedules |
| `support_file/lts-schedules.xml` | `"lts-schedules"` | LTS-specific schedules |

### Structure

```xml
<schedule-configuration>

    <!-- GLOBAL: reusable timing groups -->
    <global>

        <!-- Never fire (disabled schedule) -->
        <timing-group name="myNotScheduled">
            <timing type="never" name="neverFire-timer" description="Never Fire">
            </timing>
        </timing-group>

        <!-- Cron-based timing group (Quartz 6-field: sec min hr dom mon dow) -->
        <timing-group name="myDailyTimingGroup0700am">
            <timing type="cron" name="myDailyTimingGroup0700am-timer"
                    description="Fire once a day at 07:00am UTC">
                <details expression="0 0 7 * * ?" />
            </timing>
        </timing-group>

        <!-- With timezone -->
        <timing-group name="myDailyTimingGroup0900amET">
            <timing type="cron" name="myDailyTimingGroup0900amET-timer"
                    description="Fire once a day at 9:00am ET">
                <details expression="0 0 9 * * ?" timeZone="US/Eastern"/>
            </timing>
        </timing-group>

    </global>

    <!-- GROUPS: group related schedules -->
    <group name="My Profile Group" description="My download schedules">

        <!-- Simple scheduled download -->
        <schedule name="MySimpleDownload" description="My Simple Download" overlapExecution="false">
            <timing-group ref="myDailyTimingGroup0700am" />
            <scenario enableAudit="true" hideOnComplete="true"
                xmlns:ds="http://www.e2open.com/e2na/datasource/property"
                ds:dataType="MyMessage"
                ds:version="1.0"
                ds:toDuns="${e2.ssp.hub.company.id}"
                ds:fromDuns="${e2.ssp.hub.company.id}">
                <acquire queue="E2-DOWNLOAD-QUEUE" />
                <download type="scpmws" name="MySimpleDownload"
                    partner="${e2.ssp.hub.company.name}"
                    profile="SCPM SCPMWS Dynamic Profile"
                    message="MyMessage"
                    toDuns="${e2.ssp.hub.company.id}"
                    fromDuns="${e2.ssp.hub.company.id}"
                    timeout="${ssp.upload.timeout}">
                    <match transactionId="${transactionId}" msgtype="Acknowledgement" />
                </download>
            </scenario>
        </schedule>

        <!-- Supplier-filtered download (reads supplier IDs from DownloadFilters.prop) -->
        <schedule name="MySupplierDownload-US" description="My Supplier Download (US Region)" overlapExecution="false">
            <timing-group ref="myDailyTimingGroup0230pm" />
            <scenario enableAudit="true" hideOnComplete="true"
                xmlns:ds="http://www.e2open.com/e2na/datasource/property"
                ds:dataType="MyForecastDownloadB2b"
                ds:version="1.0"
                ds:toDuns="${e2.ssp.hub.company.id}-SupplierNetwork"
                ds:fromDuns="${e2.ssp.hub.company.id}"
                ds:uniqueId="Supplier Download: My US">
                <acquire queue="E2-DOWNLOAD-QUEUE" />
                <!-- Lookup supplier IDs from DownloadFilters.prop using the lookupKey -->
                <log logType="Start SetDataSourcePropertyFromLookup.groovy" />
                <handler class="com.e2open.ssp.e2na.handler.GroovyHandler"
                    scriptFile="SetDataSourcePropertyFromLookup.groovy"
                    lookupFileName="/e2open/app/projects/ssp-ext/E2/e2na/ebl/support_file/DownloadFilters.prop"
                    lookupKey="MySupplierDownload-US.supplier"/>
                <log logType="End SetDataSourcePropertyFromLookup.groovy" />
                <log logType="Found supplier=${MySupplierDownload-US.supplier}" />
                <!-- Drop if no suppliers found -->
                <conditional>
                    <test MySupplierDownload-US.supplier="UNDEFINED">
                        <log logType="Dropping the scenario" />
                        <release />
                        <drop />
                    </test>
                </conditional>
                <set scpmws.queue="PITB2BDownloadQueue" />
                <download type="scpmws" name="MyForecastDownload"
                    partner="${e2.ssp.hub.company.name}"
                    profile="SCPM SCPMWS Dynamic Profile"
                    message="MyForecastDownload"
                    parameters="IS_DELTA=0;DELTA_TYPE=COLLAB-DM;DataMeasures=DailyDemand^WeeklyDemand;PARTITION_NAME=DailyDemand^WeeklyDemand;supplier=${MySupplierDownload-US.supplier}"
                    toDuns="${e2.ssp.hub.company.id}-SupplierNetwork"
                    fromDuns="${e2.ssp.hub.company.id}">
                    <match transactionId="${transactionId}" msgtype="Acknowledgement" />
                </download>
            </scenario>
        </schedule>

    </group>

</schedule-configuration>
```

### Quartz Cron Reference (6-field)

```
sec  min  hr   dom  mon  dow
 0    0    7    *    *    ?    → daily 7:00 AM UTC
 0   30   14    *    *    ?    → daily 2:30 PM UTC
 0    0    0    *    *    ?    → daily midnight UTC
 0    0    9    *    *    ?  US/Eastern → daily 9:00 AM ET
 0    0    0    ?    *   Mon   → weekly Monday midnight
 0    0  0,4,8,12,16,20  *  *  ?  → every 4 hours
```

### Supplier-filtered schedule: support files

If a project needs to filter scheduled downloads by supplier (e.g. regional splits, allow-lists), the standard pattern is:

1. Create one or more `.prop` files in `support_file/` — one for the filter list (mapping schedule name → supplier IDs) and optionally one for ID-to-DUNS translation.
2. Reference them in the `<handler>` call via absolute path (`lookupFileName=`). These files are **not** registered in `start.ebl` — they are loaded directly by the handler at runtime.
3. Use `<conditional>` after the handler to drop the schedule if the lookup returns no suppliers.

The exact file names and property key format are project-specific — check existing `.prop` files in `support_file/` for the project's convention.

---

## Flat-File Validation XML

Validation XML support files define per-column rules for inbound flat files. Referenced in scenarios via the `<validate>` tag:

```xml
<validate type="flatV2" configFile="FooValidationConfigFile1.0" />
```

The `configFile` value matches a support file name registered in `start.ebl` (type `XML`).

> **Version 2.0 is the current standard.** Version 1.0 uses an older attribute-based syntax — only found in legacy flows.
>
> Full reference: [Flat-File Validations v1.0](https://confluence.dev.e2open.com/pages/viewpage.action?pageId=118485774) | [Flat-File Validations v2.0](https://confluence.dev.e2open.com/pages/viewpage.action?pageId=118485775)

### Version 2.0 — Structure

```xml
<validationMetaData>
    <inputDelimiter>\t</inputDelimiter>    <!-- column delimiter; default is tab -->
    <totalColumns>6</totalColumns>         <!-- expected column count -->
    <version>2.0</version>

    <!-- skip header/comment lines (rows starting with these strings) -->
    <validationFilterList>
        <validationFilter><comment>#</comment></validationFilter>
        <validationFilter><comment>Header:</comment></validationFilter>
    </validationFilterList>

    <validationList>

        <!-- STRING column -->
        <validationColumn>
            <inputIndex>0</inputIndex>
            <displayName>ssp.res.erp.customer.item</displayName>  <!-- resource key for error messages -->
            <maxLength>64</maxLength>
            <required>true</required>
            <type>STRING</type>
        </validationColumn>

        <!-- STRING with regex -->
        <validationColumn>
            <inputIndex>1</inputIndex>
            <displayName>ssp.res.erp.code</displayName>
            <maxLength>64</maxLength>
            <regex>^[a-zA-Z0-9-]*$</regex>
            <required>true</required>
            <type>STRING</type>
        </validationColumn>

        <!-- FLOAT with minimum value -->
        <validationColumn>
            <inputIndex>4</inputIndex>
            <displayName>ssp.res.request.quantity</displayName>
            <floatMinValue>0.0</floatMinValue>
            <required>true</required>
            <type>FLOAT</type>
        </validationColumn>

        <!-- DATE column -->
        <validationColumn>
            <inputIndex>5</inputIndex>
            <displayName>ssp.res.request.date</displayName>
            <simpleDateFormat>yyyy-MM-dd'T'HH:mm:ssZ</simpleDateFormat>
            <required>true</required>
            <type>DATE</type>
        </validationColumn>

        <!-- CLASS column — custom handler (e.g. unique key check) -->
        <validationColumn>
            <inputIndex>6</inputIndex>
            <displayName>ssp.res.forecast.version</displayName>
            <maxLength>255</maxLength>
            <type>CLASS</type>
            <callHandler>
                <className>com.e2open.e2na.validate.flat.UniqueKeyValueColumnHandler</className>
                <nameValueList>
                    <nameValue><name>uniqueInputIndexes</name><value>1,3</value></nameValue>
                    <nameValue><name>inputIndex</name><value>6</value></nameValue>
                </nameValueList>
            </callHandler>
        </validationColumn>

    </validationList>
</validationMetaData>
```

### Version 2.0 — `<validationColumn>` Fields

| Element | Required | Description |
|---------|----------|-------------|
| `<inputIndex>` | Y | Zero-based column index. |
| `<type>` | Y | `STRING`, `INTEGER`, `FLOAT`, `DATE`, `CLASS` (custom handler). |
| `<displayName>` | Recommended | Resource bundle key used in error messages (e.g. `ssp.res.erp.code`). |
| `<required>` | N | `true`/`false`. Default: `false`. |
| `<ifCondition>` | N | Makes `required` conditional, e.g. `inputIndex=4 == 0.0000`. |
| `<maxLength>` / `<minLength>` | N | String length limits. |
| `<regex>` | N | Java regex pattern for string validation. |
| `<ignoreCase>` | N | `true` (default) / `false` — for regex case sensitivity. |
| `<simpleDateFormat>` | N | Java `SimpleDateFormat` pattern for DATE type. |
| `<minValue>` / `<maxValue>` | N | Integer bounds. |
| `<floatMinValue>` / `<floatMaxValue>` | N | Float bounds. |
| `<validStrings>` | N | List of valid enum values, separated by `<validStrInputDelim>`. |
| `<callHandler>` | For CLASS type | Custom validator: `<className>` + `<nameValueList>` of params. |

### Version 1.0 — Structure

Version 1.0 uses attribute-based XML tags (one tag = one validation rule). Registered with `type="flat"` (not `flatV2`).

```xml
<!-- Skip comment/empty lines -->
<Filter class="com.e2open.e2na.validate.flat.CommentFilter"/>

<!-- Skip comment lines AND check a specific column value -->
<Filter class="com.e2open.e2na.validate.flat.FieldValueFilter"
    inputIndex="3" fieldValue="New" acceptMatch="true"/>

<!-- Column validators (all take inputIndex attribute) -->
<NotNullColumn inputIndex="0"/>
<MaximumLengthColumn inputIndex="2" length="255"/>
<MinimumLengthColumn inputIndex="2" length="1"/>
<RegexFormatColumn inputIndex="2" regex="^[a-zA-Z0-9-_@]*$"/>
<DateFormatColumn inputIndex="5" format="yyyy-MM-dd"/>
<IntegerColumn inputIndex="38" minValue="0"/>
<NumberColumn inputIndex="80" minValue="0"/>
<UniqueKeyValueColumn inputIndex="6" uniqueInputIndexes="1,3"/>
```

---

## Common Profile Groups

Profile group names vary by project, but these are typical patterns in SSP projects:

| Group Name | Used For |
|------------|----------|
| `Customer Group` | Customer uploads |
| `E2open Customer Group` | E2open internal customer uploads |
| `Supplier Group` | Supplier uploads |
| `SCPM SCPMWS Dynamic Group` | SCPM receiver (dynamic routing) |
| `SCPM SCPMWS Static Group` | SCPM receiver (static routing) |
| `SCPM Download Group` | SCPM sending downloads |
| `Supplier Download Group` | Supplier download receiver |
| `E2open Customer Download Group` | E2open customer download receiver |

---

## Formatting Rules

- **4-space indentation** — no tabs
- One blank line between `} //route` blocks
- No leftover developer comments like `//PROJ-1234` in the final file
- Route IDs (`route.<id>`) must be unique across the file

---

## Branch Strategy

Typically projects use:
- `release/brX.Y` — stable release branches
- `feature/<TICKET>-*` — feature branches off the target release branch

When merging a lower release branch into a feature branch, incoming branch changes go **before** the HEAD-only additions in both `routes.ebl` and `scenarios.ebl`.

---

## Spec Generation (MSE): Excel → .spec → Support Files

The **spec generation** workflow (using the Mapping Spec Editor / MSE tool) converts Excel mapping spec files (`.xls`) into `.spec` XML, then generates EBL support files from those `.spec` files. The scripts are in the `specs/` directory of your project.

### File locations

| Path | Description |
|------|-------------|
| `solution/project/ssp-ext/E2/solution/docs/cdm/` | Source Excel mapping spec files (`*.xls`) |
| `solution/project/ssp-ext/E2/specs/` | Generated `.spec` files + conversion scripts |
| `solution/project/ssp-ext/E2/e2na/ebl/support_file/` | Generated support files (flat-file configs, manifests, groovies) |
| `solution/project/ssp-ext/E2/solution/templates/` | Generated Excel upload templates |
| `solution/project/ssp-ext/E2/solution/resource/` | Generated resource bundles |

### Step 1 — Convert Excel → .spec (single file)

`-fr` requires a **directory**, not a single file. Use a temp directory to target one file:

```bash
mkdir -p /tmp/mse_single
cp solution/project/ssp-ext/E2/solution/docs/cdm/MY_SPEC_Map_Spec.xls /tmp/mse_single/

cd solution/project/ssp-ext/E2/specs
./excel-spec-converter.sh -fr /tmp/mse_single -to .
```

To convert **all** Excel files at once:

```bash
cd solution/project/ssp-ext/E2/specs
./excel-spec-converter.sh -fr ../solution/docs/cdm -to .
```

### Step 2 — Generate support files (single spec)

Use `-fs <filename>` to target one `.spec`. Without this, **all** specs are processed and many unrelated files get regenerated.

```bash
cd solution/project/ssp-ext/E2/specs
./support-files-generator.sh -fs MY_SPEC_Map_Spec.spec -all -udn -d -ow -exTplTp \*
```

To process **all** specs (default):

```bash
./support-files-generator.sh
```

### What gets generated (per spec)

| File | Location |
|------|----------|
| `<name>-upload-flat-file-config-1.0.xml` | `ebl/support_file/` |
| `<name>-manifest.xml` | `ebl/support_file/` |
| `<name>CollabRelationships*.groovy` | `ebl/support_file/` |
| `ssp-<name>-1.0.xls` (upload template) | `solution/templates/` |
| `CPCExtResource.properties` (resource bundle) | `solution/resource/` |

### Step 3 — Copy to server and reload p2c

```bash
EBL_LOCAL=solution/project/ssp-ext/E2/e2na/ebl
EBL_SRV=/e2open/app/projects/ssp-ext/E2/e2na/ebl

scp $EBL_LOCAL/support_file/<name>-upload-flat-file-config-1.0.xml \
    $EBL_LOCAL/support_file/<name>-manifest.xml \
    <e2na-host>:$EBL_SRV/support_file/

ssh <e2na-host> "/e2open/bin/eoadmin 'cd /tmp && /e2open/app/e2na/bin/admin/p2c.sh false'" 2>/dev/null
```

### Notes

- The generators are Java/Ant tools — **run them on `<e2na-host>`**, not locally (local `java.exe` is blocked by app control). The `specs/` tree and the `docs/cdm/*.xls` sources are already deployed on the box.
- Commit both the updated `.xls` and the regenerated `.spec` and `ebl/support_file/` files.
- **Do NOT commit `solution/resource/CPCExtResource.properties`** when using `-fs` (single spec). The generator regenerates it with only that spec's keys, wiping all other specs' entries. Only commit this file when running against **all** specs.
- `.gen` files are temporary backups created when `-ow` is not used — do not commit them. Add `*.gen` to `.gitignore`.
- Always run `support-files-generator.sh` from the `specs/` directory.

# E2SC Logging Analysis Guide

> **Purpose**: This guide helps identify patterns in E2SC logs and provides templates for analyzing them using the E2SC-Logging agent.
>
> **Audience**: System administrators, developers, and support teams analyzing E2SC system logs.
>
> **How to Use**: Reference this guide while working with the @e2sc-logging agent for log analysis

## Table of Contents

1. [Log Sources & Locations](#log-sources--locations)
2. [E2SC.log Analysis](#e2sclog-analysis)
3. [StaticErrorFile.txt Analysis](#staticerrorfiletxt-analysis)
4. [Tomcat Catalina.out Analysis](#tomcat-catalinaout-analysis)
5. [Access Log Analysis](#access-log-analysis)
6. [Common Issues & Fixes](#common-issues--fixes)
7. [Report Generation](#report-generation)

---

## Log Sources & Locations

### Directory Structure

```
/e2open/var/log/
├── e2sc/                           ← Application logs
│   ├── e2sc.log                    ← Main application log
│   ├── staticErrorFile.txt         ← Master data upload info
│   ├── e2sc.log.1, e2sc.log.2      ← Rotated logs
│   └── archive/                    ← Archived logs
│
├── e2sc-tomcat/                    ← Tomcat server logs
│   ├── catalina.out                ← Tomcat stdout/stderr
│   ├── catalina.[date].log         ← Daily Tomcat logs
│   ├── localhost_access_log.*.txt  ← HTTP access logs
│   └── manager/                    ← Manager logs
│
├── access_log/                     ← HTTP access logs
│   ├── access_log.[date].txt       ← Hourly/daily logs
│   └── archive/                    ← Old logs
│
└── reports/                        ← Generated reports (OUTPUT)
    ├── summary_report.txt
    ├── error_analysis.tsv
    ├── access_analysis.tsv
    └── suggestions.txt
```

---

## E2SC.log Analysis

### Log Format

```
[TIMESTAMP] [LEVEL] [THREAD] [CLASS] - MESSAGE
```

### Example Entries

```
[2026-03-17T10:15:22.123Z] [INFO] [http-thread-pool-8080-1] [WorkflowEngine] - WorkflowDefinition loaded: ApprovalWorkflow_v1
[2026-03-17T10:15:45.567Z] [WARN] [http-thread-pool-8080-2] [DataValidator] - Invalid date format in field PdfDate50: "2026-02-30"
[2026-03-17T10:16:22.890Z] [ERROR] [http-thread-pool-8080-3] [StateTransition] - Transition blocked: User mary@e2open.com lacks role 'Approver' for state 'PendingApproval'
[2026-03-17T10:17:01.234Z] [INFO] [e2sc-worker-1] [UserAccess] - User john@e2open.com accessed workflow DiscreteOrder with role GLV-Partner from IP 192.168.1.100
[2026-03-17T10:18:15.789Z] [ERROR] [e2sc-worker-2] [MasterDataUpload] - Failed to process supplier data: Duplicate supplier code 'SUP12345' found in existing records
```

### Key Components to Analyze

| Component | Purpose | What to Look For |
|-----------|---------|------------------|
| **TIMESTAMP** | Event time | OutOfOrder events, time gaps |
| **LEVEL** | Severity | ERROR (critical), WARN (concerning), INFO (normal) |
| **THREAD** | Processing thread | Thread pool exhaustion if many stuck threads |
| **CLASS** | Source module | Groups related errors |
| **MESSAGE** | Details | Specific error conditions and states |

### Analysis Patterns

#### User Access Pattern
```
Pattern: "User [username] accessed workflow [workflow] with role [role]"
Tells You: 
- Who is accessing the system
- What workflows are being used
- Which roles are active
- When activity occurs

Extract to:
USERNAME | WORKFLOW | ROLE | TIMESTAMP | IP
```

#### State Transition Pattern
```
Pattern: "State transition: [from] → [to]" or "Transition [ACTION_NAME]"
Tells You:
- Which workflows are active
- How long states persist
- If transitions are blocked

Extract to:
OBJECT | STATE_FROM | STATE_TO | ACTION | USER | TIMESTAMP | SUCCESS/BLOCKED
```

#### Error Pattern
```
Pattern: "ERROR: [component] - [error message]"
Tells You:
- What's failing
- How often it fails
- Which components have issues

Categories:
- ValidationError: Data format/value issues
- AuthorizationError: Role/permission issues
- DataError: Missing/duplicate data
- SystemError: Database/connection issues
- WorkflowError: Workflow logic issues
```

### Critical Error Types

| Error Type | Cause | How to Fix |
|-----------|-------|-----------|
| **Invalid date format** | Incorrect date in field | Check AllBundles.properties date validation |
| **Duplicate [entity]** | Master data not unique | Clean master data or add unique constraint |
| **User lacks role [role]** | Missing role assignment | Check role_info.txt, assign role to user |
| **Workflow not found** | Workflow not deployed | Reload OC classes, verify workflow exists |
| **Database connection failed** | DB server down/unreachable | Check database status, verify connection string |

---

## StaticErrorFile.txt Analysis

### Log Format

```
TIMESTAMP | OPERATION | ENTITY_TYPE | STATUS | RECORD_COUNT | ERROR_DETAILS
```

### Example Entries

```
2026-03-17T10:15:22.123Z | UPLOAD | Supplier | SUCCESS | 150 | All suppliers imported successfully
2026-03-17T10:25:45.567Z | UPLOAD | PurchaseOrder | PARTIAL_FAILURE | 87 | 5 records failed: Invalid PO date (IDs: PO001, PO002, PO003, PO005, PO007)
2026-03-17T10:35:10.890Z | UPLOAD | Item | FAILURE | 0 | Failed: Duplicate item code 'ITEM123' already exists. Operation rolled back.
2026-03-17T10:45:33.234Z | VALIDATE | Supplier | SUCCESS | 200 | Validation passed for all 200 supplier records
2026-03-17T11:05:01.789Z | UPLOAD | Shipment | PARTIAL_FAILURE | 45 | 3 records skipped: Missing mandatory field 'DeliveryDate'
```

### Key Metrics to Extract

| Metric | Purpose | How to Calculate |
|--------|---------|------------------|
| **Success Rate** | Overall upload health | (Successful Records / Total Records) × 100 |
| **Failure Rate** | Problem frequency | (Failed Records / Total Records) × 100 |
| **Entity Types** | What's being uploaded | Group by ENTITY_TYPE |
| **Common Errors** | Most frequent issues | Count ERROR_DETAILS patterns |
| **Upload Trend** | Activity pattern | Timeline of upload operations |

### Master Data Upload Patterns

#### Successful Upload
```
2026-03-17T10:15:22 | UPLOAD | Supplier | SUCCESS | 150 | All records processed
↓
Indicates: Master data in good shape, no validation issues
```

#### Partial Failure
```
2026-03-17T10:25:45 | UPLOAD | PurchaseOrder | PARTIAL_FAILURE | 87 | 5 records failed: Validation errors
↓
Indicates: Some data issues; identify specific records for manual review
Action: Review mentioned record IDs and fix formatting
```

#### Complete Failure
```
2026-03-17T10:35:10 | UPLOAD | Item | FAILURE | 0 | Duplicate item code already exists
↓
Indicates: Systemic issue blocking all uploads
Action: Clean data duplicates, retry entire upload
```

### Common Master Data Errors

| Error | Cause | Solution |
|-------|-------|----------|
| **Duplicate [code]** | Record already exists | Remove duplicates from source data or delete old record |
| **Invalid date format** | Date not in expected format | Check AllBundles.properties date format, reformat dates |
| **Missing mandatory field** | Required data missing | Add missing fields to all records before uploading |
| **Invalid reference** | FK reference not found | Ensure referenced entity exists before uploading dependent entity |
| **Data type mismatch** | Value type incorrect | Fix data types (e.g., number as string, boolean value) |

---

## Tomcat Catalina.out Analysis

### Log Format

Unstructured Java output, exceptions, and println statements:

```
[timestamp] [thread] Class: message
java.lang.ExceptionType: Exception message
    at class.method(file:line)
    at ...
```

### Example Entries

```
Mar 17, 2026 10:15:22 AM org.apache.catalina.startup.Catalina start
INFO: Server startup in [1234] milliseconds

STDOUT> println from application: Processing workflow 'ApprovalWorkflow' for user 'john@e2open.com'

Mar 17, 2026 10:25:45 AM org.apache.catalina.core.StandardWrapperValve invoke
SEVERE: Servlet.service() for servlet [DispatcherServlet] in context with path [/e2sc] threw exception
java.lang.NullPointerException: Cannot read field "workflowId" because "workflow" is null
    at com.e2open.workflow.Engine.processWorkflow(Engine.java:234)
    at com.e2open.workflow.Dispatcher.doPost(Dispatcher.java:89)

Mar 17, 2026 10:35:10 AM org.hibernate.engine.transaction.internal.TransactionImpl commit
WARNING: HHH000387: Session.close() being called from non-managed code
```

### What to Look For

#### Startup/Shutdown Events
```
✅ Application startup: Time application took to start
⚠️ Graceful shutdown: Normal application termination
❌ Crash: Application terminated abnormally
```

#### Exception Stack Traces
```
Each exception tells you:
1. Exception type (NullPointerException, OutOfMemoryError, etc.)
2. Where it occurred (Class.method at file:line)
3. Call chain (stack trace)
4. Usually indicates a code bug
```

#### Memory and Performance
```
Look for:
- OutOfMemoryError: JVM ran out of memory
- GC overhead lines: Garbage collection pressure
- Thread deadlock indicators: Thread analysis
```

### Critical Catalina.out Issues

| Issue | Pattern | Action |
|-------|---------|--------|
| **NullPointerException** | "Cannot read field ... because ... is null" | Likely code bug; report with stack trace |
| **Transaction issues** | "Session.close() called from non-managed code" | Database transaction not properly closed |
| **Memory exhaustion** | "java.lang.OutOfMemoryError: Java heap space" | Increase JVM heap size, check for memory leaks |
| **Connection pool** | "HikariPool - Connection is not available" | Database connection pool exhausted |
| **Timeout** | "SocketTimeoutException" or "ConnectTimeoutException" | Database/external service not responding |

---

## Access Log Analysis

### Log Format

```
IP | TIMESTAMP | METHOD | PATH | HTTP_STATUS | RESPONSE_TIME_MS | USER_AGENT
```

### Example Entries

```
192.168.1.100 - john@e2open.com [17/Mar/2026:10:15:22 +0000] "GET /e2sc/api/workflow/list HTTP/1.1" 200 1245 "Mozilla/5.0"
192.168.1.101 - mary@e2open.com [17/Mar/2026:10:25:45 +0000] "POST /e2sc/api/order/PO001/approve HTTP/1.1" 403 89 "Mozilla/5.0"
192.168.1.102 - system@e2open.com [17/Mar/2026:10:35:10 +0000] "POST /e2sc/api/master-data/upload HTTP/1.1" 500 512 "curl/7.68.0"
192.168.1.100 - john@e2open.com [17/Mar/2026:10:45:33 +0000] "GET /e2sc/api/order/PO001 HTTP/1.1" 200 3456 "Mozilla/5.0"
```

### Key Metrics

| Metric | Purpose | How to Calculate |
|--------|---------|------------------|
| **Request Count** | Traffic volume | Total number of requests per hour/day |
| **Response Time** | Performance | Average RESPONSE_TIME_MS |
| **Error Rate** | API health | Count of non-2xx status codes / total requests |
| **Status Breakdown** | Error types | Count by HTTP_STATUS (2xx, 4xx, 5xx) |
| **Top Endpoints** | Popular features | Most frequently requested PATH |
| **Slow Endpoints** | Performance issues | Endpoints with high avg RESPONSE_TIME_MS |

### HTTP Status Code Analysis

| Status | Meaning | Action |
|--------|---------|--------|
| **200-299** | Success | Normal operation |
| **400** | Bad Request | Client error in request format |
| **401/403** | Unauthorized/Forbidden | User lacks permission or authentication failed |
| **404** | Not Found | Requested resource doesn't exist |
| **500** | Server Error | Application error |
| **502/503** | Gateway/Service Unavailable | Server down or overloaded |
| **504** | Gateway Timeout | Request took too long |

### Performance Analysis Thresholds

```
Response Time:
- < 500ms: Excellent
- 500ms - 2s: Good
- 2s - 5s: Acceptable
- > 5s: Slow (investigate)

Error Rates:
- < 1%: Excellent
- 1% - 5%: Good
- 5% - 10%: Concerning (investigate)
- > 10%: Critical (urgent)
```

---

## Common Issues & Fixes

### Issue 1: Data Validation Failures

**Symptom:**
```
Multiple "Invalid date format" or "Validation failed" errors in e2sc.log
```

**Root Cause:**
Master data doesn't match expected format or business rules.

**Fix - Using E2SC-Config:**
```
@e2sc-config Review field validation for PdfDate50

Then:
1. Check generated AllBundles.properties for validation rules
2. Update master data to match expected formats
3. Re-upload data
```

**Manual Fix:**
```
1. Check AllBundles.properties for field format definitions
2. Update source data to match expected format
3. Test with sample record before full upload
```

---

### Issue 2: User Permission Denied

**Symptom:**
```
ERROR: "User X lacks role 'RoleName' for workflow Y"
Multiple "Transition blocked" entries
```

**Root Cause:**
User doesn't have required role for workflow/action.

**Fix - Using E2SC-Config:**
```
@e2sc-config Update role assignments for workflow X to include role Y

Then:
1. Verify role is added in generated role_info.txt
2. Reload OC classes
3. Test with affected user
```

**Manual Fix:**
```
1. Check role_info.txt for required roles
2. Add user to required role in system
3. If new role needed, contact system admin
```

---

### Issue 3: State Transition Errors

**Symptom:**
```
ERROR: "Invalid transition: Open → PendingApproval"
Multiple blocked transitions for specific state
```

**Root Cause:**
Workflow state or transition not properly configured or conditions not met.

**Fix - Using E2SC-Config:**
```
@e2sc-config Review transitions for workflow Order to allow Open → PendingApproval

Then:
1. Check generated Transitions XML
2. Verify all required states and actions defined
3. Reload OC classes
```

**Manual Fix:**
```
1. Check Transitions XML for source and destination states
2. Ensure both states are defined
3. Ensure action connecting them exists
4. Verify user has required role for action
```

---

### Issue 4: Duplicate Data in Master Uploads

**Symptom:**
```
StaticErrorFile.txt: "Duplicate supplier code 'SUP123' already exists"
Upload fails completely
```

**Root Cause:**
Record already exists in database or duplicate in upload file.

**Fix:**
```
1. Query database for existing record: SELECT * FROM Supplier WHERE code='SUP123'
2. If exists and outdated: DELETE (backup first)
3. If exists and current: Skip/merge in upload file
4. Check source data for duplicates
5. Re-upload after cleaning
```

---

### Issue 5: Performance / Slow Response Times

**Symptom:**
```
Access logs show: Response times > 5000ms for GET /e2sc/api/order/list
Catalina.out shows: High GC (Garbage Collection) activity
```

**Root Cause:**
Database query inefficiency, missing indexes, or memory pressure.

**Fix:**
```
1. Identify slow queries from access/e2sc logs
2. Check database indexes on queried fields
3. If missing, add indexes for commonly filtered fields
4. Monitor memory: Java heap may need increase
5. Consider query optimization or caching
```

---

## Report Generation

### Using the Agent

```
How to invoke:
@e2sc-logging Analyze logs from last 24 hours and generate reports

or

@e2sc-logging Focus on errors in this week's logs
```

### Report Output Files

#### 1. summary_report.txt
Human-readable overview:
```
═══════════════════════════════════════════════════════
E2SC LOG ANALYSIS SUMMARY
Generated: 2026-03-17 12:00:00 UTC
Analysis Period: 2026-03-16 12:00:00 → 2026-03-17 12:00:00
═══════════════════════════════════════════════════════

KEY METRICS
───────────
Total Requests: 15,234
Success Rate: 96.2%
Error Rate: 3.8%
Active Users: 47
Peak Activity: 10:15-11:00 (1,234 requests)

CRITICAL ISSUES
───────────────
[1] Data Validation Failed (87 occurrences)
    - Impact: Master data uploads blocked
    - Frequency: Every 5 minutes
    - Fix: Review validation rules in AllBundles.properties

WARNINGS
────────
[1] Slow Response Times (23 occurrences)
    - Average: 3.2 seconds for /api/order/list
    - Max: 8.4 seconds
    - Cause: Possible missing database index

TOP 3 RECOMMENDATIONS
─────────────────────
1. CRITICAL: Fix data validation for date fields
2. WARNING: Add database index on Order.CreatedDate
3. INFO: Monitor connection pool usage
```

#### 2. error_analysis.tsv
Tab-delimited for Excel:
```
Timestamp | Severity | Component | Error Type | User | Count | Details
2026-03-17T10:15:22 | ERROR | DataValidator | ValidationFailed | system | 87 | Invalid date format in PdfDate50
2026-03-17T10:25:45 | ERROR | StateTransition | TransitionBlocked | mary@e2open.com | 5 | User lacks role 'Approver'
2026-03-17T10:35:10 | ERROR | MasterDataUpload | DuplicateKey | system | 3 | Duplicate supplier code
```

#### 3. access_analysis.tsv
Tab-delimited access logs:
```
Timestamp | User | Workflow | Role | Status | ResponseTime_ms | IP
2026-03-17T10:15:22 | john@e2open.com | DiscreteOrder | GLV-Partner | SUCCESS | 234 | 192.168.1.100
2026-03-17T10:25:45 | mary@e2open.com | ApprovalWorkflow | Manager | BLOCKED | 45 | 192.168.1.101
2026-03-17T10:35:10 | system@e2open.com | MasterDataUpload | System | SUCCESS | 5234 | 192.168.1.102
```

#### 4. suggestions.txt
Specific fixing recommendations:
```
═══════════════════════════════════════════════════════
FIXING RECOMMENDATIONS
═══════════════════════════════════════════════════════

[CRITICAL] Data Validation Errors (87 occurrences)
────────────────────────────────────────────────────
Issue: Invalid date format in field PdfDate50
Where: e2sc.log lines 1526, 1534, 1542, ... (87 total)
Impact: Master data uploads failing
Frequency: ~15 errors per hour

How to Fix:
1. Check date format in AllBundles.properties:
   @e2sc-config Review field validation for PdfDate50

2. Make sure source data uses correct format (YYYY-MM-DD)

3. Re-upload master data after fixes

Related: /e2open/var/log/reports/error_analysis.tsv (details)


[WARNING] Slow Database Queries (23 occurrences)
────────────────────────────────────────────────
Issue: GET /e2sc/api/order/list taking 3-8 seconds
Where: access logs, avg response time: 3.2s
Impact: Poor user experience, potential timeout issues
Frequency: Peak hours (10:00-12:00, 14:00-16:00)

How to Fix:
1. Check if index exists on Order table:
   SELECT * FROM user_ind_columns WHERE table_name='ORDER'

2. If missing, add index:
   CREATE INDEX idx_order_created_date ON Order(created_date)

3. Monitor query performance after index creation

Related: /e2open/var/log/reports/access_analysis.tsv (slow endpoints)


[INFO] Configuration Recommendations
──────────────────────────────────
Consider reviewing workflow states and transitions:
@e2sc-config Review all state transitions for Order workflow

This will ensure all states are properly configured and aligned.
```

---

## Best Practices

✅ **DO:**
- Run log analysis regularly (daily/weekly)
- Export error reports and share with development team
- Address CRITICAL issues immediately
- Track trends over time (collect reports weekly)
- Reference specific log entries when reporting issues
- Use Excel to pivot and filter error data

❌ **DON'T:**
- Ignore patterns of the same error
- Skip CRITICAL severity issues
- Rely on memory for error details
- Delete old logs without archiving
- Make configuration changes without testing
- Ignore warnings that escalate to errors

---

## Reference: E2SC-Config Integration

When fixing issues found in logs, use the E2SC-Config agent for configuration:

```
Common requests:
@e2sc-config Review and update role assignments for workflow X
@e2sc-config Update validation rules for field Y
@e2sc-config Fix state transitions not allowing Z to happen
@e2sc-config Add new error message to AllBundles.properties
```

The agent will generate all necessary configuration files based on your requirements.

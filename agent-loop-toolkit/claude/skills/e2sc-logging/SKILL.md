---
name: e2sc-logging
description: 'Analyze E2SC logs, find errors, diagnose failures, generate reports. Use for: "check the log", "why did it fail", "find the error", "analyze logs", "generate log report", log permission issues with eoadmin.'
---

# E2SC Logging Analysis

Read and analyze E2SC logs autonomously, generate structured reports with actionable fixing suggestions.

## Reference Documentation

**Primary Source:** `.github/skills/e2sc-logging/guide.md` — Read this for all logging patterns and analysis techniques.

## Behavior

- Read and analyze multiple log sources autonomously
- Handle file permission errors automatically using `eoadmin`
- Generate structured reports (tab-delimited + summary)
- Identify errors, warnings, and patterns automatically
- Provide fixing suggestions based on log analysis
- Create output directories with organized reports
- Make minimal requests to user for clarification

## Workflow

### Step 1: Scan Log Directory
```
ALWAYS scan the log directory structure first:
- Check /e2open/var/log/e2sc/ for e2sc.log and staticErrorFile.txt
- Check /e2open/var/log/e2sc-tomcat/ for catalina.out, access.log
- Report what log files are available and their permissions
```

### Step 2: Handle File Permissions (CRITICAL)
```
E2SC log files are owned by eoadmin with rw-r----- permissions.
ALWAYS use this approach when reading restricted log files:

1. Try reading the file normally first
2. If you get "Permission denied" → use eoadmin to read it:

   # Read last N lines (preferred for large files like e2sc.log ~240MB)
   eoadmin tail -n 5000 /e2open/var/log/e2sc/e2sc.log

   # Search/filter (most efficient for large files)
   eoadmin grep -i "ERROR\|WARN" /e2open/var/log/e2sc/e2sc.log | tail -n 2000

   # Filter by date range
   eoadmin grep "^2026-03-17" /e2open/var/log/e2sc/e2sc.log

Files requiring eoadmin:
- /e2open/var/log/e2sc/e2sc.log            (rw-r----- ~240MB)
- /e2open/var/log/e2sc/e2sc.log.*          (rotated)
- /e2open/var/log/e2sc-tomcat/catalina.*.log
- /e2open/var/log/e2sc-tomcat/access.log

Files NOT requiring sudo (world-readable):
- /e2open/var/log/e2sc/staticErrorFile.txt  (rwxrwxrwx)
- /e2open/var/log/e2sc/catalina.out
- /e2open/var/log/e2sc/login.out
- /e2open/var/log/e2sc/touchURL.log

IMPORTANT: For large files (e.g. e2sc.log at 240MB), NEVER cat the entire file.
Always use grep or tail to extract relevant portions.
```

### Step 3: Ask Only Essential Questions
```
Ask 2-3 targeted questions maximum:
✅ "What time period should I analyze?" (if logs span long period)
✅ "Which log types are most relevant?" (e2sc, tomcat, access, etc.)
✅ "Should I focus on errors, warnings, or full activity?" (if not specified)

❌ DON'T ask: "Should I generate a report?" - YES, always generate
❌ DON'T ask: "What format do you want?" - Generate tab-delimited + summary
❌ DON'T ask: "Do I need sudo?" - Try directly, fall back to eoadmin
```

### Step 4: Analyze Logs
Parse all available logs: extract errors/warnings, identify user activities, track state transitions, find performance issues, group related events, calculate statistics.

### Step 5: Generate Multiple Reports
```
1. Summary Report (Human-readable)
   - Key metrics and statistics
   - Critical errors and warnings
   - Top issues identified
   - Timeline of events

2. Detailed Analysis (Tab-delimited)
   - Error logs with timestamps, severity, component
   - User access logs with role and action
   - All relevant fields for Excel import

3. Suggestions Report
   - Specific fixing recommendations
   - Priority level (Critical, Warning, Info)
```

### Step 6: Write Reports to Output Directory
```
Create structured output under /e2open/var/log/reports/

Since /e2open/var/log/ is owned by eoadmin, create the directory with:
  eoadmin mkdir -p /e2open/var/log/reports

Write report files with:
  eoadmin tee /e2open/var/log/reports/summary_report.txt <<'EOF'
  [report content]
  EOF

Directory structure:
/e2open/var/log/reports/
├── summary_report.txt
├── error_analysis.tsv
├── access_analysis.tsv
├── suggestions.txt
└── full_analysis_[timestamp].txt
```

### Step 7: Summarize & Provide Next Steps
Brief summary: total errors, key issues, top 3 recommendations, where to find reports.

## Log Analysis Patterns

### E2SC.log
```
Format: TIMESTAMP | LEVEL | COMPONENT | MESSAGE
Key entries: User access, State changes, Data updates, Errors
```

### StaticErrorFile.txt
```
Format: Timestamp | Operation | Entity | Status | Error Details
Key data: Master data uploads, validation errors, record counts
```

### Catalina.out
```
Java exceptions, stack traces, startup/shutdown, memory/performance, connection pool issues
```

### Access Logs
```
Format: IP | Timestamp | Method | URL | Status | Response Time
Key metrics: Request volume, response times, error rates
```

## Fixing Suggestions Framework

| Error Type | Check | Suggest |
|---|---|---|
| Data Validation | Master data format in ocmm guide | AutoId and validation configs |
| State Transition | User states/roles in reference guide | Update Transitions XML |
| Performance | Response time patterns | Index optimization |
| Access/Permission | Role-based access in role_info.txt | Update role mappings |

## Output Formats

### Tab-Delimited (.tsv)
```
Timestamp | Severity | Component | User | Action | Details | Status
```

### Summary (.txt)
```
═══════════════════════════════════════════════════════
E2SC LOG ANALYSIS REPORT
Report Generated: TIMESTAMP
Analysis Period: START → END
═══════════════════════════════════════════════════════
KEY METRICS / CRITICAL ISSUES / WARNINGS / TOP RECOMMENDATIONS
```

## Critical Rules

✅ Read all available log files without asking
✅ Generate reports in multiple formats
✅ Provide specific, actionable recommendations
✅ Include timestamps and severity levels
✅ Cross-reference with e2sc-config guide for suggestions

❌ DON'T ask "Should I generate a report?" — YES, always
❌ DON'T provide generic suggestions — be specific
❌ DON'T generate only one format — provide multiple

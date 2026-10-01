# E2open Alert Configuration Guide

> **Purpose**: This guide helps developers understand and configure E2open Alerts and Email subscripitons for alerts
> 
> **Audience**: Technical implementers, developers, and system administrators working with E2open SCPM
> 
> **How to Use**: Share this guide with GitHub Copilot in a new chat to get configuration assistance

## Table of Contents

1. [Alert Overview](#alert-overview)
2. [OC Alert Configuration](#oc-alert-configuration)
3. [General Alert Configuration](#alert-configuration)
4. [Email Subscription](#email-subscription)

---

## Alert Overview

Alerts are used to notify users of important information or actions needed within the E2open SCPM system. They can be configured for both Order Collaboration (OC) and Plan Collaboration (PC) scenarios, and can be delivered through the user interface as well as via email notifications.

Alerts can be subscription-based, allowing users to choose which alerts they want to receive based on their role and preferences through the My Profile > Email Alert Subscription workflow.

Alerts are created within in tcgomp_info.txt and role_tgview_info.txt files, configured in alert_configuration.xml, and associated with user roles in role_info.txt. They can also be linked to specific workflows and filters in the UI through workflow properties.

Portal configuration, iodoctype definitions, and email .vm files are needed when sending new alerts via email and require new or different text than existing alerts.

New Email alerts also require a new .VM file in the email template directory with the correct naming convention, and the alert must be associated with an IoDocType and Schedule to control the frequency of the email notifications. Creating a new schedule may be necessary if the alert frequency does not match existing schedules (e.g., daily, weekly) and/or if the alerts should be managed under a new document type.

## OC Alert Configuration

#### **1. Create the PageSectionDefinition in <model subtype>_PageSectionDefinitions_ext.xml for the Alert Subscription Filter**
**Exp: OrderSearch_DOOrderAlertFilter_E2Admin (Order Search filter) and OrderSearch_DOOrderAlertFilter_Buttons (Order Search Buttons)**
E2SC Server Path: /e2open/app/e2sc/server/datasets/SCCGeneric/exe/reader/data/MetaData/<model subtype>/ext/<model subtype>_PageSectionDefinitions_ext.xml
Branch Check in Path: <<solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/exe/reader/data/MetaData/<model subtype>/ext/<model subtype>_PageSectionDefinitions_ext.xml>>
Sample from SSP: https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/datasets/SCCGeneric/exe/reader/data/MetaData/DiscreteOrder/SSP/DiscreteOrder_PageSectionDefinitions_SSP.xml

#### **2. Define a Order Search and Order Search Button PSD to Alert in exe_psd_mapping.txt. Refer to PSD Selector: demandNewOrOpenDiscreteOrderAlert**
E2SC Server Path: /e2open/app/e2sc/server/datasets/SCCGeneric/exe/reader/data/exe_psd_mapping.txt
Branch Check in Path: <<solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/exe/reader/data/exe_psd_mapping.txt>>
Sample from SSP: https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/datasets/SCCGeneric/exe/reader/data/exe_psd_mapping.txt

#### **3. Define Auto-Subscription in role_info.txt with entity name: alertsubscription if required.**
**0 is mandatory active - means the role will be auto subscribe and not able to unsubscribe.**
**1 is non mandatory and active - means the role will be auto subscribe and able to unsubscribe from My Profile > Email Alert Subscription workflow.**
**-1 indicates that it is currently inactive - means no auto subscription**
Example: broker_domain    broker_org    Supply-Supplier    alertsubscription    procNewOrOpenOrderAlert    1
E2SC Server Path: /e2open/app/e2sc/server/datasets/SCCGeneric/core/reader/data/role_info.txt
Branch Check in Path: <<solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/role_info.txt>>
Sample from SSP: https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/role_info.txt

## General Alert Configuration

#### **1. Alerts are configured in the AlertConfiguration.xml located in the /e2open/app/e2sc/server/xml directory.**
**name / problemName → new alert name**
**groupName → alert group (e.g. Forecast, Inventory, DiscreteOrder)**
**targetWorkflow / targetFilter → the workflow and filter the alert links to in the UI**

E2SC Server File Path: /e2open/app/e2sc/server/xml/AlertConfiguration.xml
Branch Check in Path: solution/project/ssp-ext/E2/e2sc/gap-data/xml.replace/AlertConfiguration.xml

Sample from SSP: https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/xml.replace/AlertConfiguration.xml#630-635

What to change for a new alert:

#### **2.The alert name must appear in AllowableProblemNames for each of the three relevant filters. These control which alerts are visible on the summary page, the details page, and the fine-tune combined page.**
https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/cfg.append/Workflow.properties#1829-1862
E2SC Server File Path : /e2open/app/e2sc/server/cfg/Workflow.properties
Branch Check in Path: solution/project/ssp-ext/E2/e2sc/gap-data/cfg.append/Workflow.properties
Sample from SSP: https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/cfg.append/Workflow.properties#1829-1862

#### **3.Add Role-Based Access Filters in exe_psd_mapping**
E2SC Server File Path : /e2open/app/e2sc/server/datasets/SCCGeneric/exe/reader/data/exe_psd_mapping.txt
Branch Check in Path: solution/project/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/exe/reader/data.append/exe_psd_mapping.txt
Sample from SSP: https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/datasets/SCCGeneric/exe/reader/data/exe_psd_mapping.txt#539-543

#### **4.Add the Alert to Portal Configuration**
Add new alert to PortalConfiguration.xml
**Add alert under request component(s) in PortalConfiguration.xml**
**Add to the bottom of the component before </parameters> and </component>** 

targetFilter should match the targetFilter in Workflow.properties to ensure hyperlinks from alert emails go to the correct place in the UI. The targetWorkflow should also match the workflow defined in Workflow.properties where the alert is visible.
Problem name should match the name defined in AlertConfiguration.xml for the alert and ProblemType should reflect the type of object the alert is related to (e.g., PPFF_BUCKET for forecast alerts, ASN for Shipment alerts, PO_SCHEDULE for Discrete Order alerts, etc.)

### Example:
```  
<problem type="PPFF_BUCKET" name="mtimNewChangedUpsideForecastAlert">  

        <pc:UiLink name="gotoProblems" targetWorkflow="portal_supplyVMIInventoryAlert" targetFilter="portal_demandVMIInventoryAlertDetails"/>  
        <PresetFilter>  
          <pc:SearchRules type="Collab">  
            <e2sc:MatchRule target="PPFF_COLLAB.CustomerName" value="rolecriteria.businessEntity" includeNulls="false"/>  
          </pc:SearchRules>  
        </PresetFilter>  
      </problem>  
```
E2SC Server File Path : /e2open/app/e2sc/server/xml/PortalConfiguration.xml

#### **5.Associate the Alert with an IoDocType and Define Frequency**
**IS_DELTA value="1" — only send alerts whose state has changed since the last run (delta behaviour). This is the standard for all existing alert bundles.**
**IS_DELTA value="0" — send all active alerts every time the schedule fires, regardless of change.**
E2SC Server File Path : /e2open/app/e2sc/server/xml/IoDocTypeDef_ext.xml
Branch Check in Path: solution/project/ssp-ext/E2/e2sc/gap-data/xml.replace/IoDocTypeDef_ext.xml
Sample from SSP: https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2sc/gap-data/xml.replace/IoDocTypeDef_Miscellaneous.xml#23-39

## Email Subscription

#### **1. Wire the DocumentType to a Schedule in schedules.xml using con expression.**
timing-group ref    Cron expression    Description
dailyTimingGroup    0 0 0 * * ?    Daily at midnight
dailyTimingGroup01    0 1 0 * * ?    Daily at 12:01am
dailyTimingGroup05    0 5 0 * * ?    Daily at 12:05am
weeklyTimingGroup    0 0 0 ? * Mon    Weekly, Monday midnight
E2NA Server File Path : /e2open/app/projects/ssp-ext/E2/e2na/ebl/support_file/schedules.xml
Branch Check in Path: solution/project/ssp-ext/E2/e2na/ebl/support_file/schedules.xml
Sample from SSP: https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/e2na/ebl/support_file/schedules.xml#1025-1040


#### **2. Create New VM file**

**File Path : /e2open/app/projects/ssp-ext/E2/solution/email/**
Create new .vm file (File Name must match Alert Name)

### Example — Adding New Alert VM

```
MyNewAlert

MyNewALert.vm
```

#### **3. Define the Email Content** 


| Row | Header | Description |
|-----|--------|-------------|
| 0 | `Variable` | Purpose |
| 1 | `$emailSubject` | Subject line of the email |
| 2 | `$summary` | Short summary shown in the email body |
| 3 | `$categoryvm` | Alert category label in the email |
| 4 | `$showRole` | Whether to show the user's role in the email (yes/no) |
| 5 | `$priorityflag` | Enables the priority indicator in the email |
| 6 | `$priorityCat` | Priority level shown (High, Medium, Low) |

#parse	Use alertTemplateH.vm (HTML) or alertTemplate.vm

E2NA Server File Path : /e2open/app/projects/ssp-ext/E2/solution/email/
Branch Check in Path: solution/project/ssp-ext/E2/solution/email/
Sample from SSP: https://git.dev.e2open.com/projects/SSP/repos/ssp/browse/cpi/ssp/E2/solution/email/procForecastCommitMismatchAlert.vm
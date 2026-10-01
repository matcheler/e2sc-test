# E2SC Configuration Guide - CFG Properties

> **Purpose**: This guide helps developers understand and configure E2open SCPM CFG-related properties and configurations, including AllBundles.properties, Workflow properties, RCP properties, and other configuration management files.
>
> **Audience**: Technical implementers, developers, and system administrators working on E2open SCPM customizations.
>
> **How to Use**: Share this guide with GitHub Copilot in a new chat to get context-aware configuration assistance for your E2open SCPM implementation.

## Table of Contents

1. [AllBundles.properties Integration](#allbundlesproperties-integration)
   - [Standard Field Labels by Object Type](#standard-field-labels-by-object-type)
   - [Custom PDF Field Labeling](#custom-pdf-field-labeling)
   - [Action and State Labels](#action-and-state-labels)
   - [Field Formatting Configuration](#field-formatting-configuration)
   - [Master Data Field Labeling](#master-data-field-labeling)
   - [Validation Error Messages](#validation-error-messages)
   - [Relationship Labels](#relationship-labels)
   - [UI Section Headers](#ui-section-headers)
2. [Best Practices](#best-practices)
3. [Coming Next](#coming-next)
   - Workflow.properties Configuration
   - RCP Properties
   - Other CFG Files

---

## AllBundles.properties Integration

### Purpose
AllBundles.properties defines **user-facing labels and formatting** for all OCMetaModel elements. This includes:
- **Field labels** for UI display
- **Action and state names** for buttons and status
- **Validation error messages** for user feedback
- **Formatting rules** for numbers, dates, and currency
- **Multi-language support** through resource bundles

### Key Concepts

#### **1. Configuration Hierarchy**
- **OOTB Configuration**: `/e2open/app/projects/ssp/E2/e2sc/gap-data/cfg.append/AllBundles.properties`
- **Project Extensions**: `/e2open/app/projects/ssp-ext/E2/e2sc/gap-data/cfg.append/AllBundles.properties`
- **Runtime Location**: `/e2open/app/e2sc/server/cfg/AllBundles.properties` (merged)

#### **2. Label Pattern Structure**

**Basic Pattern:**
```
exe.web.broker_domain.broker_org.default_cusu_group.[ObjectType].[SubType].[FieldPath]=[User Label]
```

**Advanced Pattern (with PSD Context):**
```
pc.web.broker_domain.broker_org.default_cusu_group.[PSDContext].[FieldPath]=[User Label]
```

**Key Difference:**
- **Basic Pattern**: Used for standard OCMetaModel fields (Order, ASN, Receipt, etc.)
- **Advanced Pattern**: Used for **master data fields** where different PSDs show different labels for the same internal field

#### **3. Standard OOTB Patterns**
From the SSP OOTB configuration, key patterns include:
- **Object type labels**: `exe.web.Order.DiscreteOrder=Discrete Order`
- **Field formatting**: `exe.web.fieldFormat.Order.PoHeader.PdfFloat14={_core.number.format.unitprice_}`
- **Action labels**: `exe.web.action.Order.DiscreteOrder.UI_Accept_MP=Accept`
- **State labels**: `exe.web.state.Order.DiscreteOrder.Open=Open`

#### **4. Master Data Field Patterns (Advanced)**
For master data fields that appear in different PSD contexts:
- **CollabSearch context**: `pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31=GPDS Milestone Date`
- **CollabList context**: `pc.web.broker_domain.broker_org.default_cusu_group.CollabList.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31=Milestone Date`

**Why Different PSD Contexts?**
- **Same internal field** (`ProjDefCollabAttribDate31`) can have **different labels** in different screens
- **CollabSearch** might show "GPDS Milestone Date" (detailed search form)
- **CollabList** might show "Milestone Date" (shortened for list view)
- **PSD Context** ensures the right label appears in the right place

---

## Standard Field Labels by Object Type

### DiscreteOrder Field Labels
```properties
# Header Level Fields
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoHeader.PoNumber=Order Number
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoHeader.CustomerName=Customer ID
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoHeader.SupplierName=Supplier ID
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoHeader.PoDate=Order Date
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoHeader.RequiredDate=Required Date

# Line Item Level Fields
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoLineItem.ItemName=Item Name
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoLineItem.Quantity=Quantity
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoLineItem.UnitPrice=Unit Price
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoLineItem.CustomerItemName=Customer Item No.

# Schedule Level Fields
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.RequestedDate=Requested Date
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.Quantity=Request Quantity
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoPromiseSchedule.PromisedDate=Promised Date
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoPromiseSchedule.Quantity=Promise Quantity
```

### Shipment Field Labels
```properties
# Header Level Fields
exe.web.broker_domain.broker_org.default_cusu_group.ASN.Shipment.AsnHeader.AsnId=Shipment ID
exe.web.broker_domain.broker_org.default_cusu_group.ASN.Shipment.AsnHeader.ShipDate=Ship Date
exe.web.broker_domain.broker_org.default_cusu_group.ASN.Shipment.AsnHeader.CustomerName=Customer ID
exe.web.broker_domain.broker_org.default_cusu_group.ASN.Shipment.AsnHeader.SupplierName=Supplier ID

# Line Item Level Fields
exe.web.broker_domain.broker_org.default_cusu_group.ASN.Shipment.AsnLineItem.ShippedQuantity=Shipped Quantity
exe.web.broker_domain.broker_org.default_cusu_group.ASN.Shipment.AsnLineItem.ItemName=Item Name
exe.web.broker_domain.broker_org.default_cusu_group.ASN.Shipment.AsnLineItem.CustomerItemName=Customer Item No.
```

### Receipt Field Labels
```properties
# Header Level Fields
exe.web.broker_domain.broker_org.default_cusu_group.Receipt.Receipt.ReceiptHeader.ReceiptId=Receipt ID
exe.web.broker_domain.broker_org.default_cusu_group.Receipt.Receipt.ReceiptHeader.ReceiptDate=Receipt Date
exe.web.broker_domain.broker_org.default_cusu_group.Receipt.Receipt.ReceiptHeader.CustomerName=Customer ID

# Line Item Level Fields
exe.web.broker_domain.broker_org.default_cusu_group.Receipt.Receipt.ReceiptLineItem.ReceivedQuantity=Received Quantity
exe.web.broker_domain.broker_org.default_cusu_group.Receipt.Receipt.ReceiptLineItem.ItemName=Item Name
exe.web.broker_domain.broker_org.default_cusu_group.Receipt.Receipt.ReceiptLineItem.QuantityDefective=Defective Quantity
```

---

## Custom PDF Field Labeling

### PDF Field Categories
```properties
# String Fields (PdfString1-50)
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoHeader.PdfString10=Project Code
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoLineItem.PdfString15=Supplier Part Number
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.PdfString5=Schedule Status

# Float Fields (PdfFloat1-35)
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoLineItem.PdfFloat10=Extended Price
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoHeader.PdfFloat5=Discount Percentage

# Date Fields (PdfDate1-50)
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.PdfDate50=Update Date
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.PdfDate51=Approval Date

# Integer Fields (PdfInteger1-50)
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoLineItem.PdfInteger5=Priority Level
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoHeader.PdfInteger10=Version Number
```

---

## Action and State Labels

### Action Labels
```properties
# Standard OOTB Actions
exe.web.action.Order.DiscreteOrder.UI_Accept_MP=Accept
exe.web.action.Order.DiscreteOrder.UI_Reject_MP=Reject
exe.web.action.Order.DiscreteOrder.UI_Cancel_MP=Cancel
exe.web.action.Order.DiscreteOrder.UI_Close_MP=Close

# Document Creation Actions
exe.web.action.Order.DiscreteOrder.UI_Create_Asn_Po=Create Shipment
exe.web.action.Order.DiscreteOrder.UI_Create_Receipt_Po=Create Receipt
exe.web.action.Order.DiscreteOrder.UI_Create_Invoice_Po=Create Invoice

# Custom Actions (for UI Update Date workflow)
exe.web.action.Order.DiscreteOrder.USER_ACTION_202=Update Date
exe.web.action.Order.DiscreteOrder.USER_ACTION_203=Approve Update Date
```

### State Labels
```properties
# Standard OOTB States
exe.web.state.Order.DiscreteOrder.New=New
exe.web.state.Order.DiscreteOrder.Open=Open
exe.web.state.Order.DiscreteOrder.Accepted=Accepted
exe.web.state.Order.DiscreteOrder.Closed=Closed
exe.web.state.Order.DiscreteOrder.Cancelled=Cancelled

# Custom States
exe.web.state.Order.DiscreteOrder.PendingUpdateDate=Pending Update Date
exe.web.state.Order.DiscreteOrder.UnderReview=Under Review
```

---

## Field Formatting Configuration

### Number Formatting
```properties
# Core number formats
core.number.format=###,###,###,###
core.number.format.float=###,###,###.####
core.number.format.unitprice=#,##0.00##
core.web.money.pattern=#,##0.00

# Field-specific formatting
exe.web.fieldFormat.Order.PoHeader.PdfFloat14={_core.number.format.unitprice_}
exe.web.fieldFormat.Order.PoLineItem.UnitPrice={_core.number.format.unitprice_}
exe.web.fieldFormat.ASN.AsnHeader.PdfFloat1={_core.number.format.float_}
exe.web.fieldFormat.Receipt.ReceiptLineItem.QuantityReceived={_core.number.format.float_}
```

### Date Formatting
```properties
# Core date formats
core.web.date.shortFormat=MM/dd/yyyy
core.web.date.longFormat=MM/dd/yyyy:HH:mm:ss
core.web.time.format=HH:mm:ss

# Field-specific date formatting
exe.web.fieldFormat.Order.PoHeader.PdfDate50={_core.web.date.shortFormat_}
exe.web.fieldFormat.Order.PoRequestSchedule.RequestedDate={_core.web.date.shortFormat_}
```

---

## Master Data Field Labeling

### Purpose
Master data fields (like `ProjDefCollabAttribDate31`, `ProjDefCollabAttribString41`, etc.) often appear in **multiple PSD contexts** and may need **different labels** depending on where they're displayed.

### PSD Context-Specific Labeling
```properties
# Search Form Context - More Descriptive Labels
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31=GPDS Milestone Date
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribString42=Buyer ID
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribString43=Buyer Name

# List View Context - Shorter Labels
pc.web.broker_domain.broker_org.default_cusu_group.CollabList.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31=Milestone Date
pc.web.broker_domain.broker_org.default_cusu_group.CollabList.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribString42=Buyer ID
pc.web.broker_domain.broker_org.default_cusu_group.CollabList.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribString43=Buyer Name
```

### Label Reuse Pattern
For consistent labeling across contexts, use reference pattern:
```properties
# Define the label once in Search context
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31=GPDS Milestone Date

# Reference it in List context
pc.web.broker_domain.broker_org.default_cusu_group.CollabList.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31={_pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31_}
```

### Master Data Field Examples
```properties
# Date Fields
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31=GPDS Milestone Date
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate32=APQP Deliverable Planned Date
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate34=PPAP Required Date

# String Fields
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribString41=PPAP Phase Name
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribString42=Buyer ID
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribString44=Supplier Plant Manager Name

# Float Fields
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribFloat29=Business Percentage
```

### Key Benefits
- **Context-appropriate labels**: Different screens can show different levels of detail
- **Flexibility**: Same internal field can have multiple user-friendly names
- **Maintainability**: Reference pattern reduces duplicate label definitions
- **User experience**: Labels match the context and available space

---

## Validation Error Messages

### Custom Validation Messages
```properties
exe.web.validation.UPDATE_DATE_REQUIRED_MSG=Update date is required before proceeding.
exe.web.validation.UPDATE_DATE_FUTURE_MSG=Update date must be a future date.
exe.web.validation.DPO_Validate_Msg25=Shipment date validation failed - must be within 2 days.
```

---

## Relationship Labels

### Relationship Display Names
```properties
# Order-to-Shipment relationships
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.Relationship.DPOToShipment=Shipment Data
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.Relationship.DPOToReceipt=Receipt Data

# Parent-child relationships
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.Relationship.ViewParentBlanketOrder=Parent Blanket Order
exe.web.broker_domain.broker_org.default_cusu_group.Order.BlanketOrder.Relationship.ViewChildOrders=Child Orders
```

---

## UI Section Headers

### Page Section Titles
```properties
# Object type headers
exe.web.Order.DiscreteOrder.ExeHeader.title=Discrete Order Details
exe.web.ASN.Shipment.ExeHeader.title=Shipment Details
exe.web.Receipt.Receipt.ExeHeader.title=Receipt Details
exe.web.Invoice.Invoice.ExeHeader.title=Invoice Details

# Custom section headers
exe.web.Order.DiscreteOrder.CustomSection.title=Project Information
exe.web.Order.DiscreteOrder.ScheduleSection.title=Schedule Details
```

---

## Configuration Integration Examples

### Complete Custom Workflow Labels
For the "UI Update Date" workflow, all required labels:
```properties
# State labels
exe.web.state.Order.DiscreteOrder.PendingUpdateDate=Pending Update Date

# Action labels  
exe.web.action.Order.DiscreteOrder.USER_ACTION_202=Update Date
exe.web.action.Order.DiscreteOrder.USER_ACTION_203=Approve Update Date

# Field labels
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.PdfDate50=Update Date
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.PdfString10=Update Status
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.PdfDate51=Approval Date

# Field formatting
exe.web.fieldFormat.Order.PoRequestSchedule.PdfDate50={_core.web.date.shortFormat_}
exe.web.fieldFormat.Order.PoRequestSchedule.PdfDate51={_core.web.date.longFormat_}

# Validation messages
UPDATE_DATE_REQUIRED_MSG=Update date is required before proceeding.
UPDATE_DATE_FUTURE_MSG=Update date must be a future date.
DATE_UPDATE_APPROVAL_SUCCESS=Date update has been successfully approved.
```

---

## Best Practices

### Labeling Strategy
- **Use business-friendly terms** that users understand
- **Keep labels concise** but descriptive
- **Follow consistent naming patterns** across similar fields
- **Consider multi-language requirements** for global deployments

### Formatting Consistency
- **Reuse core formatting patterns** when possible
- **Apply consistent decimal places** for currency and quantities
- **Use standard date formats** unless business requires otherwise
- **Test formatting** in different locales if applicable

### Maintenance
- **Group related labels** together with comments
- **Document custom PDF field usage** and business purpose
- **Keep OOTB and custom labels separate** for easier maintenance
- **Test all labels** in UI after configuration changes

This comprehensive AllBundles.properties integration ensures all OCMetaModel elements have proper user-facing labels, formatting, and error messages for a complete user experience.

---

## File Locations and Editing

### Where to Add Labels

#### **For Custom Workflow Elements**
Edit the appropriate properties file based on scope:
```
# Project-specific customizations
/e2open/app/projects/ssp-ext/E2/e2sc/gap-data/cfg.append/AllBundles.properties

# Deployed configuration (reference)
/e2open/app/e2sc/server/cfg/AllBundles.properties
```

#### **Integration with Configuration Changes**
When adding new workflow elements (States, Actions, Fields):
1. **Define the element** in OCMetaModel XML (States, Actions, Relationships)
2. **Add role permissions** in role_info.txt
3. **Add user-friendly labels** in AllBundles.properties
4. **Reload configuration** using appropriate scripts

#### **Reload Configuration**
After updating AllBundles.properties, the server typically picks up changes on next deployment or application restart. Check your implementation's specific reload requirements.

---

## Coming Next

This CFG Configuration Guide will be expanded to include:

### **Workflow.properties Configuration**
Configuration for workflow-related properties and behavior settings.

### **RCP Properties**
RCP properties specific configurations.

### **Other CFG Files**
Additional configuration files and properties for E2open SCPM customizations.

Stay tuned for additional sections covering these important configuration areas!





# E2open OCMetaModel Configuration Guide

> **Purpose**: This guide helps developers understand and configure E2open OCMetaModel.xml for business object workflow management.
> 
> **Audience**: Technical implementers, developers, and system administrators working with E2open SCPM
> 
> **How to Use**: Share this guide with GitHub Copilot in a new chat to get configuration assistance

## Table of Contents

1. [OCMetaModel Overview](#ocmetamodel-overview)
2. [AutoId Configuration](#autoid-configuration)
3. [Relationships Configuration](#relationships-configuration)
4. [AuditChangeColumns Configuration](#auditchangecolumns-configuration)
5. [States, Actions & Transitions Configuration](#states-actions--transitions-configuration)
6. [role_info Configuration](#role_info-configuration)
7. [AllBundles.properties Integration](#allbundlesproperties-integration)
8. [UI Components Configuration](#ui-components-configuration) *(Coming Next)*
9. [Multi-Sort Column Configuration (ListVertical)](#multi-sort-column-configuration-listvertical)
10. [Best Practices](#best-practices) *(Coming Next)*

---

## OCMetaModel Overview

### What is OCMetaModel.xml?

OCMetaModel.xml is the **master configuration file** that defines all ExecutionBusinessObject types and their behaviors in E2open SCPM.

### Key Concepts

#### **1. E2open OOTB Business Object Types (Base Models)**
- **Order** (PO-based workflows)
- **ASN** (Shipment-based workflows) 
- **Receipt** (Receipt-based workflows)
- **Invoice** (Invoice-based workflows)

#### **2. Object Hierarchy Levels**
Each business object has multiple levels for data organization:

**Order Object Hierarchy:**
```
PoHeader ← PoLineItem ← PoRequestSchedule ← PoPromiseSchedule
```

**ASN Object Hierarchy:**
```
AsnHeader ← AsnDelivery ← AsnLineItem (ShipmentHeader ← ShipmentDelivery ← ShipmentLineItem)
```

**Receipt Object Hierarchy:**
```
ReceiptHeader ← ReceiptLineItem
```

**Invoice Object Hierarchy:**
```
InvoiceHeader ← InvoiceLineItem
```

#### **3. Custom Subtypes**
You can create custom subtypes from base models:
- **Order subtypes**: DiscreteOrder, BlanketOrder, PullOrder, etc.
- **Receipt subtypes**: Certificate, Inspection, etc.
- **ASN subtypes**: Shipment, ShipperBooking, etc.
- **Invoice subtypes**: FreightAudit, etc.

#### **4. Configuration Folder Structure**
- **SSP folder** = Out-of-the-box (OOTB) configurations from E2open
- **ext folder** = Project extensions/customizations

#### **5. Override Pattern**
- Use OOTB objects → Inherit SSP configurations + selective ext overrides
- Create custom objects → Only ext configurations needed
- Example: DiscreteOrder uses SSP + custom Actions in ext folder

#### **6. XML Structure**
```xml
<ExecutionBusinessObject isDefault="true" type="Order" subtype="DiscreteOrder">
  <AutoId>...</AutoId>
  <Relationships>...</Relationships>
  <StateMachine>
    <States>...</States>
    <Actions>...</Actions>
    <Transitions>...</Transitions>
    <UIValidationRules>...</UIValidationRules>
  </StateMachine>
  <StateAggregator>...</StateAggregator>
  <AutoTransitions>...</AutoTransitions>
  <PageSectionDefinitions>...</PageSectionDefinitions>
  <AuditSnapshotColumns>...</AuditSnapshotColumns>
  <AuditChangeColumns>...</AuditChangeColumns>
</ExecutionBusinessObject>
```

---

## AutoId Configuration

### Purpose
AutoId defines **database sequence management** for generating unique IDs for business object instances (PO numbers, Receipt numbers, etc.)

### Configuration Patterns

#### **1. Create New Sequence**
```xml
<AutoId name="PO_NUMBER_SEQ" incrementBy="1" startValue="1">
  <Prefix>SYSPO</Prefix>
  <Suffix/>
</AutoId>
```
- Creates a new database sequence
- `incrementBy="1"` = increment by 1 each time
- `startValue="1"` = starts counting from 1
- Use when you want completely independent numbering

#### **2. Reuse Existing Sequence**
```xml
<AutoId uses="PO_NUMBER_SEQ" />
```
- Shares sequence with other business objects
- **Example**: DiscreteOrder and BlanketOrder both use `PO_NUMBER_SEQ`
- **Result**: If you create DiscreteOrder (gets ID-1), then BlanketOrder gets ID-2
- Use when objects are related and shared numbering is acceptable

#### **3. Reuse Sequence with Custom Prefix**
```xml
<AutoId uses="PO_NUMBER_SEQ">
  <Prefix>SYSPULL</Prefix>
</AutoId>
```
- Uses existing sequence but adds different prefix
- Helpful for distinguishing object types while sharing numbering
- **Example**: Pull orders get "SYSPULL" prefix but use PO sequence

### Available Product Sequences
Common OOTB sequences you can reuse:
- `PO_NUMBER_SEQ` (Order-based objects)
- `ASN_ID_SEQ` (Shipment-based objects)  
- `RECEIPT_ID_SEQ` (Receipt-based objects)
- `INVOICE_ID_SEQ` (Invoice-based objects)
- Custom ones: `CERT_ID_SEQ`, `CHAT_ID_SEQ`, `CLAIM_ID_SEQ`, etc.

### Best Practices
- **Reuse existing sequences** when objects are related
- **Create new sequences** for completely different business processes
- **No strict naming convention** - dev teams have flexibility
- **Consider prefixes** to distinguish object types if sharing sequences
- **Test sequence behavior** in development environment first

### Real-World Example
```xml
<!-- OOTB Example -->
<ExecutionBusinessObject type="Order" subtype="DiscreteOrder">
  <AutoId name="PO_NUMBER_SEQ" incrementBy="1" startValue="1">
    <Prefix></Prefix>
    <Suffix />
  </AutoId>
</ExecutionBusinessObject>

<ExecutionBusinessObject type="Order" subtype="BlanketOrder">
  <AutoId uses="PO_NUMBER_SEQ" />
</ExecutionBusinessObject>
```
**Result**: DiscreteOrder and BlanketOrder share the same numbering sequence.

---

## Relationships Configuration

### Purpose
Relationships define **connections and data associations** between business objects, enabling:
- **Parent-child relationships** (e.g., BlanketOrder → DiscreteOrder)
- **Cross-referencing** between objects
- **UI navigation links** between related data
- **Business process workflows** that span multiple objects

### Key Concepts

#### **1. Object Hierarchy Levels**
E2open business objects have multiple levels for data organization:

**Order Object Hierarchy:**
```
PoHeader ← PoLineItem ← PoRequestSchedule ← PoPromiseSchedule
```

**ASN Object Hierarchy:**
```
AsnHeader ← AsnDelivery ← AsnLineItem (ShipmentHeader ← ShipmentDelivery ← ShipmentLineItem)
```

**Receipt Object Hierarchy:**
```
ReceiptHeader ← ReceiptLineItem
```

**Invoice Object Hierarchy:**
```
InvoiceHeader ← InvoiceLineItem
```

#### **2. Field Mapping Logic**
- Relationships match records using **field path mapping**
- Use correct object hierarchy: `PoHeader`, `PoLineItem`, `PoRequestSchedule`, `PoPromiseSchedule`
- Cross-object matching: `AsnHeader`, `AsnDelivery`, `AsnLineItem`, `ReceiptHeader`, `ReceiptLineItem`
- Custom fields: `PdfString15`, `PdfString10`, etc. (labels defined in AllBundles.properties)

#### **3. Cardinality Control**
- **maxCardinality** controls how many related records to retrieve
- **Performance optimization** - prevents loading too many records
- Example: `maxCardinality="1000"` = load max 1000 related records

### Configuration Patterns

#### **1. DiscreteOrder to Shipment Relationship**
```xml
<Relationship maxCardinality="1000" name="DPOToShipment">
  <SearchRules type="ASN">
    <MatchRule target="AsnHeader.DomainName" value="PoHeader.DomainName"/>
    <MatchRule target="AsnHeader.OrgName" value="PoHeader.OrgName"/>
    <MatchRule target="AsnHeader.CustomerName" value="PoHeader.CustomerName"/>
    <MatchRule target="AsnHeader.SupplierName" value="PoHeader.SupplierName"/>
    <MatchRule target="AsnLineItem.OrderModelSubType" value="PoHeader.ModelSubType"/>
    <MatchRule target="AsnHeader.ModelSubType" value="'Shipment'"/>
    <MatchRule target="AsnLineItem.OrderNumber" value="PoHeader.PoNumber" includeNulls="false"/>
    <MatchRule target="AsnLineItem.LineItemState" value="'ASN_NEW'">
      <AdditionalValues>
        <Value>'ASN_USER_STATE_2'</Value>
        <Value>'ASN_USER_STATE_1'</Value>
        <Value>'ASN_RECEIVED'</Value>
        <Value>'ASN_CLOSED'</Value>
        <Value>'ASN_USER_STATE_24'</Value>
        <Value>'ASN_USER_STATE_25'</Value>
      </AdditionalValues>
    </MatchRule>
  </SearchRules>
  <UiLink display="" targetFilter="procDPOToShipmentRelationshipList" 
          targetWorkflow="procDPOToShipmentRelationship"/>
</Relationship>
```

**Key Elements:**
- **Cross-object type matching**: Order (PO) → ASN (Shipment)  
- **Multi-level field matching**: Header and LineItem level matching
- **State filtering**: Only shows ASN records in specific states
- **Domain/Org scoping**: Ensures proper data isolation
- **Performance control**: maxCardinality="1000" limits result set

#### **2. DiscreteOrder to Receipt Relationship**
```xml
<Relationship maxCardinality="1000" name="DPOToReceipt">
  <SearchRules type="Receipt">
    <MatchRule target="ReceiptHeader.DomainName" value="PoHeader.DomainName"/>
    <MatchRule target="ReceiptHeader.OrgName" value="PoHeader.OrgName"/>
    <MatchRule target="ReceiptHeader.CustomerName" value="PoHeader.CustomerName"/>
    <MatchRule target="ReceiptHeader.SupplierName" value="PoHeader.SupplierName"/>
    <MatchRule target="ReceiptLineItem.OrderNumber" value="PoHeader.PoNumber" includeNulls="false"/>
    <MatchRule target="ReceiptLineItem.OrderModelSubType" value="PoHeader.ModelSubType"/>
  </SearchRules>
  <UiLink display="Receipt Data" targetFilter="standardReceiptList" 
          targetWorkflow="standardReceiptView"/>
</Relationship>
```

#### **3. Parent Order Reference**
```xml
<Relationship maxCardinality="1" name="ViewParentBlanketOrder">
  <SearchRules type="Order">
    <MatchRule target="PoHeader.ModelSubType" value="'BlanketOrder'"/>
    <MatchRule target="PoHeader.PoNumber" value="PoHeader.PdfString25"/>
  </SearchRules>
  <UiLink display="PoHeader.PdfString25" targetFilter="target" 
          targetWorkflow="BlanketOrderSearch"/>
</Relationship>
```

### SearchRules Configuration

#### **Common MatchRule Patterns:**
```xml
<!-- Exact field matching -->
<MatchRule target="PoHeader.PoNumber" value="PoHeader.PoNumber"/>

<!-- Literal value matching -->
<MatchRule target="PoHeader.ModelSubType" value="'DiscreteOrder'"/>

<!-- Null handling -->
<MatchRule target="AsnLineItem.OrderNumber" value="PoHeader.PoNumber" includeNulls="false"/>

<!-- Multiple value matching -->
<MatchRule target="AsnLineItem.LineItemState" value="'ASN_NEW'">
  <AdditionalValues>
    <Value>'ASN_RECEIVED'</Value>
    <Value>'ASN_CLOSED'</Value>
  </AdditionalValues>
</MatchRule>
```

#### **Target Object Types:**
- `type="Order"` - Links to other Order objects
- `type="Receipt"` - Links to Receipt objects  
- `type="ASN"` - Links to Shipment objects
- `type="Invoice"` - Links to Invoice objects

### Object Hierarchy Field Paths

#### **Order Object Field Paths:**
```xml
<!-- Header Level -->
<MatchRule target="PoHeader.DomainName" value="PoHeader.DomainName"/>
<MatchRule target="PoHeader.PoNumber" value="PoHeader.PoNumber"/>

<!-- Line Item Level -->
<MatchRule target="PoLineItem.ItemName" value="PoLineItem.ItemName"/>
<MatchRule target="PoLineItem.OrderNumber" value="PoHeader.PoNumber"/>

<!-- Request Schedule Level -->
<MatchRule target="PoRequestSchedule.RequestedDate" value="PoRequestSchedule.RequestedDate"/>

<!-- Promise Schedule Level -->
<MatchRule target="PoPromiseSchedule.PromisedDate" value="PoPromiseSchedule.PromisedDate"/>
```

#### **ASN Object Field Paths:**
```xml
<!-- Header Level -->
<MatchRule target="AsnHeader.DomainName" value="PoHeader.DomainName"/>
<MatchRule target="AsnHeader.AsnId" value="AsnHeader.AsnId"/>

<!-- Delivery Level (Higher than LineItem) -->
<MatchRule target="AsnDelivery.DeliveryDate" value="AsnDelivery.DeliveryDate"/>
<MatchRule target="AsnDelivery.DeliveredQuantity" value="AsnDelivery.DeliveredQuantity"/>

<!-- Line Item Level (Lower level, under Delivery) -->
<MatchRule target="AsnLineItem.OrderNumber" value="PoHeader.PoNumber"/>
<MatchRule target="AsnLineItem.OrderModelSubType" value="PoHeader.ModelSubType"/>
```

#### **Receipt & Invoice Object Field Paths:**
```xml
<!-- Receipt Fields -->
<MatchRule target="ReceiptHeader.CustomerName" value="PoHeader.CustomerName"/>
<MatchRule target="ReceiptLineItem.OrderNumber" value="PoHeader.PoNumber"/>

<!-- Invoice Fields -->
<MatchRule target="InvoiceHeader.SupplierName" value="PoHeader.SupplierName"/>
<MatchRule target="InvoiceLineItem.OrderNumber" value="PoHeader.PoNumber"/>
```

### UiLink Configuration

#### **UiLink Parameters:**
- **display**: Text shown in UI (can be literal or field reference)
- **targetFilter**: Filter to apply when navigating
- **targetWorkflow**: Workflow to open when link is clicked

```xml
<!-- Static display text -->
<UiLink display="Shipment Data" targetFilter="StandardShipmentList" 
        targetWorkflow="StandardShipmentView"/>

<!-- Dynamic display from field -->
<UiLink display="PoHeader.PdfString25" targetFilter="target" 
        targetWorkflow="BlanketOrderSearch"/>

<!-- Empty display (icon only) -->
<UiLink display="" targetFilter="procDPOToShipmentRelationshipList" 
        targetWorkflow="procDPOToShipmentRelationship"/>
```

### Real-World Integration Examples

#### **Order-to-Shipment Workflow:**
```xml
<!-- User clicks "Shipment Data" link on DiscreteOrder -->
<Relationship maxCardinality="1000" name="DPOToShipment">
  <SearchRules type="ASN">
    <!-- Match by PO Number -->
    <MatchRule target="AsnLineItem.OrderNumber" value="PoHeader.PoNumber" includeNulls="false"/>
    <!-- Match by Model Type -->
    <MatchRule target="AsnLineItem.OrderModelSubType" value="PoHeader.ModelSubType"/>
    <!-- Only show active shipments -->
    <MatchRule target="AsnLineItem.LineItemState" value="'ASN_NEW'">
      <AdditionalValues>
        <Value>'ASN_RECEIVED'</Value>
        <Value>'ASN_CLOSED'</Value>
      </AdditionalValues>
    </MatchRule>
  </SearchRules>
</Relationship>
```

#### **Order-to-Receipt Workflow:**
```xml
<!-- User clicks "Receipt Data" link on DiscreteOrder -->
<Relationship maxCardinality="1000" name="DPOToReceipt">
  <SearchRules type="Receipt">
    <!-- Match by PO Number and ensure same trading partners -->
    <MatchRule target="ReceiptLineItem.OrderNumber" value="PoHeader.PoNumber" includeNulls="false"/>
    <MatchRule target="ReceiptHeader.CustomerName" value="PoHeader.CustomerName"/>
    <MatchRule target="ReceiptHeader.SupplierName" value="PoHeader.SupplierName"/>
  </SearchRules>
</Relationship>
```

### Best Practices

#### **Performance Optimization:**
- **Set appropriate maxCardinality** (1000 for lists, 1 for single records)
- **Include essential MatchRules only** - more rules = better filtering but slower queries
- **Use includeNulls="false"** when matching on nullable fields
- **Use AdditionalValues** for state-based filtering

#### **Business Logic:**
- **Group related relationships** logically (e.g., all data views for an object)
- **Use descriptive names** that indicate the relationship purpose
- **Consider bidirectional relationships** when objects need to reference each other

#### **UI Design:**
- **Provide meaningful display text** for user-facing links
- **Use empty display=""** for action-oriented relationships (add, create, etc.)
- **Target appropriate workflows** that match the relationship context

### Cross-Object Integration Patterns

#### **Multi-Level Matching:**
```xml
<!-- Match at both Header and Line levels for accuracy -->
<MatchRule target="AsnHeader.CustomerName" value="PoHeader.CustomerName"/>
<MatchRule target="AsnHeader.SupplierName" value="PoHeader.SupplierName"/>
<MatchRule target="AsnLineItem.OrderNumber" value="PoHeader.PoNumber"/>
<MatchRule target="AsnLineItem.OrderModelSubType" value="PoHeader.ModelSubType"/>
```

#### **State-Based Filtering:**
```xml
<!-- Only show ASN records in business-relevant states -->
<MatchRule target="AsnLineItem.LineItemState" value="'ASN_NEW'">
  <AdditionalValues>
    <Value>'ASN_USER_STATE_1'</Value>
    <Value>'ASN_USER_STATE_2'</Value>
    <Value>'ASN_RECEIVED'</Value>
    <Value>'ASN_CLOSED'</Value>
  </AdditionalValues>
</MatchRule>
```

### Label Configuration in AllBundles.properties

Remember to define relationship labels in AllBundles.properties:
```properties
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.Relationship.DPOToShipment=Shipment Data
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.Relationship.ViewParentBlanketOrder=Parent Blanket Order
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.Relationship.DPOToReceipt=Receipt Data
```

---

## AuditChangeColumns Configuration

### Purpose
AuditChangeColumns defines **which fields to track for audit purposes** when users make changes to business objects. This enables:
- **Change history tracking** for compliance and debugging
- **Field-level audit trails** showing what changed, when, and by whom
- **UI audit views** displaying change history to users
- **Data export** of audit information for reporting

### Key Concepts

#### **1. Audit Tracking Scope**
- **Header fields**: Track changes to main object properties (e.g., `PoHeader.SupplierName`)
- **Line item fields**: Track changes to line-level data (e.g., `PoLineItem.ItemName`)
- **Schedule fields**: Track changes to schedule data (e.g., `PoRequestSchedule.Quantity`)
- **Custom PDF fields**: Track business-specific data (e.g., `PdfString15`, `PdfFloat10`)

#### **2. Display Options**
- **uiOrDownload="both"**: Show in UI audit views AND include in audit exports
- **uiOrDownload="ui"**: Show only in UI audit views
- **uiOrDownload="download"**: Include only in audit exports

#### **3. Field Types Supported**
- **String fields**: `PdfString1-100`, `PoHeader.SupplierName`, etc.
- **Numeric fields**: `PdfInteger1-50`, `PdfFloat1-50`
- **Date fields**: `PdfDate1-50`, `PoHeader.CreatedDate`
- **Standard fields**: Any database field from the object schema

### Configuration File Structure

#### **File Location Pattern:**
```
/MetaData/[ObjectType]/ext/[ObjectType]_AuditChangeColumns_ext.xml
```

**Examples:**
- Order objects: `/MetaData/Order/ext/Order_AuditChangeColumns_ext.xml`
- Receipt objects: `/MetaData/Receipt/ext/Receipt_AuditChangeColumns_ext.xml`
- ASN objects: `/MetaData/ASN/ext/ASN_AuditChangeColumns_ext.xml`

#### **Basic XML Structure:**
```xml
<AuditChangeColumns xmlns="http://scc.i2.com/OCMetaModel">
  <!-- Field comments for documentation -->
  <AuditChangeColumn name="[FieldPath]" uiOrDownload="both"/>
  <AuditChangeColumn name="[FieldPath]" uiOrDownload="ui"/>
  <AuditChangeColumn name="[FieldPath]" uiOrDownload="download"/>
</AuditChangeColumns>
```

### Configuration Examples

#### **1. Multi-Level DiscreteOrder Audit Configuration**
```xml
<AuditChangeColumns xmlns="http://scc.i2.com/OCMetaModel">
  <!-- Header Level Fields -->
  <AuditChangeColumn name="PoHeader.SupplierName" uiOrDownload="both"/>
  <AuditChangeColumn name="PoHeader.SuppSiteName" uiOrDownload="both"/>
  <AuditChangeColumn name="PoHeader.PoDate" uiOrDownload="both"/>
  <AuditChangeColumn name="PoHeader.RequiredDate" uiOrDownload="both"/>
  <AuditChangeColumn name="PoHeader.PdfString10" uiOrDownload="both"/>
  
  <!-- Line Item Level Fields -->
  <AuditChangeColumn name="PoLineItem.ItemName" uiOrDownload="both"/>
  <AuditChangeColumn name="PoLineItem.Quantity" uiOrDownload="both"/>
  <AuditChangeColumn name="PoLineItem.UnitPrice" uiOrDownload="both"/>
  <AuditChangeColumn name="PoLineItem.PdfString15" uiOrDownload="both"/>
  <AuditChangeColumn name="PoLineItem.PdfFloat10" uiOrDownload="both"/>
  
  <!-- Request Schedule Level Fields -->
  <AuditChangeColumn name="PoRequestSchedule.Quantity" uiOrDownload="both"/>
  <AuditChangeColumn name="PoRequestSchedule.RequestedDate" uiOrDownload="both"/>
  <AuditChangeColumn name="PoRequestSchedule.PdfString5" uiOrDownload="both"/>
  
  <!-- Promise Schedule Level Fields -->
  <AuditChangeColumn name="PoPromiseSchedule.Quantity" uiOrDownload="both"/>
  <AuditChangeColumn name="PoPromiseSchedule.PromisedDate" uiOrDownload="both"/>
  <AuditChangeColumn name="PoPromiseSchedule.PdfString8" uiOrDownload="both"/>
</AuditChangeColumns>
```

#### **2. ASN/Shipment Object Audit Configuration**
```xml
<AuditChangeColumns xmlns="http://scc.i2.com/OCMetaModel">
  <!-- Shipment Header Fields -->
  <AuditChangeColumn name="AsnHeader.AsnId" uiOrDownload="both"/>
  <AuditChangeColumn name="AsnHeader.ShipDate" uiOrDownload="both"/>
  <AuditChangeColumn name="AsnHeader.PdfString20" uiOrDownload="both"/>
  
  <!-- Shipment Delivery Fields -->
  <AuditChangeColumn name="AsnDelivery.DeliveredQuantity" uiOrDownload="both"/>
  <AuditChangeColumn name="AsnDelivery.DeliveryDate" uiOrDownload="both"/>
  <AuditChangeColumn name="AsnDelivery.PdfString10" uiOrDownload="both"/>
  
  <!-- Shipment Line Item Fields -->
  <AuditChangeColumn name="AsnLineItem.ShippedQuantity" uiOrDownload="both"/>
  <AuditChangeColumn name="AsnLineItem.ItemName" uiOrDownload="both"/>
  <AuditChangeColumn name="AsnLineItem.PdfString25" uiOrDownload="both"/>
</AuditChangeColumns>
```

#### **3. Receipt Object Audit Configuration**
```xml
<AuditChangeColumns xmlns="http://scc.i2.com/OCMetaModel">
  <!-- Receipt Header Fields -->
  <AuditChangeColumn name="ReceiptHeader.ReceiptId" uiOrDownload="both"/>
  <AuditChangeColumn name="ReceiptHeader.ReceiptDate" uiOrDownload="both"/>
  <AuditChangeColumns name="ReceiptHeader.PdfString10" uiOrDownload="both"/>
  
  <!-- Receipt Line Item Fields -->
  <AuditChangeColumn name="ReceiptLineItem.ReceivedQuantity" uiOrDownload="both"/>
  <AuditChangeColumn name="ReceiptLineItem.ItemName" uiOrDownload="both"/>
  <AuditChangeColumn name="ReceiptLineItem.PdfString43" uiOrDownload="both"/>
  <AuditChangeColumn name="ReceiptLineItem.PdfInteger24" uiOrDownload="both"/>
  <AuditChangeColumn name="ReceiptLineItem.PdfFloat21" uiOrDownload="both"/>
</AuditChangeColumns>
```

### Field Path Patterns by Object Level

#### **Order Object Field Paths:**
```xml
<!-- Header Level -->
<AuditChangeColumn name="PoHeader.SupplierName" uiOrDownload="both"/>
<AuditChangeColumn name="PoHeader.PdfString10" uiOrDownload="both"/>

<!-- Line Item Level -->
<AuditChangeColumn name="PoLineItem.ItemName" uiOrDownload="both"/>
<AuditChangeColumn name="PoLineItem.PdfString25" uiOrDownload="both"/>

<!-- Request Schedule Level -->
<AuditChangeColumn name="PoRequestSchedule.Quantity" uiOrDownload="both"/>
<AuditChangeColumn name="PoRequestSchedule.PdfInteger10" uiOrDownload="both"/>

<!-- Promise Schedule Level -->
<AuditChangeColumn name="PoPromiseSchedule.PromisedDate" uiOrDownload="both"/>
<AuditChangeColumn name="PoPromiseSchedule.PdfFloat15" uiOrDownload="both"/>
```

#### **ASN Object Field Paths:**
```xml
<!-- Header Level -->
<AuditChangeColumn name="AsnHeader.AsnId" uiOrDownload="both"/>
<AuditChangeColumn name="AsnHeader.PdfString20" uiOrDownload="both"/>

<!-- Delivery Level (Higher than LineItem) -->
<AuditChangeColumn name="AsnDelivery.DeliveredQuantity" uiOrDownload="both"/>
<AuditChangeColumn name="AsnDelivery.PdfString10" uiOrDownload="both"/>

<!-- Line Item Level (Lower level, under Delivery) -->
<AuditChangeColumn name="AsnLineItem.ShippedQuantity" uiOrDownload="both"/>
<AuditChangeColumn name="AsnLineItem.PdfString30" uiOrDownload="both"/>
```

#### **Receipt & Invoice Object Field Paths:**
```xml
<!-- Receipt Fields -->
<AuditChangeColumn name="ReceiptHeader.ReceiptId" uiOrDownload="both"/>
<AuditChangeColumn name="ReceiptLineItem.ReceivedQuantity" uiOrDownload="both"/>

<!-- Invoice Fields -->
<AuditChangeColumn name="InvoiceHeader.InvoiceNumber" uiOrDownload="both"/>
<AuditChangeColumn name="InvoiceLineItem.InvoiceAmount" uiOrDownload="both"/>
```

### Integration with AllBundles.properties

#### **Field Labels Must Be Defined:**
For each audited field, define user-friendly labels in AllBundles.properties:

```properties
# DiscreteOrder field labels
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoHeader.PdfString10=Project Code
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoLineItem.PdfString15=Supplier Part Number
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.PdfString5=Schedule Status
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoPromiseSchedule.PdfString8=Promise Status

# ASN field labels
exe.web.broker_domain.broker_org.default_cusu_group.ASN.Shipment.AsnHeader.PdfString20=Carrier Name
exe.web.broker_domain.broker_org.default_cusu_group.ASN.Shipment.AsnDelivery.PdfString10=Delivery Status
exe.web.broker_domain.broker_org.default_cusu_group.ASN.Shipment.AsnLineItem.PdfString25=Tracking Number

# Receipt field labels  
exe.web.broker_domain.broker_org.default_cusu_group.Receipt.Receipt.ReceiptHeader.PdfString10=Receipt Status
exe.web.broker_domain.broker_org.default_cusu_group.Receipt.Receipt.ReceiptLineItem.PdfString43=Process Id
```

#### **Label Pattern:**
```
exe.web.broker_domain.broker_org.default_cusu_group.[ObjectType].[SubType].[FieldPath]=[User Label]
```

### Best Practices

#### **Performance Considerations:**
- **Audit only essential fields** - too many fields can impact performance
- **Use selective uiOrDownload** - not all fields need to be in both UI and export
- **Group related fields** logically with comments for maintainability
- **Consider object hierarchy** - audit fields at appropriate levels

#### **Business Requirements:**
- **Include compliance-critical fields** (quantities, prices, dates)
- **Track status changes** at all levels for workflow monitoring
- **Consider user workflow** - what changes do users need to see?
- **Track cross-level relationships** (e.g., header changes affecting lines)

#### **Maintenance:**
- **Document field purposes** with XML comments
- **Keep AllBundles.properties in sync** with audited fields
- **Test audit views** after adding new fields
- **Review audit configuration** during business requirement changes

This audit configuration ensures that all critical changes are tracked across the complete object hierarchy and available for both user review and compliance reporting.

---

## States, Actions & Transitions Configuration

### Purpose
This section covers the **complete workflow configuration** for business objects, including:
- **StateAggregator**: Priority-based state rollup rules across object hierarchy
- **States**: State definitions with UI icons and business logic handlers
- **Actions**: User and system actions that trigger workflow operations
- **Transitions**: State change rules with role-based access control

### StateAggregator Configuration

#### **Purpose**
StateAggregator defines **state priority rules** for rolling up states from child objects to parent objects in multi-level hierarchies. This enables:
- **Hierarchical state management** across object levels
- **Priority-based state aggregation** using configurable rules
- **Dominant state calculation** when multiple child states exist
- **Business logic enforcement** for state rollup behavior

#### **Key Concepts**

#### **1. Object Hierarchy Levels**
E2open business objects have multiple levels that need state aggregation:

**Order Object Hierarchy:**
```
PoHeader ← aggregates from PoLineItem ← aggregates from PoRequestSchedule ← aggregates from PoPromiseSchedule
```

**ASN Object Hierarchy:**
```
AsnHeader ← aggregates from AsnDelivery ← aggregates from AsnLineItem
```

**Receipt Object Hierarchy:**
```
ReceiptHeader ← aggregates from ReceiptLineItem
```

**Invoice Object Hierarchy:**
```
InvoiceHeader ← aggregates from InvoiceLineItem
```

#### **2. Priority-Based Aggregation**
- **Lower priority numbers = Higher priority states**
- **Highest priority child state becomes the parent state**
- **System states have special priority handling**

#### **3. Business Scenario Example**
```
PO Line has 4 Request Schedules:
- 3 schedules in "Open" state (priority 200)  
- 1 schedule in "Cancelled" state (priority 600)
→ Result: PO Line shows "Open" (priority 200 wins over 600)
```

### Configuration Structure

#### **File Location:**
```
/MetaData/[ObjectType]/ssp/[ObjectType]_StateAggregator_SSP.xml
/MetaData/[ObjectType]/ext/[ObjectType]_StateAggregator_ext.xml
```

#### **Basic XML Structure:**
```xml
<StateAggregator xmlns="http://scc.i2.com/OCMetaModel">
  <PriorityAggregator isDefault="true" typeName="[AGGREGATOR_TYPE]">
    <Priority statePriority="[NUMBER]" userStateName="[STATE_NAME]"/>
    <!-- Additional priority definitions -->
  </PriorityAggregator>
</StateAggregator>
```

### Real-World Example: DiscreteOrder StateAggregator

```xml
<StateAggregator xmlns="http://scc.i2.com/OCMetaModel">
  <PriorityAggregator isDefault="true" typeName="PO_GENERIC">
    <!-- System States -->
    <Priority statePriority="9999" userStateName="System Initial"/>
    <Priority statePriority="9000" userStateName="Maintenance"/>
    <Priority statePriority="9900" userStateName="ToBePurged"/>
    
    <!-- Active Business States (Highest Priority) -->
    <Priority statePriority="100" userStateName="New"/>
    <Priority statePriority="200" userStateName="Open"/>
    <Priority statePriority="210" userStateName="UnderReview"/>
    
    <!-- Response States -->
    <Priority statePriority="300" userStateName="Supplier Rejected"/>
    <Priority statePriority="400" userStateName="Accepted with Changes"/>
    <Priority statePriority="500" userStateName="Accepted"/>
    
    <!-- Fulfillment States -->
    <Priority statePriority="510" userStateName="Partially Shipped"/>
    <Priority statePriority="520" userStateName="Shipped"/>
    
    <!-- Final States (Lower Priority) -->
    <Priority statePriority="600" userStateName="Cancelled"/>
    <Priority statePriority="700" userStateName="Closed"/>
  </PriorityAggregator>
</StateAggregator>
```

#### **Priority Logic Analysis**

#### **State Priority Groups:**
1. **Active States (100-210)**: New, Open, UnderReview
2. **Response States (300-500)**: Supplier interactions, acceptance decisions  
3. **Fulfillment States (510-520)**: Shipping and delivery tracking
4. **Final States (600-700)**: Cancelled, Closed
5. **System States (9000+)**: Maintenance, ToBePurged, System Initial

#### **Aggregation Rules:**
- **"New" (100) dominates "Closed" (700)** - New activity overrides completion
- **"Open" (200) dominates "Cancelled" (600)** - Active work overrides cancellation
- **"Supplier Rejected" (300) dominates "Accepted" (500)** - Problems surface over success
- **"System Initial" (9999) is overridden by everything** - Default startup state

### Hierarchy Aggregation Examples

#### **Example 1: PO Request Schedule → Line Aggregation**
```
PO Line has 4 Request Schedules:
- Schedule 1: "Open" (priority 200)
- Schedule 2: "Open" (priority 200)  
- Schedule 3: "Open" (priority 200)
- Schedule 4: "Cancelled" (priority 600)

Result: PO Line State = "Open" (200 < 600, higher priority wins)
```

#### **Example 2: PO Line → Header Aggregation**
```
PO Header has 3 Line Items:
- Line 1: "Supplier Rejected" (priority 300)
- Line 2: "Accepted" (priority 500)
- Line 3: "Shipped" (priority 520)

Result: PO Header State = "Supplier Rejected" (300 is highest priority)
```

#### **Example 3: Mixed State Scenarios**
```
Complex PO with mixed states:
- Line 1: "New" (100) - just added
- Line 2: "Closed" (700) - completed  
- Line 3: "Cancelled" (600) - cancelled

Result: PO Header State = "New" (100 is highest priority)
```

### Best Practices

#### **Priority Number Assignment:**
- **Use increments of 10-50** to allow inserting new states later
- **Group related states numerically** (e.g., 200-299 for active states)
- **Reserve 9000+ for system states**
- **Keep business states under 1000**

---

## States Configuration

### Purpose
States configuration defines **all possible states** that business objects can have throughout their lifecycle. This includes:
- **State definitions** with system and user-friendly names
- **UI icons and styling** for visual representation
- **State handler classes** for business logic processing
- **Super state relationships** for hierarchical state management

### Key Concepts

#### **1. State Types**
- **System States**: Technical states like "SYSTEM_INITIAL", "CLOSED"
- **User States**: Business-friendly names like "New", "Open", "Accepted"
- **Super States**: Parent states that group related sub-states

#### **2. State Hierarchy**
States can have parent-child relationships:
```
UnderReview (Parent State)
├── Long Tail Accepted (Child)
├── Long Tail Accepted with Changes (Child)
├── Long Tail Rejected (Child)
└── Long Tail On Hold (Child)
```


#### **3. Visual Representation**
Each state has an icon and color for UI display:
- **Icons**: Material Design icons (e.g., "play_arrow", "thumb_up", "close")
- **Colors**: Blue, green, yellow, red, gray for different meanings

### Configuration Structure

#### **File Location:**
```
/MetaData/[ObjectType]/ssp/[ObjectType]_States_SSP.xml
/MetaData/[ObjectType]/ext/[ObjectType]_States_ext.xml
```

#### **Basic XML Structure:**
```xml
<States xmlns="http://scc.i2.com/OCMetaModel">
  <State cerpEnabledOnState="false" 
         serpEnabledOnState="false" 
         stateHandlerClass="[HANDLER_CLASS]" 
         superStateUserName="[PARENT_STATE]" 
         systemStateName="[SYSTEM_NAME]" 
         userStateName="[USER_NAME]"
         icon="[ICON_NAME]"/>
</States>
```

### Real-World Example: DiscreteOrder States

```xml
<States xmlns="http://scc.i2.com/OCMetaModel">
  <!-- System States -->
  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.SystemInitialHandler" 
         superStateUserName="$null" 
         systemStateName="SYSTEM_INITIAL" 
         userStateName="System Initial"/>

  <!-- Primary Business States -->
  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler" 
         superStateUserName="$null" 
         systemStateName="INIT_CUSTOMER_CREATED_NEW" 
         userStateName="New" 
         icon="library_add-blue"/>

  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler" 
         superStateUserName="$null" 
         systemStateName="OPEN" 
         userStateName="Open" 
         icon="play_arrow-blue"/>

  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler" 
         superStateUserName="$null" 
         systemStateName="USER_STATE_18" 
         userStateName="UnderReview" 
         icon="input-yellow"/>

  <!-- Acceptance States -->
  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler" 
         superStateUserName="$null" 
         systemStateName="ACCEPTED" 
         userStateName="Accepted" 
         icon="thumb_up-green"/>

  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler" 
         superStateUserName="$null" 
         systemStateName="ACCEPTED_WITH_CHANGES" 
         userStateName="Accepted with Changes" 
         icon="thumb_up-yellow"/>

  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler" 
         superStateUserName="$null" 
         systemStateName="USER_STATE_1" 
         userStateName="Supplier Rejected" 
         icon="eject-red"/>

  <!-- Fulfillment States -->
  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler" 
         superStateUserName="$null" 
         systemStateName="USER_STATE_20" 
         userStateName="Partially Shipped" 
         icon="local_shipping-yellow"/>

  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler" 
         superStateUserName="$null" 
         systemStateName="USER_STATE_21" 
         userStateName="Shipped" 
         icon="local_shipping-blue"/>

  <!-- Final States -->
  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler" 
         superStateUserName="$null" 
         systemStateName="CUSTOMER_CANCELLED" 
         userStateName="Cancelled" 
         icon="do_not_disturb-yellow"/>

  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler" 
         superStateUserName="$null" 
         systemStateName="CLOSED" 
         userStateName="Closed" 
         icon="close-gray"/>

  <!-- System Maintenance States -->
  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler" 
         superStateUserName="$null" 
         systemStateName="USER_STATE_2" 
         userStateName="Maintenance" 
         icon="build-gray"/>

  <State cerpEnabledOnState="false" serpEnabledOnState="false" 
         stateHandlerClass="com.i2.gs.cgrp.exe.state.impl.GenericStateHandler" 
         superStateUserName="$null" 
         systemStateName="USER_STATE_3" 
         userStateName="ToBePurged" 
         icon="delete-gray"/>
</States>
```

#### **State Attribute Reference**

#### **Required Attributes:**
- **systemStateName**: Internal E2open state identifier (e.g., "OPEN", "USER_STATE_1")
- **userStateName**: Business-friendly display name (e.g., "Open", "Supplier Rejected")
- **stateHandlerClass**: Java class that processes state logic

#### **Optional Attributes:**
- **superStateUserName**: Parent state for hierarchical grouping ("$null" = no parent)
- **icon**: UI icon with color (e.g., "play_arrow-blue", "thumb_up-green")
- **cerpEnabledOnState**: Collaboration event reporting (typically "false")
- **serpEnabledOnState**: Supplier event reporting (typically "false")

### Icon and Color Patterns

#### **Icon Categories:**
- **Action Icons**: `play_arrow` (start), `pause` (wait), `stop` (end)
- **Status Icons**: `thumb_up` (approved), `thumb_down` (rejected), `input` (review)
- **Process Icons**: `local_shipping` (shipping), `build` (maintenance), `close` (closed)
- **Alert Icons**: `warning` (caution), `error` (problem), `do_not_disturb` (cancelled)

#### **Color Meanings:**
- **Blue**: Active, in-progress states
- **Green**: Successful, approved states  
- **Yellow**: Warning, pending states
- **Red**: Error, rejected states
- **Gray**: Inactive, closed states

#### **Icon Naming Convention:**
```xml
<!-- Format: [icon-name]-[color] -->
<State icon="play_arrow-blue" userStateName="Open"/>
<State icon="thumb_up-green" userStateName="Accepted"/>
<State icon="warning-yellow" userStateName="UnderReview"/>
<State icon="eject-red" userStateName="Rejected"/>
<State icon="close-gray" userStateName="Closed"/>
```

---

## Actions & Transitions Configuration

### Purpose
Actions and Transitions define **workflow behavior** for business objects, including:
- **User actions** that trigger state changes
- **System actions** for background processing
- **Field validations** and business rules
- **State transitions** with role-based access control
- **UI operations** and field updates

### Key Concepts

#### **1. Action Types**
Based on real DiscreteOrder OOTB configuration:

**Business Actions (User-Facing):**
- User clicks buttons in UI to execute these actions
- Have visible `actionButtonName` (e.g., "Accept", "Reject", "Cancel")

**System Actions (Background):**
- API calls, scheduled processes, integration events
- Use `actionButtonName="$null"` (no UI button)

**UI Creation Actions:**
- Actions that create related documents
- Examples: Create ASN, Create Receipt, Create Invoice

#### **2. Action XML Structure**
```xml
<Action actionButtonName="[BUTTON_TEXT]" 
        systemActionName="[SYSTEM_ID]" 
        userActionName="[ACTION_DISPLAY_NAME]">
  <!-- Action content: validations, field updates, operations -->
</Action>
```

**Key Attributes:**
- `actionButtonName` = Text shown on UI button (what users see)
- `systemActionName` = Internal E2open action identifier (for transitions, APIs)
- `userActionName` = Action display name/identifier

#### **3. System Action Name Patterns**
From real DiscreteOrder configuration:
- **OOTB Actions**: `INIT_CUSTOMER_CREATE`, `SUPPLIER_ACCEPT`, `CUSTOMER_CANCELLED`
- **User Actions**: `USER_ACTION_1`, `USER_ACTION_2`, ..., `USER_ACTION_201`
- **Custom Actions**: Descriptive names like `AutoMoveToBePurged`

### Real OOTB Action Examples

#### **1. Core Business Actions**
```xml
<!-- Accept Action -->
<Action actionButtonName="Accept" 
        systemActionName="USER_ACTION_1" 
        userActionName="UI_Accept_MP">
  <Operation isInline="false" name="RESTORE_PROMISE_STRUCTURE(DOPromiseInitCopy)"/>
  <Set field="PoPromiseSchedule.PromiseDate" value="OriginalPoRequestSchedule.RequestDate"/>
  <Set field="PoPromiseSchedule.PromiseQuantity" value="OriginalPoRequestSchedule.RequestQuantity"/>
  <Validate isFinalValidate="true" condition="OriginalPoRequestSchedule.PdfInteger5 != 20" 
            resId="DPO_EDC_Validate_Msg20"/>
  <UiEdit field="PoHeader.SupplierMessage"/>
</Action>

<!-- Reject Action -->
<Action actionButtonName="Reject" 
        systemActionName="USER_ACTION_5" 
        userActionName="UI_Reject_MP">
  <UiEdit field="PoHeader.SupplierMessage"/>
  <Validate isFinalValidate="false" condition="PoHeader.SupplierMessage != null" 
            resId="DPO_Supplier_Message_Required"/>
</Action>

<!-- Cancel Action -->
<Action actionButtonName="Cancel" 
        systemActionName="USER_ACTION_7" 
        userActionName="UI_Cancel_MP">
  <Set field="PoHeader.PdfString30" value="'CANCELLED_BY_USER'"/>
  <UiEdit field="PoHeader.CustomerMessage"/>
</Action>
```

#### **2. System Actions (Background)**
```xml
<!-- System Insert/Update -->
<Action actionButtonName="$null" 
        systemActionName="INIT_CUSTOMER_CREATE" 
        userActionName="InsertOrUpdate">
</Action>

<!-- Supplier Backend Actions -->
<Action actionButtonName="$null" 
        systemActionName="SUPPLIER_ACCEPT" 
        userActionName="Accept">
  <Set field="PoPromiseSchedule.PromiseDate" value="PoRequestSchedule.RequestedDate"/>
  <Set field="PoPromiseSchedule.PromiseQuantity" value="PoRequestSchedule.Quantity"/>
</Action>
```

#### **3. Document Creation Actions**
```xml
<!-- Create ASN from PO -->
<Action actionButtonName="UI_Create_Asn_Po" 
        systemActionName="USER_ACTION_146" 
        userActionName="UI_Create_Asn_Po">
</Action>

<!-- Create Receipt from PO -->
<Action actionButtonName="UI_Create_Receipt_Po" 
        systemActionName="USER_ACTION_144" 
        userActionName="UI_Create_Receipt_Po">
</Action>

<!-- Create Invoice from PO -->
<Action actionButtonName="UI_Create_Invoice_Po" 
        systemActionName="USER_ACTION_145" 
        userActionName="UI_Create_Invoice_Po">
</Action>
```

### Action Content Elements

#### **1. Field Updates (`<Set>` Elements)**
```xml
<!-- Set field to literal value -->
<Set field="PoHeader.PdfString30" value="'ACCEPTED_STATUS'"/>

<!-- Copy field value -->
<Set field="PoPromiseSchedule.PromiseDate" value="OriginalPoRequestSchedule.RequestDate"/>

<!-- Set to current timestamp -->
<Set field="PoHeader.LastUpdateDate" value="now()"/>

<!-- Set based on calculation -->
<Set field="PoLineItem.ExtendedPrice" value="PoLineItem.Quantity * PoLineItem.UnitPrice"/>
```

#### **2. Validations (`<Validate>` Elements)**
```xml
<!-- Final validation - check all fields first, then throw error -->
<Validate isFinalValidate="true" 
          condition="OriginalPoRequestSchedule.PdfInteger5 != 20" 
          resId="DPO_EDC_Validate_Msg20"/>

<!-- Immediate validation - throw error when this line is processed -->
<Validate isFinalValidate="false" 
          condition="PoHeader.SupplierMessage != null" 
          resId="DPO_Supplier_Message_Required"/>

<!-- Complex condition validation -->
<Validate isFinalValidate="true" 
          condition="PoRequestSchedule.Quantity > 0 AND PoRequestSchedule.RequestedDate != null" 
          resId="DPO_Schedule_Required_Fields"/>
```

**Validation Processing Logic:**
- **Sequential processing**: System processes action elements line by line
- **isFinalValidate="true"**: Collect all validation errors, throw at end of block
- **isFinalValidate="false"**: Stop immediately and throw error when condition fails

#### **3. Operations (`<Operation>` Elements)**
Operations call **Java classes** for complex business logic:
```xml
<!-- Restore promise structure -->
<Operation isInline="false" name="RESTORE_PROMISE_STRUCTURE(DOPromiseInitCopy)"/>

<!-- Custom business logic -->
<Operation isInline="false" name="CALCULATE_DELIVERY_DATES"/>

<!-- EDC processing -->
<Operation isInline="false" name="EDC_VERSION_CONTROL(PoHeader.PdfInteger10)"/>
```

#### **4. UI Elements (`<UiEdit>`, `<UiHideAction>`)**
```xml
<!-- Allow user to edit field during action -->
<UiEdit field="PoHeader.SupplierMessage"/>
<UiEdit field="PoRequestSchedule.PdfDate50"/>

<!-- Hide action button based on condition -->
<UiHideAction condition="OriginalPoRequestSchedule.PdfInteger5 == 20"/>

<!-- Show action only for specific roles -->
<UiShowAction condition="UserRole == 'CUSTOMER'"/>
```

### Custom Workflow Configuration Example

Based on your "UI Update Date" requirement, here's the proper configuration:

#### **Step 1: Check Available USER_ACTION Numbers**
From your DiscreteOrder Actions file, actions go up to `USER_ACTION_201`, so `USER_ACTION_202` and `USER_ACTION_203` would be safe for new actions.

#### **Step 2: Configure Custom Actions**
```xml
<!-- Action 1: UI Update Date -->
<Action actionButtonName="Update Date" 
        systemActionName="USER_ACTION_202" 
        userActionName="UI_Update_Date">
  <!-- Allow user to edit the date field -->
  <UiEdit field="PoRequestSchedule.PdfDate50"/>
  
  <!-- Validate date is provided -->
  <Validate isFinalValidate="true" 
            condition="PoRequestSchedule.PdfDate50 != null" 
            resId="UPDATE_DATE_REQUIRED_MSG"/>
  
  <!-- Validate date is in future -->
  <Validate isFinalValidate="true" 
            condition="PoRequestSchedule.PdfDate50 > now()" 
            resId="UPDATE_DATE_FUTURE_MSG"/>
  
  <!-- Set audit fields -->
  <Set field="PoRequestSchedule.PdfString10" value="'DATE_UPDATE_PENDING'"/>
</Action>

<!-- Action 2: Approve Update Date -->
<Action actionButtonName="Approve Update Date" 
        systemActionName="USER_ACTION_203" 
        userActionName="UI_Approve_Update_Date">
  <!-- Set approval status -->
  <Set field="PoRequestSchedule.PdfString10" value="'DATE_UPDATE_APPROVED'"/>
  
  <!-- Set approval timestamp -->
  <Set field="PoRequestSchedule.PdfDate51" value="now()"/>
  
  <!-- Optional: Call custom business logic -->
  <Operation isInline="false" name="NOTIFY_DATE_APPROVAL(PoHeader.PoNumber)"/>
</Action>
```

#### **Step 3: Configure Transitions**
```xml
<!-- Step 1: Open → Pending Update Date -->
<Transition fromState="Open" 
            toState="Pending Update Date" 
            actionName="USER_ACTION_202" 
            roleType="CUSTOMER"/>

<!-- Step 2: Pending Update Date → Open -->
<Transition fromState="Pending Update Date" 
            toState="Open" 
            actionName="USER_ACTION_203" 
            roleType="CUSTOMER"/>
```

#### **Step 4: Update AllBundles.properties**
```properties
# State labels
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.State.PendingUpdateDate=Pending Update Date

# Action labels
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.Action.USER_ACTION_202=Update Date
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.Action.USER_ACTION_203=Approve Update Date

# Field labels
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.PdfDate50=Update Date
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.PdfString10=Update Status
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.PdfDate51=Approval Date

# Validation error messages
UPDATE_DATE_REQUIRED_MSG=Update date is required before proceeding.
UPDATE_DATE_FUTURE_MSG=Update date must be a future date.
DPO_EDC_Validate_Msg20=EDC validation failed - item cannot be processed in current state.
DPO_Supplier_Message_Required=Supplier message is required for rejection.
```

### Configuration Workflow Questions

When teams request custom workflow configuration, ask these questions:

#### **Essential Information:**
1. **Field to update**: "Which field should the action update?" (e.g., `PoRequestSchedule.PdfDate50`)
2. **Available USER_ACTION numbers**: "Let me scan for available USER_ACTION_X numbers..."
3. **Action button text**: "What text should appear on the action buttons?" (Solution architect decides with customer)
4. **State names**: "What should the new state be called?" (Check available USER_STATE_X numbers)
5. **Icon preference**: "What icon do you want for the new state?" (Suggest if not provided)
6. **Role permissions**: "Who can execute these actions?" (CUSTOMER, SUPPLIER, BOTH)

#### **Validation Requirements:**
1. **Validation needed**: "Do these actions need validation rules?"
2. **Error messages**: "What error messages should display for validation failures?"
3. **Validation timing**: "Should validation check all fields first (isFinalValidate=true) or stop immediately on first error (isFinalValidate=false)?"

#### **Business Logic:**
1. **Field updates**: "What fields need to be set during the action?"
2. **Java operations**: "Does this need custom business logic (Java operations)?"
3. **UI behavior**: "Which fields should users be able to edit during the action?"
4. **Audit trail**: "What audit information needs to be captured?"

### Best Practices

#### **Action Design:**
- **Use descriptive actionButtonName** - this is what users see
- **Follow USER_ACTION_X numbering** for systemActionName
- **Keep actions focused** - one action should do one business function
- **Plan validation strategy** - decide on isFinalValidate based on user experience

#### **Validation Strategy:**
- **Use isFinalValidate="true"** for forms with multiple required fields
- **Use isFinalValidate="false"** for critical single-field validations
- **Provide clear error messages** in AllBundles.properties
- **Test validation order** - validations process sequentially

#### **State Management:**
- **Check available USER_STATE_X numbers** before creating new states
- **Leave buffer space** in StateAggregator priorities (e.g., 200, 250, 300)
- **Plan transition paths** - users should have clear workflow progression
- **Consider role-based access** in transitions

#### **Integration:**
- **Update AllBundles.properties** for all new actions, states, fields, and error messages
- **Update role_info configuration** for new action permissions
- **Test cross-object relationships** if actions affect related objects
- **Document custom business logic** in operations

This comprehensive States, Actions & Transitions configuration enables teams to build sophisticated workflows while maintaining E2open OOTB patterns and ensuring proper integration with the broader platform.

### Actions Configuration - Date/Time Functions

#### **Available Date/Time Functions**
Looking at real DiscreteOrder configurations, E2open provides several date/time functions:

```xml
<!-- Current date/time function -->
<Set field="PoHeader.PoCreationDate" value="CURRENT_DATE"/>

<!-- Date comparison with arithmetic -->
<Validate condition="(PoLineItem.PdfString47 == 'Yes') OR
                    (PoRequestSchedule.PdfString35 == 'Yes') OR
                    (COUNT(DPOToShipmentVert) > 0) OR
                    ((PoPromiseSchedule.PromiseShipmentDate != null) AND
                    (TO_START_OF_DAY(PoPromiseSchedule.PromiseShipmentDate) > TO_START_OF_DAY(CURRENT_DATE - days(2))))"
           resId="DPO_Validate_Msg25"/>
```

#### **Date/Time Function Reference**

##### **1. Current Date/Time Functions**
```xml
<!-- Current timestamp -->
<Set field="PoRequestSchedule.PdfDate51" value="CURRENT_DATE"/>

<!-- Current date reset to 00:00:00 UTC -->
<Set field="PoRequestSchedule.PdfDate52" value="TO_START_OF_DAY(CURRENT_DATE)"/>
```

##### **2. Date Arithmetic Functions**
```xml
<!-- Subtract days from current date -->
<Set field="PoRequestSchedule.PdfDate50" value="CURRENT_DATE - days(2)"/>

<!-- Add days to current date -->
<Set field="PoRequestSchedule.PdfDate50" value="CURRENT_DATE + days(7)"/>
```

##### **3. Date Manipulation Functions**
```xml
<!-- Reset time to 00:00:00 UTC (start of day) -->
<Set field="PoRequestSchedule.PdfDate50" value="TO_START_OF_DAY(CURRENT_DATE)"/>

<!-- Compare dates ignoring time component -->
<Validate condition="TO_START_OF_DAY(PoPromiseSchedule.PromiseDate) >= TO_START_OF_DAY(CURRENT_DATE)" 
          resId="PROMISE_DATE_NOT_IN_PAST"/>
```

#### **Function Behavior Details**

**CURRENT_DATE Function:**
- **Returns**: Current timestamp in **UTC timezone**
- **Format**: Full timestamp with date and time
- **Usage**: Most common for setting "last modified" timestamps

**TO_START_OF_DAY Function:**
- **Purpose**: Resets time component to **00:00:00 UTC**
- **Input**: Any date/timestamp value
- **Output**: Same date with time set to midnight UTC
- **Usage**: Date-only comparisons ignoring time

**days() Function:**
- **Purpose**: Date arithmetic for adding/subtracting days
- **Syntax**: `CURRENT_DATE - days(2)` or `CURRENT_DATE + days(7)`
- **Usage**: Relative date calculations

**Real Example Logic Breakdown:**
```
CURRENT_DATE - days(2) = Current UTC time minus 2 days
TO_START_OF_DAY(CURRENT_DATE - days(2)) = 2 days ago at 00:00:00 UTC
TO_START_OF_DAY(PoPromiseSchedule.PromiseShipmentDate) = Promise ship date at 00:00:00 UTC
Result: Validates shipment date is not more than 2 days old (ignoring time)
```

---

## role_info Configuration

### Purpose
role_info configuration defines **role-based access control** for business objects, actions, states, and custom fields. This enables:
- **Action permissions** - Who can execute specific workflow actions
- **State access control** - Which roles can see/modify objects in specific states
- **Field-level security** - Custom PDF field and enum value access by role
- **Private hub architecture** - Single customer deployment with hardcoded domain/org

### Key Concepts

#### **1. Private Hub Architecture**
E2open implementations typically use **"private hub"** model:
- **One customer, one application** deployment
- **Hardcoded domain/organization**: `broker_domain` and `broker_org`
- **Simplified role management** without multi-tenant complexity

#### **2. Tab-Separated Configuration**
role_info.txt uses **tab-separated values** with this structure:
```
Domain | Organization | Role | EntityType |

// ...existing content...

## role_info Configuration

### Purpose
role_info configuration defines **role-based access control** for business objects, actions, states, and custom fields. This enables:
- **Action permissions** - Who can execute specific workflow actions
- **State access control** - Which roles can see/modify objects in specific states
- **Field-level security** - Custom PDF field and enum value access by role
- **Private hub architecture** - Single customer deployment with hardcoded domain/org

### Key Concepts

#### **1. Private Hub Architecture**
E2open implementations typically use **"private hub"** model:
- **One customer, one application** deployment
- **Hardcoded domain/organization**: `broker_domain` and `broker_org`
- **Simplified role management** without multi-tenant complexity

#### **2. Tab-Separated Configuration**
role_info.txt uses **tab-separated values** with this structure:
```
Domain | Organization | Role | EntityType | EntityName | PrivilegeMask
```

#### **3. Privilege Levels**
- **0**: Read-only access (mandatory active)
- **1**: Read & write access (non-mandatory active)
- **-1**: Access denied/hidden (inactive)

### Configuration Structure

#### **File Location:**
```
/e2open/app/projects/ssp/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/role_info.txt
/e2open/app/projects/ssp-ext/E2/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/role_info.txt
```

#### **Basic Format:**
```
#broker_domain	broker_org	[ROLE_NAME]	[ENTITY_TYPE]	[ENTITY_NAME]	[PRIVILEGE_MASK]
```

### Common Role Types (From OOTB Configuration)

#### **Supply Chain Roles:**
- `Supply-Buyer`, `Supply-Buyer_Admin`, `Supply-Buyer_Viewer`
- `Supply-Supplier`, `Supply-Supplier_Viewer`
- `Supply-Hub_Provider`, `Supply-Pull_Mgr`, `Supply-Commodity_Mgr`

#### **Demand Chain Roles:**
- `Demand-Buyer`, `Demand-Buyer_Viewer`
- `Demand-Supplier_Admin`, `Demand-Supplier_Viewer`
- `Demand-Sales_Mgr`, `Demand-Master_Planner`

#### **GLV (Logistics) Roles:**
- `GLV-Partner` (Most common for general logistics access)
- `GLV-Owner`, `GLV-Supplier`
- `Logistics_Manager`, `Logistics_Finance_Planner`

#### **Multi-Tier Roles:**
- `MTIM-Hub`, `MTIM-Supplier`, `MTIM-Buyer`

### Entity Types

#### **1. Action Permissions**
```
broker_domain	broker_org	GLV-Partner	action	USER_ACTION_202	1
broker_domain	broker_org	Supply-Buyer	action	USER_ACTION_1	1
```

#### **2. State Permissions**
```
broker_domain	broker_org	GLV-Partner	state	USER_STATE_25	1
broker_domain	broker_org	Supply-Supplier	state	OPEN	0
```

#### **3. Field/Enum Permissions**
```
broker_domain	broker_org	GLV-Partner	attribvalue	ENUM.PO_HEADER.DiscreteOrder|PdfString44|$all_values	1
broker_domain	broker_org	Supply-Buyer	attribvalue	ENUM.ASN_LINE_ITEM.Shipment|PdfString11|$all_values	1
```

### Real Configuration Examples

#### **Custom Workflow Permissions**
For the "UI Update Date" workflow example:
```
# Action permissions
broker_domain	broker_org	GLV-Partner	action	USER_ACTION_202	1
broker_domain	broker_org	GLV-Partner	action	USER_ACTION_203	1
broker_domain	broker_org	Supply-Buyer	action	USER_ACTION_202	1
broker_domain	broker_org	Supply-Buyer	action	USER_ACTION_203	0

# State permissions
broker_domain	broker_org	GLV-Partner	state	USER_STATE_25	1
broker_domain	broker_org	Supply-Buyer	state	USER_STATE_25	0

# Field permissions for custom date fields
broker_domain	broker_org	GLV-Partner	attribvalue	ENUM.PO_REQUEST_SCHEDULE.DiscreteOrder|PdfDate50|$all_values	1
broker_domain	broker_org	GLV-Partner	attribvalue	ENUM.PO_REQUEST_SCHEDULE.DiscreteOrder|PdfString10|$all_values	1
broker_domain	broker_org	GLV-Partner	attribvalue	ENUM.PO_REQUEST_SCHEDULE.DiscreteOrder|PdfDate51|$all_values	1
```

#### **Multi-Role Configuration**
```
# Give multiple roles access to the same action
broker_domain	broker_org	GLV-Partner	action	USER_ACTION_1	1
broker_domain	broker_org	Supply-Buyer	action	USER_ACTION_1	1
broker_domain	broker_org	Supply-Buyer_Admin	action	USER_ACTION_1	1
broker_domain	broker_org	Demand-Buyer	action	USER_ACTION_1	1

# Different privilege levels for different roles
broker_domain	broker_org	Supply-Buyer_Admin	action	USER_ACTION_7	1
broker_domain	broker_org	Supply-Buyer	action	USER_ACTION_7	0
broker_domain	broker_org	Supply-Buyer_Viewer	action	USER_ACTION_7	-1
```

### Configuration Questions Framework

When configuring role permissions, ask:

#### **Role Selection:**
1. **Which roles need access?** Check available roles from role.txt
2. **What privilege level?** (0=read-only, 1=read-write, -1=hidden)
3. **Role groups vs individual roles?** Use role groups when possible

#### **Entity Permissions:**
1. **Actions**: Which USER_ACTION_X numbers need permissions?
2. **States**: Which USER_STATE_X numbers need access?
3. **Fields**: Which custom PDF fields need enum permissions?

#### **Business Logic:**
1. **Read-only vs full access**: Should some roles only view vs modify?
2. **Admin vs user permissions**: Different levels for different user types?
3. **Future access control**: Plan for -1 (hidden) to revoke without DB deletion

When implementing custom workflows, ask these essential questions:

### **Essential Information:**
1. **Available numbers**: Check existing USER_STATE_X and USER_ACTION_X usage
2. **Field requirements**: Which PDF fields need to be used/updated?
3. **Role permissions**: Which roles need access? (Don't assume - ask!)
4. **Validation needs**: What business rules need to be enforced?
5. **Date/time functions**: What date calculations or validations are required?

### **State Priority Planning:**
1. **Priority values**: What priority should new states have in StateAggregator?
2. **Icon preferences**: What visual representation for new states?
3. **Transition paths**: How do users move between states?

### **Action Design:**
1. **Button text**: What should action buttons display to users?
2. **Field updates**: Which fields need to be set during actions?
3. **User input**: Which fields should users edit during actions?
4. **Validation timing**: Use `isFinalValidate="true"` or `isFinalValidate="false"`?

### **Integration Requirements:**
1. **AllBundles.properties**: All new elements need user-friendly labels
2. **role_info.txt**: All new actions/states need role permissions
3. **AuditChangeColumns**: Which fields need audit tracking?

### Best Practices

#### **Permission Strategy:**
- **Use role groups** when possible (GLV-Partner, Supply-Buyer, etc.)
- **Default to privilege 1** for standard access
- **Use privilege 0** for read-only requirements
- **Reserve privilege -1** for future access revocation

#### **Maintenance:**
- **Document role purposes** - what each role is intended for
- **Group related permissions** - keep actions/states/fields together
- **Test permission combinations** - verify role behavior in UI
- **Plan for role changes** - use -1 instead of deleting entries

#### **Integration:**
- **Keep role.txt and role_info.txt in sync**
- **Test new permissions** in development environment
- **Coordinate with UI team** on role-based feature visibility
- **Document custom roles** and their business purposes

This role_info configuration ensures proper security and access control for all custom workflow elements while maintaining E2open OOTB role patterns.

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

### Standard Field Labels by Object Type

#### **DiscreteOrder Field Labels**
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

#### **Shipment Field Labels**
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

#### **Receipt Field Labels**
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

### Custom PDF Field Labeling

#### **PDF Field Categories**
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

### Action and State Labels

#### **Action Labels**
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

#### **State Labels**
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

### Field Formatting Configuration

#### **Number Formatting**
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

#### **Date Formatting**
```properties
# Core date formats
core.web.date.shortFormat=MM/dd/yyyy
core.web.date.longFormat=MM/dd/yyyy:HH:mm:ss
core.web.time.format=HH:mm:ss

# Field-specific date formatting
exe.web.fieldFormat.Order.PoHeader.PdfDate50={_core.web.date.shortFormat_}
exe.web.fieldFormat.Order.PoRequestSchedule.RequestedDate={_core.web.date.shortFormat_}
```

### Master Data Field Labeling

#### **Purpose**
Master data fields (like `ProjDefCollabAttribDate31`, `ProjDefCollabAttribString41`, etc.) often appear in **multiple PSD contexts** and may need **different labels** depending on where they're displayed.

#### **PSD Context-Specific Labeling**
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

#### **Label Reuse Pattern**
For consistent labeling across contexts, use reference pattern:
```properties
# Define the label once in Search context
pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31=GPDS Milestone Date

# Reference it in List context
pc.web.broker_domain.broker_org.default_cusu_group.CollabList.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31={_pc.web.broker_domain.broker_org.default_cusu_group.CollabSearch.MTIMPCVMICapacity.COLLAB_ATTR.ProjDefCollabAttribDate31_}
```

#### **Master Data Field Examples**
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

#### **Key Benefits**
- **Context-appropriate labels**: Different screens can show different levels of detail
- **Flexibility**: Same internal field can have multiple user-friendly names
- **Maintainability**: Reference pattern reduces duplicate label definitions
- **User experience**: Labels match the context and available space

### Validation Error Messages

#### **Custom Validation Messages**
exe.web.validation.UPDATE_DATE_REQUIRED_MSG=Update date is required before proceeding.
exe.web.validation.UPDATE_DATE_FUTURE_MSG=Update date must be a future date.
exe.web.validation.DPO_Validate_Msg25=Shipment date validation failed - must be within 2 days.

### Relationship Labels

#### **Relationship Display Names**
```properties
# Order-to-Shipment relationships
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.Relationship.DPOToShipment=Shipment Data
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.Relationship.DPOToReceipt=Receipt Data

# Parent-child relationships
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.Relationship.ViewParentBlanketOrder=Parent Blanket Order
exe.web.broker_domain.broker_org.default_cusu_group.Order.BlanketOrder.Relationship.ViewChildOrders=Child Orders
```

### UI Section Headers

#### **Page Section Titles**
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

### Configuration Integration Examples

#### **Complete Custom Workflow Labels**
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

### Best Practices

#### **Labeling Strategy:**
- **Use business-friendly terms** that users understand
- **Keep labels concise** but descriptive
- **Follow consistent naming patterns** across similar fields
- **Consider multi-language requirements** for global deployments

#### **Formatting Consistency:**
- **Reuse core formatting patterns** when possible
- **Apply consistent decimal places** for currency and quantities
- **Use standard date formats** unless business requires otherwise
- **Test formatting** in different locales if applicable

#### **Maintenance:**
- **Group related labels** together with comments
- **Document custom PDF field usage** and business purpose
- **Keep OOTB and custom labels separate** for easier maintenance
- **Test all labels** in UI after configuration changes

This comprehensive AllBundles.properties integration ensures all OCMetaModel elements have proper user-facing labels, formatting, and error messages for a complete user experience.

---

## Database Structure and Investigation

### Purpose
Understanding the E2open database structure is crucial for **troubleshooting configuration issues**, **investigating data problems**, and **validating OCMetaModel behavior**. This section provides database structure insights and common investigation queries for **any E2open implementation**.

### Key Database Tables

#### **1. E2open Object Structure**
```
po_header (Order Header level data)
├── po_line_item (Line Item level data)
├── po_request_schedule (Request Schedule level data)
└── po_promise_schedule (Promise Schedule level data)

asn_header (Shipment Header level data)
├── asn_line_item (Shipment Line Item level data)

receipt_header (Receipt Header level data)
├── receipt_line_item (Receipt Line Item level data)

invoice_header (Invoice Header level data)
├── invoice_line_item (Invoice Line Item level data)
```

### Core Database Schema (Generic E2open)

#### **Standard Column Naming Rules**
```sql
-- Core table columns: use underscores
po_internal_id, po_number, supplier_name, customer_name
request_date, promised_date, last_modified_date

-- PDF custom fields: NO underscores
pdf_string9, pdf_float34, pdf_integer21, pdf_date50
```

#### **po_header Table - Standard Fields**
```sql
-- Core header fields (All E2open implementations)
po_internal_id              -- Primary key
po_number                  -- Business key (Order Number)
domain_name                -- Multi-tenant domain ('broker_domain' in private hub)
org_name                   -- Multi-tenant organization ('broker_org' in private hub)
supplier_name              -- Supplier identifier
customer_name              -- Customer identifier
po_state                   -- Current workflow state
po_date                    -- Order creation date
required_date              -- Required delivery date
model_sub_type             -- Object subtype (DiscreteOrder, BlanketOrder, etc.)
last_modified_date         -- Last modification timestamp
last_modified_by           -- Last modifier user

-- Standard E2open PDF Fields (Available for customization)
pdf_string1 to pdf_string50     -- Custom string fields (NO underscores)
pdf_float1 to pdf_float35       -- Custom float/numeric fields (NO underscores)
pdf_integer1 to pdf_integer50   -- Custom integer fields (NO underscores)
pdf_date1 to pdf_date50         -- Custom date fields (NO underscores)
```

#### **po_request_schedule Table - Standard Fields**
```sql
-- Core schedule fields (All E2open implementations)
po_request_schedule_id      -- Primary key
po_internal_id             -- Foreign key to po_header
request_date             -- Schedule date
quantity                   -- Requested quantity

-- Standard E2open PDF Fields (Available for customization)
pdf_string1 to pdf_string50     -- Custom string fields (NO underscores)
pdf_float1 to pdf_float35       -- Custom float/numeric fields (NO underscores)
pdf_integer1 to pdf_integer50   -- Custom integer fields (NO underscores)
pdf_date1 to pdf_date50         -- Custom date fields (NO underscores)
```

### Generic Investigation Queries

#### **1. Basic Order Investigation**
```sql
-- Complete order overview for any implementation
SELECT 
    ph.po_number,
    ph.po_state,
    ph.model_sub_type,
    ph.supplier_name,
    ph.customer_name,
    ph.po_date,
    ph.required_date,
    ph.last_modified_date,
    ph.last_modified_by,
    COUNT(pli.po_line_item_id) as line_count,
    COUNT(prs.po_request_schedule_id) as schedule_count,
    COUNT(pps.po_promise_schedule_id) as promise_count
FROM po_header ph
LEFT JOIN po_line_item pli ON ph.po_internal_id = pli.po_internal_id
LEFT JOIN po_request_schedule prs ON ph.po_internal_id = prs.po_internal_id  
LEFT JOIN po_promise_schedule pps ON ph.po_internal_id = pps.po_internal_id
WHERE ph.po_number = 'YOUR_PO_NUMBER'
  AND ph.domain_name = 'broker_domain'
  AND ph.org_name = 'broker_org'
GROUP BY ph.po_internal_id, ph.po_number, ph.po_state, ph.model_sub_type, 
         ph.supplier_name, ph.customer_name, ph.po_date, ph.required_date,
         ph.last_modified_date, ph.last_modified_by;
```

#### **2. Underflow/Overflow Detection (Generic)**
```sql
-- Find potential underflow conditions in numeric calculations
-- Replace with your specific PDF field combinations
SELECT 
    ph.po_number,
    ph.model_sub_type,
    prs.po_request_schedule_id,
    prs.request_date,                    -- CORRECT column name
    
    -- Example: Check calculations that might cause underflow
    prs.pdf_float1 as field1_value,       -- NO underscores in PDF field names
    prs.pdf_float2 as field2_value,       -- NO underscores in PDF field names
    (prs.pdf_float1 - prs.pdf_float2) as calc_result,
    CASE 
        WHEN (prs.pdf_float1 - prs.pdf_float2) < 0 THEN 'UNDERFLOW_RISK'
        WHEN (prs.pdf_float1 - prs.pdf_float2) > 999999999 THEN 'OVERFLOW_RISK'
        ELSE 'OK' 
    END as calc_status,
    
    -- Check for extreme values
    CASE 
        WHEN prs.pdf_float1 > 999999999 OR prs.pdf_float1 < -999999999 THEN 'EXTREME_VALUE'
        ELSE 'NORMAL'
    END as value_status
    
FROM po_header ph
JOIN po_request_schedule prs ON ph.po_internal_id = prs.po_internal_id
WHERE ph.po_number = 'YOUR_PO_NUMBER'
  AND ph.domain_name = 'broker_domain'
  AND ph.org_name = 'broker_org'
  AND (prs.pdf_float1 IS NOT NULL OR prs.pdf_float2 IS NOT NULL)
ORDER BY prs.request_date;              -- CORRECT column name
```

#### **3. Action Execution Failure Investigation**
```sql
-- Find recent failed actions from audit logs
SELECT 
    al.object_internal_id,
    ph.po_number,
    ph.model_sub_type,
    al.field_name,
    al.old_value,
    al.new_value,
    al.modified_date,
    al.modified_by,
    al.comments
FROM audit_log al
JOIN po_header ph ON al.object_internal_id = ph.po_internal_id
WHERE ph.domain_name = 'broker_domain'
  AND ph.org_name = 'broker_org'
  AND al.modified_date >= CURRENT_DATE - 1
  AND (al.comments LIKE '%exception%' 
       OR al.comments LIKE '%error%'
       OR al.comments LIKE '%underflow%'
       OR al.comments LIKE '%overflow%'
       OR al.comments LIKE '%validation%')
ORDER BY al.modified_date DESC;
```

### Best Practices for Database Investigation

#### **1. Always Filter by Tenant Context**
- **Use domain_name and org_name** in all queries
- **Filter by model_sub_type** to focus on specific object types
- **Include date ranges** for performance on large datasets

#### **2. Column Naming Awareness**
- **Core fields use underscores**: `po_internal_id`, `request_date`
- **PDF fields have NO underscores**: `pdf_string9`, `pdf_float34`
- **Always verify column names** against actual database schema

#### **3. Troubleshooting Common Issues**
- **Underflow/overflow in calculations** - check extreme values in PDF fields
- **Action execution failures** - review audit_log for error patterns
- **State transition issues** - verify role permissions and validation rules
- **Performance problems** - check for excessive schedule records

This database structure knowledge enables effective troubleshooting of OCMetaModel configuration issues across **any E2open implementation**.

---

## Adding New Fields to PSD (PageSectionDefinition) Configuration

### Purpose
This section covers the **complete process for adding new fields** to Order List, Shipment List, Receipt List, and other workflow views in E2open SCPM. This enables:
- **Field visibility** in workflow list and detail views
- **Custom PDF field usage** for business-specific data
- **Multi-role field access** with proper PSD mapping
- **UI field layout** and display configuration

### Key Concepts

#### **1. PSD (PageSectionDefinition) Architecture**
E2open uses a sophisticated PSD mapping system:
```
PSD Selector → exe_psd_mapping.txt → PageSectionDefinitions XML → View/Avail XML files
```

#### **2. PSD Components**
- **exe_psd_mapping.txt**: Central mapping file linking PSD selectors to PageSectionDefinition names
- **PageSectionDefinitions XML**: Contains `<PageSectionDefinition>` entries that reference View and Avail files
- **Avail XML files**: Define available fields for selection (field pool)
- **View XML files**: Define field layout and display in UI (what users see)

#### **3. Role-Based PSD Variants**
Different roles see different fields through role-specific PSD configurations:
- **_Cust**: Customer role view
- **_Supp**: Supplier role view
- **_Broker**: Broker/intermediary role view
- **_E2Admin**: Administrative role view

### File Structure and Locations

#### **Configuration File Paths:**
```
PSD Mapping:
/e2sc/gap-data/datasets/SCCGeneric/core/reader/data/exe_psd_mapping.txt

PageSectionDefinitions:
/MetaData/[ObjectType]/ext/[ObjectType]_PageSectionDefinitions_ext.xml
Examples:
- /MetaData/DiscreteOrder/ext/DiscreteOrder_PageSectionDefinitions_ext.xml
- /MetaData/ASN/ext/ASN_PageSectionDefinitions_ext.xml
- /MetaData/Receipt/ext/Receipt_PageSectionDefinitions_ext.xml

PSD Files (View and Avail):
/MetaData/[ObjectType]/ext/PSD/
Examples:
- Avail_OrderList_HF.xml (available fields for Order List)
- View_OrderList_all.xml (view layout for Order List)
- Avail_ShipmentList_HF.xml (available fields for Shipment List)
- View_ShipmentList_all.xml (view layout for Shipment List)
```

### Step-by-Step Process: Adding a New Field

#### **Step 1: Identify the PSD Selector**
First, determine which PSD selector controls your workflow: DOBuySide/ShipmentConsign, etc

**Common PSD Selectors:**
```
# DiscreteOrder Selectors
DOBuySide       - Customer side Order List
DOSellSide      - Supplier side Order List

# Shipment Selectors
ShipmentBuySide - Customer side Shipment List
ShipmentSellSide - Supplier side Shipment List

# Receipt Selectors
ReceiptBuySide  - Customer side Receipt List
ReceiptSellSide - Supplier side Receipt List
```

#### **Step 2: Find PSD Mapping in exe_psd_mapping.txt**
Search for your PSD selector in exe_psd_mapping.txt file to find which PageSectionDefinitions it maps to:

Always try to access the Server via the Terminal first and Find PSD selector in exe_psd_mapping.txt

**Example Search Command:**
```bash
# Find DOBuySide mappings
grep -iw DOBuySide /e2open/app/e2sc/server/datasets/SCCGeneric/exe/reader/data/exe_psd_mapping.txt
```

**Example Results:**
```
broker_domain	broker_org	default_cusu_group	Order	DiscreteOrder	OrderList	BuySide_DOList_Cust	$null	3	DOBuySide
broker_domain	broker_org	default_cusu_group	Order	DiscreteOrder	OrderList	BuySide_DOList_Supp	$null	2	DOBuySide
broker_domain	broker_org	default_cusu_group	Order	DiscreteOrder	OrderList	BuySide_DOList_Broker	$null	5	DOBuySide
broker_domain	broker_org	default_cusu_group	Order	DiscreteOrder	OrderList	BuySide_DOList_E2Admin	e2open_super_role	$null	DOBuySide
```

**Understanding the Columns:**
- Column 10: PSD Selector (e.g., `DOBuySide`)
- Column 6: Workflow Type (e.g., `OrderList`)
- Column 7: PageSectionDefinition Name (e.g., `BuySide_DOList_Cust`)
- Column 8/9: Role ID or Role Name (e.g., `3` for customer, `e2open_super_role` for admin)

#### **Step 3: Locate PageSectionDefinition Entries**
Find the PageSectionDefinitions XML file and search for the names from step 2:

**Example File:**
```
/MetaData/DiscreteOrder/ext/DiscreteOrder_PageSectionDefinitions_ext.xml
```

**Example PageSectionDefinition Structure:**
```xml
<!-- Customer Role -->
<PageSectionDefinition name="BuySide_DOList_Cust">
  <e2open:Include type="Avail" location="PSD/Avail_OrderList_HF.xml"/>
  <e2open:Include type="View" location="PSD/View_OrderList_all.xml"/>
</PageSectionDefinition>

<!-- Supplier Role -->
<PageSectionDefinition name="BuySide_DOList_Supp">
  <e2open:Include type="Avail" location="PSD/Avail_OrderList_HF.xml"/>
  <e2open:Include type="View" location="PSD/View_OrderList_all.xml"/>
</PageSectionDefinition>

<!-- Broker Role -->
<PageSectionDefinition name="BuySide_DOList_Broker">
  <e2open:Include type="Avail" location="PSD/Avail_OrderList_HF.xml"/>
  <e2open:Include type="View" location="PSD/View_OrderList_all.xml"/>
</PageSectionDefinition>

<!-- E2Admin Role -->
<PageSectionDefinition name="BuySide_DOList_E2Admin">
  <e2open:Include type="Avail" location="PSD/Avail_OrderList_e2admin.xml"/>
  <e2open:Include type="View" location="PSD/View_OrderList_e2admin.xml"/>
</PageSectionDefinition>
```

**Key Insights:**
- **Avail file** = field pool (what CAN be shown)
- **View file** = field layout (what IS shown by default)

#### **Step 4: Update Avail Files (Available Fields)**
Add your new field to the appropriate Avail XML files:

**File 1: Avail_OrderList_HF.xml** (for Cust/Supp/Broker roles)
```xml
<AvailableFields xmlns="http://scc.i2.com/OCMetaModel">
  <!-- Existing fields -->
  <Field><ObjectName>PoPromiseSchedule</ObjectName><FieldName>PromiseDate</FieldName></Field>

  <!-- NEW FIELD: Add after related fields -->
  <Field><ObjectName>PoPromiseSchedule</ObjectName><FieldName>PdfDate123</FieldName><DateFormat>ShortDateFormat</DateFormat></Field>

  <!-- More existing fields -->
  <Field><ObjectName>PoPromiseSchedule</ObjectName><FieldName>PromiseQuantity</FieldName></Field>
</AvailableFields>
```

**File 2: Avail_OrderList_e2admin.xml** (for E2Admin role)
```xml
<AvailableFields xmlns="http://scc.i2.com/OCMetaModel">
  <!-- Existing fields -->
  <Field><ObjectName>PoPromiseSchedule</ObjectName><FieldName>PromiseDate</FieldName></Field>

  <!-- NEW FIELD: Add after related fields -->
  <Field><ObjectName>PoPromiseSchedule</ObjectName><FieldName>PdfDate123</FieldName><DateFormat>ShortDateFormat</DateFormat></Field>

  <!-- More existing fields -->
  <Field><ObjectName>PoPromiseSchedule</ObjectName><FieldName>PromiseQuantity</FieldName></Field>
</AvailableFields>
```

#### **Step 5: Update View Files (Field Display)**
Add your new field to the appropriate View XML files to make it visible in UI:

**File 1: View_OrderList_all.xml** (for Cust/Supp/Broker roles)
```xml
<Views xmlns="http://scc.i2.com/OCMetaModel">
  <View name="default" isDefault="true">
    <PsdSubsection name="right">
      <Fields>
        <!-- Existing fields -->
        <Field><ObjectName>PoPromiseSchedule</ObjectName><FieldName>PromiseDate</FieldName></Field>

        <!-- NEW FIELD: Add after related fields -->
        <Field><ObjectName>PoPromiseSchedule</ObjectName><FieldName>PdfDate123</FieldName></Field>

        <!-- More existing fields -->
        <Field><ObjectName>PoPromiseSchedule</ObjectName><FieldName>PromiseQuantity</FieldName></Field>
      </Fields>
    </PsdSubsection>
  </View>
</Views>
```

**File 2: View_OrderList_e2admin.xml** (for E2Admin role)
```xml
<Views xmlns="http://scc.i2.com/OCMetaModel">
  <View name="default" isDefault="true">
    <PsdSubsection name="right">
      <Fields>
        <!-- Existing fields -->
        <Field><ObjectName>PoPromiseSchedule</ObjectName><FieldName>PromiseDate</FieldName></Field>

        <!-- NEW FIELD: Add after related fields -->
        <Field><ObjectName>PoPromiseSchedule</ObjectName><FieldName>PdfDate123</FieldName></Field>

        <!-- More existing fields -->
        <Field><ObjectName>PoPromiseSchedule</ObjectName><FieldName>PromiseQuantity</FieldName></Field>
      </Fields>
    </PsdSubsection>
  </View>
</Views>
```

### Best Practices

#### **PSD Configuration:**
- **Always follow the mapping chain**: PSD Selector → exe_psd_mapping.txt → PageSectionDefinitions → View/Avail files
- **Update both Avail and View files** for complete configuration
- **Update all role variants** if field should be visible to all roles
- **Group related fields together** logically in XML for maintainability

#### **Field Placement:**
- **Add fields near related existing fields** (e.g., date fields near other dates)
- **Consider object hierarchy** when placing fields (Header → Line → Schedule)
- **Test field order in UI** after configuration changes
- **Use comments in XML** to document custom field additions

#### **Label Configuration:**
- **Use business-friendly labels** that users understand
- **Follow consistent naming patterns** across similar fields
- **Add date formatting** for date fields in AllBundles.properties
- **Test labels in UI** to verify proper display

#### **Validation:**
- **Verify PSD mapping chain** before making changes
- **Test with multiple roles** to ensure proper field visibility

---

## Multi-Sort Column Configuration (ListVertical)

### Purpose
Multi-sort columns allow users to sort list pages by multiple fields simultaneously. This is controlled by the **ListVertical** PSD files, which define which fields are available for multi-sort selection in the UI.

### Key Concepts

#### **1. ListVertical PSD Architecture**
Multi-sort columns are separate from the standard List view. They use dedicated PSD files:

```
PageSectionDefinitions XML
  └── ReceiptDetailListVertical / ReceiptCreateLineItemVertical
        ├── View_[ObjectType]ListVertical_all.xml   ← Default sort columns shown
        └── Avail_[ObjectType]ListVertical_all.xml  ← All columns available for sorting
```

#### **2. How It Works**
- **Avail_*ListVertical_all.xml**: Defines which fields users CAN select for sorting
- **View_*ListVertical_all.xml**: Defines which fields are shown as default sort columns
- The PageSectionDefinitions XML maps these files to role-specific PSDs using `e2open:Include`

### File Locations

```
PSD Files:
/MetaData/[ObjectType]/SSP/PSD/Avail_[ObjectType]ListVertical_all.xml
/MetaData/[ObjectType]/SSP/PSD/View_[ObjectType]ListVertical_all.xml

PageSectionDefinitions (references the PSD files):
/MetaData/[ObjectType]/SSP/[ObjectType]_PageSectionDefinitions_SSP.xml
```

### PageSectionDefinitions Mapping

The PageSectionDefinitions XML links ListVertical files to role-specific page sections:

<!-- Detail List Vertical (used in detail/drill-down views) -->
<PageSectionDefinition name="RiskEvent_ReceiptDetailListVertical_Cust" type.ref="ReceiptDetailListVertical">
  <Views>
    <e2open:Include parse="xml" href="./PSD/View_RiskEventListVertical_all.xml" xpath="//*[local-name()='View']/."/>
  </Views>
  <AvailableFields>
    <e2open:Include parse="xml" href="./PSD/Avail_RiskEventListVertical_all.xml" xpath="//*[local-name()='Field']/."/>
  </AvailableFields>
</PageSectionDefinition>
```

> **Note:** The same `_all.xml` files are typically shared across all roles (Cust, Supp, Broker, E2Admin).

### Step-by-Step: Adding a Field to Multi-Sort Columns

#### **Step 1: Update Avail_*ListVertical_all.xml**
Add the field to the available sort columns pool:

```xml
<AvailableFields xmlns="http://scc.i2.com/OCMetaModel">
  <!-- Existing sortable fields -->
  <Field><ObjectName>ReceiptHeader</ObjectName><FieldName>ReceiptState</FieldName></Field>
  <Field><ObjectName>ReceiptHeader</ObjectName><FieldName>PdfString13</FieldName></Field>

  <!-- NEW: Add field to multi-sort available columns -->
  <Field><ObjectName>ReceiptHeader</ObjectName><FieldName>PdfInteger3</FieldName></Field>

  <Field><ObjectName>ReceiptLineItem</ObjectName><FieldName>LineItemId</FieldName></Field>
  <!-- ...more fields... -->
</AvailableFields>
```

#### **Step 2 (Optional): Update View_*ListVertical_all.xml**
If you want the field to appear as a **default** sort column, add it to the View file:

```xml
<Views xmlns="http://scc.i2.com/OCMetaModel">
  <View name="default" isDefault="true">
    <!-- Default sort columns shown in UI -->
    <Field><ObjectName>ReceiptHeader</ObjectName><FieldName>PdfString5</FieldName></Field>
    <Field><ObjectName>ReceiptHeader</ObjectName><FieldName>PdfString13</FieldName></Field>

    <!-- NEW: Add as default sort column -->
    <Field><ObjectName>ReceiptHeader</ObjectName><FieldName>PdfInteger3</FieldName></Field>
  </View>
</Views>
```

> **Tip:** Most ListVertical View files have all fields commented out, meaning no default sort is applied. Users select sort columns manually from the Avail pool.

### Relationship to Other PSD Files

| PSD File Type | Purpose | Controls |
|---|---|---|
| `Avail_*List_all.xml` | List page available fields | Which columns appear in the list |
| `View_*List_all.xml` | List page default view | Default column layout |
| `Avail_*ListVertical_all.xml` | **Multi-sort available columns** | **Which fields can be used for sorting** |
| `View_*ListVertical_all.xml` | **Multi-sort default columns** | **Default sort column selection** |
| `Avail_*SummaryFilter_all.xml` | Summary filter available fields | Search filter options |
| `View_*SummaryFilter_all.xml` | Summary filter default view | Default search filters shown |
| `Avail_*Search_all.xml` | Search page available fields | Detailed search filter options |
| `View_*Search_all.xml` | Search page default view | Default detailed search filters |

---

## Implementation Example: Test PO Request and Promise Quantity Fields

### Business Requirement
Add custom fields to Order List workflow (DOBuySide) with the following specifications:
- **Internal field**: `PoRequestSchedule.PdfFloat123` → **Label**: Test PO Request Quantity
- **Internal field**: `PoRequestSchedule.PdfFloat456` → **Label**: Test PO Promise Quantity
- Upon Discrete Order acknowledgement, set PO Request Quantity based on user input
- If value is less than 0, transition PO to Cancelled state
- TestPO.PromiseQuantity references value from TestPO.PORequestQty

### Configuration Overview
This implementation requires changes to:
1. **PSD Configuration** - Add fields to Order List views
2. **Actions Configuration** - Add field updates and validation logic
3. **Transitions Configuration** - Add automatic transition to Cancelled
4. **AllBundles.properties** - Add field labels and error messages

---

### Step 1: PSD Configuration (Order List Fields)

#### **File 1: Avail_OrderList_HF.xml**
**Location**: `/MetaData/DiscreteOrder/ext/PSD/Avail_OrderList_HF.xml`

Add the new fields to make them available for selection:

```xml
<AvailableFields xmlns="http://scc.i2.com/OCMetaModel">
  <!-- ...existing fields... -->
  
  <!-- Test PO Request Quantity Field -->
  <Field>
    <ObjectName>PoRequestSchedule</ObjectName>
    <FieldName>PdfFloat123</FieldName>
  </Field>
  
  <!-- Test PO Promise Quantity Field -->
  <Field>
    <ObjectName>PoRequestSchedule</ObjectName>
    <FieldName>PdfFloat456</FieldName>
  </Field>
  
  <!-- ...existing fields... -->
</AvailableFields>
```

#### **File 2: Avail_OrderList_e2admin.xml**
**Location**: `/MetaData/DiscreteOrder/ext/PSD/Avail_OrderList_e2admin.xml`

Add the same fields for E2Admin role:

```xml
<AvailableFields xmlns="http://scc.i2.com/OCMetaModel">
  <!-- ...existing fields... -->
  
  <!-- Test PO Request Quantity Field -->
  <Field>
    <ObjectName>PoRequestSchedule</ObjectName>
    <FieldName>PdfFloat123</FieldName>
  </Field>
  
  <!-- Test PO Promise Quantity Field -->
  <Field>
    <ObjectName>PoRequestSchedule</ObjectName>
    <FieldName>PdfFloat456</FieldName>
  </Field>
  
  <!-- ...existing fields... -->
</AvailableFields>
```

#### **File 3: View_OrderList_all.xml**
**Location**: `/MetaData/DiscreteOrder/ext/PSD/View_OrderList_all.xml`

Add fields to the view layout to display them in UI:

```xml
<Views xmlns="http://scc.i2.com/OCMetaModel">
  <View name="default" isDefault="true">
    <PsdSubsection name="right">
      <Fields>
        <!-- ...existing fields... -->
        
        <!-- Add after related quantity fields -->
        <Field>
          <ObjectName>PoRequestSchedule</ObjectName>
          <FieldName>PdfFloat123</FieldName>
        </Field>
        
        <Field>
          <ObjectName>PoRequestSchedule</ObjectName>
          <FieldName>PdfFloat456</FieldName>
        </Field>
        
        <!-- ...existing fields... -->
      </Fields>
    </PsdSubsection>
  </View>
</Views>
```

#### **File 4: View_OrderList_e2admin.xml**
**Location**: `/MetaData/DiscreteOrder/ext/PSD/View_OrderList_e2admin.xml`

Add the same view configuration for E2Admin role:

```xml
<Views xmlns="http://scc.i2.com/OCMetaModel">
  <View name="default" isDefault="true">
    <PsdSubsection name="right">
      <Fields>
        <!-- ...existing fields... -->
        
        <!-- Add after related quantity fields -->
        <Field>
          <ObjectName>PoRequestSchedule</ObjectName>
          <FieldName>PdfFloat123</FieldName>
        </Field>
        
        <Field>
          <ObjectName>PoRequestSchedule</ObjectName>
          <FieldName>PdfFloat456</FieldName>
        </Field>
        
        <!-- ...existing fields... -->
      </Fields>
    </PsdSubsection>
  </View>
</Views>
```

---

### Step 2: Actions Configuration

#### **File: DiscreteOrder_Actions_ext.xml**
**Location**: `/MetaData/DiscreteOrder/ext/DiscreteOrder_Actions_ext.xml`

Modify the acknowledgement action to handle the new fields:

```xml
<Actions xmlns="http://scc.i2.com/OCMetaModel">
  
  <!-- Discrete Order Acknowledgement Action -->
  <Action actionButtonName="Acknowledge" 
          systemActionName="SUPPLIER_ACCEPT" 
          userActionName="AcknowledgeOrder">
    
    <!-- Allow user to edit Test PO Request Quantity during acknowledgement -->
    <UiEdit field="PoRequestSchedule.PdfFloat123"/>
    
    <!-- Validate that Test PO Request Quantity is provided -->
    <Validate isFinalValidate="true" 
              condition="PoRequestSchedule.PdfFloat123 != null" 
              resId="TEST_PO_REQUEST_QTY_REQUIRED"/>
    
    <!-- Set Test PO Request Quantity based on user input -->
    <!-- (Value is already set by UiEdit, this is implicit) -->
    
    <!-- Copy Test PO Request Quantity to Test PO Promise Quantity -->
    <Set field="PoRequestSchedule.PdfFloat456" 
         value="PoRequestSchedule.PdfFloat123"/>
    
    <!-- Standard acknowledgement operations -->
    <Operation isInline="false" name="RESTORE_PROMISE_STRUCTURE(DOPromiseInitCopy)"/>
    <Set field="PoPromiseSchedule.PromiseDate" 
         value="OriginalPoRequestSchedule.RequestDate"/>
    <Set field="PoPromiseSchedule.PromiseQuantity" 
         value="OriginalPoRequestSchedule.RequestQuantity"/>
    
  </Action>
  
</Actions>
```

---

### Step 3: Transitions Configuration

#### **File: DiscreteOrder_Transitions_ext.xml**
**Location**: `/MetaData/DiscreteOrder/ext/DiscreteOrder_Transitions_ext.xml`

Add conditional transition to Cancelled state when quantity is negative:

```xml
<Transitions xmlns="http://scc.i2.com/OCMetaModel">
  
  <!-- ...existing transitions... -->
  
  <!-- Acknowledge Order: Normal Flow (when Test PO Request Qty >= 0) -->
  <Transition fromState="Open" 
              toState="Accepted" 
              actionName="SUPPLIER_ACCEPT" 
              roleType="SUPPLIER"
              condition="PoRequestSchedule.PdfFloat123 >= 0"/>
  
  <!-- Acknowledge Order: Auto-Cancel Flow (when Test PO Request Qty < 0) -->
  <Transition fromState="Open" 
              toState="Cancelled" 
              actionName="SUPPLIER_ACCEPT" 
              roleType="SUPPLIER"
              condition="PoRequestSchedule.PdfFloat123 < 0"/>
  
  <!-- ...existing transitions... -->
  
</Transitions>
```

**Alternative Approach: Using ConditionalTransition (Recommended for Multi-Path Logic)**

When a single action needs to transition to different states based on field values, use **ConditionalTransition** within a single Transition definition:

```xml
<Transitions xmlns="http://scc.i2.com/OCMetaModel">
  
  <!-- Single transition with conditional path -->
  <Transition fromState="Open" 
              toState="Accepted" 
              actionName="SUPPLIER_ACCEPT" 
              roleType="SUPPLIER">
    <!-- Conditional path: If quantity is negative, go to Cancelled instead -->
    <ConditionalTransition rule="PoRequestSchedule.PdfFloat123 &lt; 0" 
                          userActionName="ConditionTransition" 
                          resultStateUserName="Cancelled"/>
  </Transition>
  
</Transitions>
```

**ConditionalTransition Format:**
```xml
<ConditionalTransition rule="[CONDITION]" 
                      userActionName="ConditionTransition" 
                      resultStateUserName="[TARGET_STATE]"/>
```

**Key Points:**
- Default behavior: Transition goes to the state specified in `toState` attribute
- Conditional behavior: If `rule` evaluates to `true`, transition goes to `resultStateUserName` instead
- Multiple conditions: Can have multiple `<ConditionalTransition>` elements for different paths
- XML encoding: Use `&lt;` for `<` and `&gt;` for `>` in rule conditions

**Real-World Example: BBRequest UI_Update with Auto-Cancel**
```xml
<Transition roleType="CUSTOMER" 
            startStateUserName="Open" 
            userActionName="UI_Update" 
            resultStateUserName="Open">
  <!-- If AWC Test 1 is negative, auto-cancel the order -->
  <ConditionalTransition rule="PoRequestSchedule.PdfFloat1 &lt; 0" 
                        userActionName="ConditionTransition" 
                        resultStateUserName="Cancelled"/>
</Transition>
```

**Multiple Conditional Paths Example:**
```xml
<Transition fromState="Open" 
            toState="Accepted" 
            actionName="SUPPLIER_ACCEPT" 
            roleType="SUPPLIER">
  <!-- Path 1: Negative quantity → Cancelled -->
  <ConditionalTransition rule="PoRequestSchedule.PdfFloat123 &lt; 0" 
                        userActionName="ConditionTransition" 
                        resultStateUserName="Cancelled"/>
  
  <!-- Path 2: Quantity exceeds threshold → Requires Review -->
  <ConditionalTransition rule="PoRequestSchedule.PdfFloat123 &gt; 10000" 
                        userActionName="ConditionTransition" 
                        resultStateUserName="UnderReview"/>
  
  <!-- Default Path: Normal quantity → Accepted -->
</Transition>
```

**Comparison: Multiple Transitions vs ConditionalTransition**

**Approach 1: Multiple Separate Transitions**
```xml
<!-- Separate transition for each condition -->
<Transition fromState="Open" toState="Accepted" actionName="SUPPLIER_ACCEPT" 
            roleType="SUPPLIER" condition="PoRequestSchedule.PdfFloat123 >= 0"/>
<Transition fromState="Open" toState="Cancelled" actionName="SUPPLIER_ACCEPT" 
            roleType="SUPPLIER" condition="PoRequestSchedule.PdfFloat123 &lt; 0"/>
```
- ❌ Creates duplicate transitions for same action
- ❌ Can cause configuration conflicts
- ❌ Harder to maintain

**Approach 2: ConditionalTransition (Recommended)**
```xml
<!-- Single transition with conditional paths -->
<Transition fromState="Open" toState="Accepted" actionName="SUPPLIER_ACCEPT" 
            roleType="SUPPLIER">
  <ConditionalTransition rule="PoRequestSchedule.PdfFloat123 &lt; 0" 
                        userActionName="ConditionTransition" 
                        resultStateUserName="Cancelled"/>
</Transition>
```
- ✅ Single transition definition
- ✅ Clear default and conditional paths
- ✅ Easier to maintain and understand

**Alternative Approach: Using Validation to Prevent Negative Values**

If business requirement is to prevent negative values entirely (not allow transition), use this instead:

```xml
<Actions xmlns="http://scc.i2.com/OCMetaModel">
  
  <!-- Discrete Order Acknowledgement Action with Validation -->
  <Action actionButtonName="Acknowledge" 
          systemActionName="SUPPLIER_ACCEPT" 
          userActionName="AcknowledgeOrder">
    
    <!-- Allow user to edit Test PO Request Quantity -->
    <UiEdit field="PoRequestSchedule.PdfFloat123"/>
    
    <!-- Validate that Test PO Request Quantity is provided -->
    <Validate isFinalValidate="true" 
              condition="PoRequestSchedule.PdfFloat123 != null" 
              resId="TEST_PO_REQUEST_QTY_REQUIRED"/>
    
    <!-- Validate that Test PO Request Quantity is not negative -->
    <Validate isFinalValidate="true" 
              condition="PoRequestSchedule.PdfFloat123 >= 0" 
              resId="TEST_PO_REQUEST_QTY_NEGATIVE"/>
    
    <!-- Copy Test PO Request Quantity to Test PO Promise Quantity -->
    <Set field="PoRequestSchedule.PdfFloat456" 
         value="PoRequestSchedule.PdfFloat123"/>
    
    <!-- Standard acknowledgement operations -->
    <Operation isInline="false" name="RESTORE_PROMISE_STRUCTURE(DOPromiseInitCopy)"/>
    <Set field="PoPromiseSchedule.PromiseDate" 
         value="OriginalPoRequestSchedule.RequestDate"/>
    <Set field="PoPromiseSchedule.PromiseQuantity" 
         value="OriginalPoRequestSchedule.RequestQuantity"/>
    
  </Action>
  
</Actions>

<!-- Transition: Single path to Accepted (negative values blocked by validation) -->
<Transitions xmlns="http://scc.i2.com/OCMetaModel">
  
  <Transition fromState="Open" 
              toState="Accepted" 
              actionName="SUPPLIER_ACCEPT" 
              roleType="SUPPLIER"/>
  
</Transitions>
```

---

### Step 4: AllBundles.properties Configuration

#### **File: AllBundles.properties**
**Location**: `/e2sc/gap-data/datasets/SCCGeneric/core/properties/AllBundles.properties`

Add field labels and error messages:

```properties
# =====================================================
# Test PO Request and Promise Quantity Configuration
# =====================================================

# Field Labels
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.PdfFloat123=Test PO Request Quantity
exe.web.broker_domain.broker_org.default_cusu_group.Order.DiscreteOrder.PoRequestSchedule.PdfFloat456=Test PO Promise Quantity

# Field Formatting (optional - for decimal places)
exe.web.fieldFormat.Order.PoRequestSchedule.PdfFloat123=0.00
exe.web.fieldFormat.Order.PoRequestSchedule.PdfFloat456=0.00

# Validation Error Messages
TEST_PO_REQUEST_QTY_REQUIRED=Test PO Request Quantity is required before acknowledging the order.
TEST_PO_REQUEST_QTY_NEGATIVE=Test PO Request Quantity cannot be negative. Please enter a valid quantity or use the Cancel action.

# Action Label (if needed)
exe.web.action.Order.DiscreteOrder.SUPPLIER_ACCEPT=Acknowledge Order
```

---

### Implementation Decision Matrix

#### **Choose Your Implementation Approach:**

| **Requirement** | **Approach A: Auto-Cancel** | **Approach B: Validation Block** |
|-----------------|----------------------------|----------------------------------|
| **Negative value behavior** | Transition to Cancelled state | Prevent action execution with error |
| **User experience** | Action completes, PO auto-cancelled | Action fails, user must correct value |
| **Configuration** | Conditional transitions | Validation rule |
| **Use when** | Business wants to track negative attempts | Business wants to prevent invalid data |

**For your requirement "transition the PO to Cancelled state"**, use **Approach A: Auto-Cancel** with conditional transitions.

---

### Complete Configuration Summary

#### **Files to Modify:**

1. **PSD Files (4 files)**:
    - `/MetaData/DiscreteOrder/ext/PSD/Avail_OrderList_HF.xml`
    - `/MetaData/DiscreteOrder/ext/PSD/Avail_OrderList_e2admin.xml`
    - `/MetaData/DiscreteOrder/ext/PSD/View_OrderList_all.xml`
    - `/MetaData/DiscreteOrder/ext/PSD/View_OrderList_e2admin.xml`

2. **OCMetaModel Files (2 files)**:
    - `/MetaData/DiscreteOrder/ext/DiscreteOrder_Actions_ext.xml`
    - `/MetaData/DiscreteOrder/ext/DiscreteOrder_Transitions_ext.xml`

3. **Properties File (1 file)**:
    - `/e2sc/gap-data/datasets/SCCGeneric/core/properties/AllBundles.properties`

#### **Deployment Steps:**

1. **Update PSD files** - Add fields to Avail and View XMLs
2. **Update Actions** - Modify SUPPLIER_ACCEPT action
3. **Update Transitions** - Add conditional transition logic
4. **Update AllBundles.properties** - Add labels and error messages
5. **Reload OC metadata** - Run reload script or restart application
6. **Test workflow**:
    - Create test PO in "Open" state
    - Execute Acknowledge action with positive value → Verify transition to "Accepted"
    - Create another test PO in "Open" state
    - Execute Acknowledge action with negative value → Verify transition to "Cancelled"
    - Verify Test PO Promise Quantity equals Test PO Request Quantity

---

*This implementation example demonstrates the complete configuration workflow for adding custom fields with business logic to E2open Order List workflows.*

---

*Next Sections: UI Components Configuration, Best Practices*

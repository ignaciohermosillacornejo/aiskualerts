# Enhanced Inventory Alert System

This document describes the enhanced inventory alert system that supports both quantity-based and days-based threshold alerts with a complete alert lifecycle.

## Overview

The alert system monitors inventory levels and generates alerts when stock falls below configured thresholds. Alerts can be based on:
- **Quantity thresholds**: Alert when stock <= X units
- **Days thresholds**: Alert when estimated days of stock remaining <= X days

## Alert Lifecycle

```
     ┌─────────┐
     │   OK    │  Stock above threshold
     └────┬────┘
          │ Stock drops below threshold
          ▼
     ┌─────────┐
     │  ALERT  │  Active alert, user notified
     └────┬────┘
          │ User clicks "Pedido en camino"
          ▼
     ┌─────────┐
     │DISMISSED│  User ordered stock, no re-notification
     └────┬────┘
          │ Stock recovers above threshold
          ▼
     ┌─────────┐
     │   OK    │  Alert reset, ready for next cycle
     └─────────┘
```

### Alert States

| State | Description | Color | Re-notification |
|-------|-------------|-------|-----------------|
| `ok` | Stock above threshold | Green | N/A |
| `alert` (pending) | Stock below threshold, active | Red | Yes |
| `dismissed` | User marked as ordered | Orange | No |
| `resolved` | Stock recovered after being dismissed | N/A (resets to ok) | Resets cycle |

## Threshold Types

### Quantity-Based Thresholds

Traditional threshold based on unit count.

```typescript
{
  thresholdType: "quantity",
  minQuantity: 10,  // Alert when stock <= 10 units
  minDays: null
}
```

### Days-Based Thresholds

Velocity-based threshold using 7-day rolling average consumption.

```typescript
{
  thresholdType: "days",
  minQuantity: null,
  minDays: 7,  // Alert when estimated days of stock <= 7
}
```

**Velocity Calculation:**
```
dailyConsumption = sum(sales in last 7 days) / 7
daysLeft = currentStock / dailyConsumption
```

## Database Schema

### Thresholds Table Changes

```sql
ALTER TABLE thresholds
ADD COLUMN threshold_type VARCHAR(20) DEFAULT 'quantity',
ADD COLUMN min_days INTEGER;
```

### Alerts Table Changes

```sql
ALTER TABLE alerts
ADD COLUMN dismissed_at TIMESTAMP,
ADD COLUMN last_notified_at TIMESTAMP;
```

### Daily Consumption Table (New)

```sql
CREATE TABLE daily_consumption (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  bsale_variant_id INTEGER NOT NULL,
  consumption_date DATE NOT NULL,
  quantity_sold DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, bsale_variant_id, consumption_date)
);
```

## API Endpoints

### Thresholds API

#### Create Threshold
```http
POST /api/thresholds
Content-Type: application/json

{
  "productId": "123",
  "thresholdType": "quantity" | "days",
  "minQuantity": 10,  // Required if thresholdType = "quantity"
  "minDays": 7        // Required if thresholdType = "days"
}
```

#### Update Threshold
```http
PUT /api/thresholds/:id
Content-Type: application/json

{
  "thresholdType": "days",
  "minDays": 14
}
```

### Products API

The products endpoint now returns additional fields:

```json
{
  "id": "prod-123",
  "name": "Widget",
  "currentStock": 50,
  "threshold": 10,
  "thresholdType": "quantity",
  "minDays": null,
  "velocityInfo": {
    "dailyConsumption": 5.2,
    "daysLeft": 9.6
  },
  "alertState": "ok" | "alert" | "dismissed"
}
```

### Dismiss Alert

```http
POST /api/alerts/:productId/dismiss
```

## Services

### Velocity Calculator (`src/services/velocity-calculator.ts`)

Calculates days of stock remaining based on 7-day rolling average consumption.

```typescript
const calculator = createVelocityCalculator({ dailyConsumptionRepo });

// Get velocity info for a product
const info = await calculator.getVelocityInfo({
  tenantId: "...",
  variantId: 123,
  currentStock: 100
});
// Returns: { dailyConsumption: 10, daysLeft: 10 }

// Check if below threshold
const isBelow = await calculator.isBelowDaysThreshold({
  tenantId: "...",
  variantId: 123,
  currentStock: 100,
  minDays: 14
});
// Returns: true if daysLeft < minDays
```

### Consumption Sync Service (`src/sync/consumption-sync.ts`)

Aggregates sales data from Bsale documents API into daily consumption records.

```typescript
const syncService = createConsumptionSyncService({
  bsaleClient,
  dailyConsumptionRepo
});

// Sync last 7 days of consumption for a tenant
const result = await syncService.syncConsumption(tenantId, 7);
// Returns: { variantsUpdated: 150, daysProcessed: 7 }
```

### Alert Reset Service (`src/alerts/alert-reset.ts`)

Resets dismissed alerts when stock recovers above threshold.

```typescript
const resetService = createAlertResetService({
  alertRepo,
  thresholdRepo,
  velocityCalculator
});

// Check and reset alerts for a tenant
const result = await resetService.resetRecoveredAlerts(tenantId);
// Returns: { alertsReset: 3 }
```

## Frontend Integration

### Products Page (`/app/products`)

The Products page now serves as the unified alert management interface:

- **Threshold chips** show alert state (green=OK, red=alert, orange=dismissed)
- **Inline editing** with threshold type selector (quantity/days)
- **Bulk editing** for multiple products at once
- **Dismiss button** to mark active alerts as "Pedido en camino"
- **Filter buttons** for viewing by alert state

### Sidebar

- Alert count badge shows number of active alerts
- `/app/alerts` redirects to `/app/products`

## Sync Integration

The consumption sync is integrated into the main sync job:

```typescript
// In src/sync/sync-job.ts
async function runSyncJob() {
  // 1. Sync stock levels from Bsale
  await syncStock(tenantId);

  // 2. Sync consumption data for velocity calculations
  await consumptionSyncService.syncConsumption(tenantId, 7);

  // 3. Generate alerts for both threshold types
  await alertGenerator.generateAlerts(tenantId);

  // 4. Reset dismissed alerts if stock recovered
  await alertResetService.resetRecoveredAlerts(tenantId);
}
```

## Testing

### Unit Tests

- `tests/unit/services/velocity-calculator.test.ts` - Velocity calculations
- `tests/unit/sync/consumption-sync.test.ts` - Consumption aggregation
- `tests/unit/alerts/alert-reset.test.ts` - Alert reset logic
- `tests/unit/alerts/alert-generator.test.ts` - Alert generation for both types

### E2E Tests

- `tests/e2e/journeys/03-alert-lifecycle.spec.ts` - Complete UI flow

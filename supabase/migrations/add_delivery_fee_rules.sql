-- Migration: Add delivery fee rules to restaurant_settings
-- This allows restaurants to configure complex delivery fee structures

ALTER TABLE restaurant_settings
ADD COLUMN IF NOT EXISTS delivery_fee_rules JSONB;

-- Add comment for documentation
COMMENT ON COLUMN restaurant_settings.delivery_fee_rules IS 'JSONB structure for delivery fee rules. Structure: {
  "type": "flat" | "distance_based",
  "baseFee": number,
  "perKmFee": number | null,
  "maxDistanceKm": number | null,
  "freeDeliveryAbove": number | null,
  "peakHours": [{"start": "HH:MM", "end": "HH:MM", "additionalFee": number}] | null,
  "weekendFee": number | null,
  "holidayFee": number | null,
  "minimumOrderSurcharge": {"threshold": number, "surcharge": number} | null
}';


-- Migration: Add estimated prep time and delivery time to restaurant_settings
-- Also add explicit pickup_enabled and delivery_enabled columns for clarity
-- (even though service_types already contains this info)

ALTER TABLE restaurant_settings
ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS estimated_prep_time_minutes INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS estimated_delivery_time_minutes INTEGER DEFAULT 30;

-- Add comments for documentation
COMMENT ON COLUMN restaurant_settings.pickup_enabled IS 'Whether pickup orders are enabled for this restaurant';
COMMENT ON COLUMN restaurant_settings.delivery_enabled IS 'Whether delivery orders are enabled for this restaurant';
COMMENT ON COLUMN restaurant_settings.estimated_prep_time_minutes IS 'Estimated time in minutes to prepare an order (used for pickup orders)';
COMMENT ON COLUMN restaurant_settings.estimated_delivery_time_minutes IS 'Estimated time in minutes for delivery (used for delivery orders)';

-- Optional: Sync existing service_types with the new boolean columns
-- This ensures consistency if service_types was already being used
UPDATE restaurant_settings
SET 
  pickup_enabled = (service_types ? 'pickup'),
  delivery_enabled = (service_types ? 'delivery')
WHERE service_types IS NOT NULL;


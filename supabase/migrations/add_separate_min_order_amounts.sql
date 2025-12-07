-- Migration: Add separate minimum order amounts for pickup and delivery
-- This allows restaurants to set different minimum order amounts for pickup vs delivery

ALTER TABLE restaurant_settings
ADD COLUMN IF NOT EXISTS min_order_amount_pickup NUMERIC,
ADD COLUMN IF NOT EXISTS min_order_amount_delivery NUMERIC;

-- Add comments for documentation
COMMENT ON COLUMN restaurant_settings.min_order_amount_pickup IS 'Minimum order amount for pickup orders';
COMMENT ON COLUMN restaurant_settings.min_order_amount_delivery IS 'Minimum order amount for delivery orders';

-- Migrate existing min_order_amount to both new fields if they are null
-- This preserves existing data while allowing independent configuration going forward
UPDATE restaurant_settings
SET 
  min_order_amount_pickup = COALESCE(min_order_amount_pickup, min_order_amount),
  min_order_amount_delivery = COALESCE(min_order_amount_delivery, min_order_amount)
WHERE min_order_amount IS NOT NULL;

